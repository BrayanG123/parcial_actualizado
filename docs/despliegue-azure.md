# Manual: desplegar el backend de FashionStore en Azure

Esta guía despliega la imagen que ya está publicada:

```text
tiendaropa.azurecr.io/backend:latest
digest: sha256:2f278663b9f0cb837bda9e42817c357d81849914a0b9d5793b09e6d784c9b7a0
```

Después de completar el backend, continúa con el
[manual de despliegue del frontend](./despliegue-azure-frontend.md).

La solución recomendada para la cuenta estudiantil es:

| Componente | Servicio de Azure | Configuración |
|---|---|---|
| Imagen Docker | Azure Container Registry existente | `tiendaropa.azurecr.io/backend:latest` |
| API NestJS | Azure Container Apps, plan Consumption | Puerto 3000, ingreso HTTPS externo |
| Base de datos | Azure Database for PostgreSQL Flexible Server | PostgreSQL 17, SKU `Standard_B1ms`, 32 GiB |
| Acceso al registro | Identidad administrada | Rol `AcrPull`, sin guardar la clave del ACR |

> **Costo:** Azure for Students entrega USD 100 de crédito por 12 meses. Container Apps tiene una concesión gratuita mensual en Consumption, pero PostgreSQL y el almacenamiento del ACR pueden consumir crédito. Configura un presupuesto antes de continuar y elimina o detén los recursos que no uses.

## 1. Resultado de la revisión técnica

El backend y el `Dockerfile` son aptos para Azure Container Apps:

- NestJS escucha el valor de `PORT`; la imagen fija `PORT=3000` y expone ese mismo puerto.
- La aplicación escucha en todas las interfaces del contenedor, no solo en `localhost`.
- El prefijo predeterminado es `/api/v1`, y `GET /api/v1` sirve como comprobación básica.
- La imagen se ejecuta con el usuario Linux no privilegiado `node`.
- El `Dockerfile` usa dos etapas y no copia `.env`; `.dockerignore` excluye secretos, fuentes, pruebas y artefactos locales.
- `docker-entrypoint.sh` ejecuta `prisma migrate deploy` cuando `RUN_MIGRATIONS=true` y luego inicia `node dist/main.js`.
- `DATABASE_URL` y `JWT_SECRET` son obligatorias. `JWT_SECRET` debe tener al menos 32 caracteres.
- Stripe exige las tres variables `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` y `STRIPE_PUBLISHABLE_KEY`, o ninguna. Cloudinary aplica la misma regla a sus tres variables.
- Si `CORS_ORIGINS` queda vacío, el backend acepta cualquier origen. En Azure conviene definirlo explícitamente.

Observaciones importantes:

1. La imagen local ocupa aproximadamente 1.13 GB en disco (246 MB de contenido comprimido), porque conserva dependencias de desarrollo para ejecutar Prisma y los seeds. Funciona para una demostración académica, pero aumenta el tiempo de descarga y arranque.
2. La API contiene tareas periódicas de vencimiento y conciliación dentro del proceso. Por eso este manual usa exactamente una réplica (`min=1`, `max=1`). Si se escala a varias réplicas, esas tareas deben trasladarse a un job o usar un bloqueo distribuido.
3. El `HEALTHCHECK` de Docker comprueba que `/api/v1` responda, pero Azure Container Apps añade por defecto sus propias sondas TCP sobre el puerto de ingreso. Para una comprobación completa de base de datos sería conveniente crear después un endpoint `/health` específico.
4. Para futuras versiones no conviene reutilizar `latest`; usa etiquetas únicas como `20260922-1400`.

Validación local realizada el 22 de septiembre de 2026:

- `npm run build`: correcto.
- `npm test`: 37 archivos y 184 pruebas correctas.
- `npm run lint`: correcto.
- Configuración observada en la imagen: usuario `node`, puerto 3000, `ENTRYPOINT ./docker-entrypoint.sh` y health check presente.

## 2. Preparar Azure CLI en Windows

En este equipo `az` todavía no está instalado. En PowerShell:

```powershell
winget install --exact --id Microsoft.AzureCLI
```

Cierra y vuelve a abrir PowerShell. Después ejecuta:

```powershell
az login
az account list -o table
az account show -o table
```

Si tienes varias suscripciones, selecciona expresamente la estudiantil:

```powershell
az account set --subscription '<NOMBRE-O-ID-DE-AZURE-FOR-STUDENTS>'
```

Instala o actualiza la extensión y registra los proveedores. El registro puede tardar varios minutos:

```powershell
az extension add --name containerapp --upgrade
az provider register --namespace Microsoft.App --wait
az provider register --namespace Microsoft.OperationalInsights --wait
az provider register --namespace Microsoft.DBforPostgreSQL --wait
az provider register --namespace Microsoft.ManagedIdentity --wait
```

## 3. Definir los nombres del despliegue

Los siguientes comandos descubren automáticamente el grupo de recursos y la región del ACR `tiendaropa`; no necesitas adivinarlos:

```powershell
$ACR = 'tiendaropa'
$RG = az acr show --name $ACR --query resourceGroup -o tsv
$LOC = az acr show --name $ACR --query location -o tsv

$ENV_NAME = 'tiendaropa-env'
$APP = 'tiendaropa-backend'
$IDENTITY = 'tiendaropa-acr-pull'
$PG = 'tiendaropa-pg-' + (Get-Random -Minimum 1000 -Maximum 9999)
$IMAGE = "${ACR}.azurecr.io/backend:latest"

Write-Host "Grupo: $RG"
Write-Host "Región: $LOC"
Write-Host "PostgreSQL: $PG"
Write-Host "Imagen: $IMAGE"
```

Guarda el valor mostrado para `$PG`; el nombre generado se utiliza en los pasos posteriores. No cierres esta consola hasta finalizar.

Comprueba que la imagen realmente existe en ACR:

```powershell
az acr repository show-tags --name $ACR --repository backend -o table
az acr repository show-manifests --name $ACR --repository backend -o table
```

## 4. Crear PostgreSQL Flexible Server

Genera una contraseña compatible con una URL y un secreto JWT. No publiques estos valores ni los guardes en Git:

```powershell
$PG_USER = 'fsadmin'
$PG_PASSWORD = 'Aa9' + [guid]::NewGuid().ToString('N')
$JWT_SECRET = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
```

Crea el servidor más pequeño adecuado para la demostración y la base de datos:

```powershell
az postgres flexible-server create `
  --resource-group $RG `
  --name $PG `
  --location $LOC `
  --tier Burstable `
  --sku-name Standard_B1ms `
  --version 17 `
  --storage-size 32 `
  --backup-retention 7 `
  --admin-user $PG_USER `
  --admin-password $PG_PASSWORD `
  --public-access 0.0.0.0 `
  --yes

az postgres flexible-server db create `
  --resource-group $RG `
  --server-name $PG `
  --database-name tienda_ropa
```

`0.0.0.0` no abre PostgreSQL a todo Internet: crea la regla especial que admite conexiones provenientes de servicios de Azure. Aun así, también incluye servicios pertenecientes a otras suscripciones, por lo que la contraseña debe ser fuerte y exclusiva. Para un entorno de producción se recomienda red privada.

Construye la cadena con TLS obligatorio:

```powershell
$DATABASE_URL = "postgresql://${PG_USER}:${PG_PASSWORD}@${PG}.postgres.database.azure.com:5432/tienda_ropa?schema=public&sslmode=require"
```

## 5. Crear el entorno y la identidad para ACR

```powershell
az containerapp env create `
  --resource-group $RG `
  --name $ENV_NAME `
  --location $LOC

az identity create `
  --resource-group $RG `
  --name $IDENTITY

$IDENTITY_ID = az identity show `
  --resource-group $RG `
  --name $IDENTITY `
  --query id -o tsv

$IDENTITY_PRINCIPAL_ID = az identity show `
  --resource-group $RG `
  --name $IDENTITY `
  --query principalId -o tsv

$ACR_ID = az acr show --name $ACR --query id -o tsv

az role assignment create `
  --assignee-object-id $IDENTITY_PRINCIPAL_ID `
  --assignee-principal-type ServicePrincipal `
  --role AcrPull `
  --scope $ACR_ID
```

La asignación del rol puede tardar uno o dos minutos en propagarse. Esta identidad solo necesita lectura de imágenes; no puede publicar ni borrar imágenes.

## 6. Crear la Container App

Para comenzar, se permiten solamente los frontends locales conocidos. Cuando publiques el frontend, reemplaza esta lista por su URL HTTPS:

```powershell
$CORS = 'http://localhost:5173,http://localhost:8081'
```

Crea la aplicación con una sola réplica:

```powershell
$FQDN = az containerapp create `
  --resource-group $RG `
  --name $APP `
  --environment $ENV_NAME `
  --image $IMAGE `
  --user-assigned $IDENTITY_ID `
  --registry-server "${ACR}.azurecr.io" `
  --registry-identity $IDENTITY_ID `
  --ingress external `
  --target-port 3000 `
  --transport auto `
  --min-replicas 1 `
  --max-replicas 1 `
  --cpu 0.5 `
  --memory 1Gi `
  --secrets "database-url=$DATABASE_URL" "jwt-secret=$JWT_SECRET" `
  --env-vars `
    NODE_ENV=production `
    PORT=3000 `
    API_PREFIX=api/v1 `
    RUN_MIGRATIONS=true `
    DATABASE_URL=secretref:database-url `
    DATABASE_POOL_MAX=5 `
    JWT_SECRET=secretref:jwt-secret `
    CORS_ORIGINS=$CORS `
    AI_PROVIDER=none `
    RESERVATION_TIME_ZONE=America/La_Paz `
    SALES_CURRENCY=BOB `
  --query properties.configuration.ingress.fqdn `
  --output tsv

Write-Host "API: https://$FQDN/api/v1"
```

En el primer arranque, el entrypoint aplicará todas las migraciones Prisma. Borra de la sesión de PowerShell las variables sensibles que ya se almacenaron como secretos en Container Apps:

```powershell
Remove-Variable DATABASE_URL, PG_PASSWORD, JWT_SECRET
```

## 7. Verificar el despliegue

Consulta la API:

```powershell
Invoke-RestMethod -Uri "https://$FQDN/api/v1"
```

La respuesta debe contener `Hello World!`. Comprueba también el estado y las revisiones:

```powershell
az containerapp show `
  --resource-group $RG `
  --name $APP `
  --query "{fqdn:properties.configuration.ingress.fqdn,provisioning:properties.provisioningState,running:properties.runningStatus}" `
  -o table

az containerapp revision list `
  --resource-group $RG `
  --name $APP `
  -o table
```

Para seguir los logs:

```powershell
az containerapp logs show `
  --resource-group $RG `
  --name $APP `
  --type console `
  --follow
```

Al inicio debe aparecer `Aplicando migraciones de Prisma...`. Usa `Ctrl+C` para salir del seguimiento de logs.

## 8. Cargar datos de demostración (opcional)

El seed de demostración se bloquea intencionalmente con `NODE_ENV=production`. Para ejecutarlo una sola vez sin cambiar permanentemente el entorno de la API:

```powershell
$ADMIN_PASSWORD = 'Adm9' + [guid]::NewGuid().ToString('N')
$DEMO_PASSWORD = 'Dem9' + [guid]::NewGuid().ToString('N')

az containerapp secret set `
  --resource-group $RG `
  --name $APP `
  --secrets `
    "seed-admin-password=$ADMIN_PASSWORD" `
    "seed-demo-password=$DEMO_PASSWORD"

az containerapp update `
  --resource-group $RG `
  --name $APP `
  --set-env-vars `
    SEED_ADMIN_EMAIL=admin@fashionstore.com `
    SEED_ADMIN_PASSWORD=secretref:seed-admin-password `
    SEED_DEMO_PASSWORD=secretref:seed-demo-password

az containerapp exec `
  --resource-group $RG `
  --name $APP `
  --command "sh -c 'NODE_ENV=development npx tsx prisma/seed-demo.ts'"
```

Anota de forma segura `$ADMIN_PASSWORD`; será la contraseña del administrador. Cuando aparezca el resumen exitoso del seed, retira sus variables y secretos del contenedor:

```powershell
az containerapp update `
  --resource-group $RG `
  --name $APP `
  --remove-env-vars SEED_ADMIN_EMAIL SEED_ADMIN_PASSWORD SEED_DEMO_PASSWORD

az containerapp secret remove `
  --resource-group $RG `
  --name $APP `
  --secret-names seed-admin-password seed-demo-password

Remove-Variable ADMIN_PASSWORD, DEMO_PASSWORD
```

## 9. Conectar el frontend y servicios opcionales

Cuando conozcas la URL pública del frontend, actualiza CORS. No agregues `/` al final y separa varios orígenes con comas, sin espacios:

```powershell
$FRONTEND_URL = 'https://TU-FRONTEND.azurecontainerapps.io'
az containerapp update `
  --resource-group $RG `
  --name $APP `
  --set-env-vars "CORS_ORIGINS=$FRONTEND_URL"
```

La URL que debe usar el frontend o la app móvil es:

```text
https://<FQDN-DEL-BACKEND>/api/v1
```

Para habilitar Gemini, guarda la clave como secreto:

```powershell
$GEMINI_KEY = '<TU-CLAVE>'
az containerapp secret set -g $RG -n $APP --secrets "gemini-key=$GEMINI_KEY"
az containerapp update -g $RG -n $APP --set-env-vars AI_PROVIDER=gemini GEMINI_API_KEY=secretref:gemini-key GEMINI_MODEL=gemini-3.6-flash
Remove-Variable GEMINI_KEY
```

Stripe y Cloudinary son opcionales, pero cada integración debe configurarse con sus tres variables a la vez. No escribas claves directamente como variables visibles; créalas con `az containerapp secret set` y enlázalas con `secretref:`.

## 10. Publicar una nueva versión

Desde la carpeta `backend`, usa una etiqueta única:

```powershell
az containerapp env create -g $RG -n $ENVNAME -l $LOC
$ACR_PWD = az acr credential show -n $ACR --query 'passwords[0].value' -o tsv

az containerapp create -g $RG -n fashionstore-api --environment $ENVNAME `
  --image "$ACR.azurecr.io/fashionstore-api:1" --registry-server "$ACR.azurecr.io" `
  --registry-username $ACR --registry-password $ACR_PWD `
  --target-port 3000 --ingress external --min-replicas 1 --max-replicas 1 --cpu 0.5 --memory 1Gi `
  --secrets database-url='<DATABASE_URL>' jwt-secret='<JWT_64_HEX>' gemini-key='<GEMINI_API_KEY>' `
  --env-vars NODE_ENV=production RUN_MIGRATIONS=true DATABASE_URL=secretref:database-url `
    JWT_SECRET=secretref:jwt-secret AI_PROVIDER=gemini GEMINI_API_KEY=secretref:gemini-key `
    GEMINI_MODEL=gemini-3.6-flash GEMINI_IMAGE_MODEL=gemini-3.1-flash-image FIREBASE_PROJECT_ID=shoping-a72ce FIREBASE_CLIENT_EMAIL=secretref:firebase-email FIREBASE_PRIVATE_KEY=secretref:firebase-key RESERVATION_TIME_ZONE=America/La_Paz SALES_CURRENCY=BOB
```

- `--min-replicas 1`: los procesos de vencimiento de reservas y checkouts corren dentro de la API. Además, una sola réplica mantiene coherente el límite de solicitudes de IA, que se guarda en memoria.
- Stripe y Cloudinary: agregar las tres variables de cada uno como secretos, igual que en `backend/.env`. Usa solo claves de prueba de Stripe.

```powershell
az postgres flexible-server start -g $RG -n $PG
az containerapp update -g $RG -n $APP --min-replicas 1 --max-replicas 1
```

En el Portal de Azure abre **Cost Management + Billing > Budgets** y crea alertas, por ejemplo al 50 %, 75 % y 90 % del crédito que quieras reservar para este proyecto.

## 12. Limpieza sin borrar accidentalmente el ACR

El ACR `tiendaropa` ya existía antes de este procedimiento. **No elimines todo el grupo de recursos** salvo que estés seguro de querer borrar también el registro y sus imágenes.

Para retirar solamente lo creado por esta guía:

```powershell
az containerapp delete -g $RG -n $APP --yes
az containerapp env delete -g $RG -n $ENV_NAME --yes
az postgres flexible-server delete -g $RG -n $PG --yes
az identity delete -g $RG -n $IDENTITY
```

La eliminación de PostgreSQL es destructiva. Exporta primero los datos que necesites conservar.

## 13. Problemas frecuentes

### `az` no se reconoce

Cierra y vuelve a abrir PowerShell después de instalar Azure CLI. Como alternativa, usa Cloud Shell desde el Portal de Azure.

### La suscripción estudiantil no permite crear el recurso

Comprueba la suscripción activa con `az account show -o table`. Si aparece un error de cuota o la SKU no está disponible, prueba otra región compatible y consulta **Subscriptions > Usage + quotas**. Mantén Container Apps y PostgreSQL en la misma región cuando sea posible.

### `UNAUTHORIZED` o `ImagePullBackOff`

Comprueba la identidad y el registro:

```powershell
az role assignment list --assignee $IDENTITY_PRINCIPAL_ID --scope $ACR_ID -o table
az containerapp registry list -g $RG -n $APP -o table
```

Debe existir el rol `AcrPull` y la identidad de registro debe ser `$IDENTITY_ID`. Espera dos minutos después de asignar el rol y vuelve a crear o actualizar la revisión.

### La revisión falla al iniciar

Mira los logs. Las causas más probables son una `DATABASE_URL` incorrecta, firewall de PostgreSQL, `JWT_SECRET` menor a 32 caracteres o grupos incompletos de variables Stripe/Cloudinary.

```powershell
az containerapp logs show -g $RG -n $APP --type system --tail 100
az containerapp logs show -g $RG -n $APP --type console --tail 100
```

### `P1001`, timeout o rechazo de PostgreSQL

Verifica que el servidor esté en estado `Ready`, que exista la base `tienda_ropa`, que la URL incluya `sslmode=require` y que exista la regla de firewall `0.0.0.0`:

```powershell
az acr build -r $ACR -t fashionstore-api:2 ./backend
az containerapp update -g $RG -n fashionstore-api --image "$ACR.azurecr.io/fashionstore-api:2"
# Al terminar la presentacion:
az group delete -n $RG --yes
```


## Notificaciones push (Firebase)

- **API:** agregar los secretos `firebase-email` y `firebase-key` (valores `client_email` y `private_key` del JSON de la cuenta de servicio) y las variables `FIREBASE_*` (ver [notificaciones](../backend/docs/notificaciones.md)). La migración `push_tokens` se aplica sola con `RUN_MIGRATIONS=true`.
- **Web:** construir la imagen con `--build-arg VITE_FIREBASE_API_KEY=... --build-arg VITE_FIREBASE_VAPID_KEY=...` (y el resto de `VITE_FIREBASE_*`), o construir con `frontend/.env` completo.
