# Manual: desplegar el frontend de FashionStore en Azure

Esta guía publica en Azure Container Apps la imagen que ya está disponible:

```text
tiendaropa.azurecr.io/frontend:latest
digest: sha256:fd58bd1f5b890e05aae8ed94ae175480a7494a50ff562fd231bbed2dc1193dd2
```

Se asume que el backend fue desplegado primero siguiendo el
[manual del backend](./despliegue-azure.md), con estos nombres:

```text
Entorno de Container Apps: tiendaropa-env
Backend:                   tiendaropa-backend
Identidad para ACR:        tiendaropa-acr-pull
```

Si utilizaste otros nombres, reemplázalos en los comandos.

## 1. Arquitectura

```text
Navegador
   |
   | HTTPS: / y /api/v1/*
   v
tiendaropa-frontend (nginx, puerto 8080)
   |
   | HTTP interno: /api/v1/*
   v
tiendaropa-backend (NestJS, puerto 3000)
```

El navegador siempre utiliza el dominio público del frontend. Las solicitudes
a `/api/*` llegan a nginx y nginx las reenvía al backend por la red interna del
mismo entorno de Container Apps. Esto ofrece tres ventajas:

- no hay una llamada CORS desde el navegador;
- la PWA conserva una sola URL de origen;
- la URL del backend se configura al arrancar el contenedor, sin reconstruir la imagen.

## 2. Resultado de la revisión técnica

El frontend y su `Dockerfile` son adecuados para Azure Container Apps:

- El build de Vite usa `VITE_API_URL=/api/v1` y `VITE_USE_MOCKS=false`.
- `.dockerignore` impide copiar los archivos `.env` locales a la imagen.
- nginx escucha en el puerto 8080 y expone ese puerto.
- `API_UPSTREAM` es una variable de ejecución; la imagen oficial de nginx la
  sustituye en `nginx/default.conf.template` al arrancar.
- `proxy_pass` conserva `/api/v1/...`, por lo que `API_UPSTREAM` debe contener
  solamente el esquema y host del backend, sin `/api/v1` al final.
- Las rutas de React Router vuelven a `index.html`.
- `sw.js`, `manifest.webmanifest` e `index.html` no se almacenan con caché larga;
  los assets con hash sí se almacenan como inmutables.
- El service worker no cachea peticiones `/api`, evitando datos obsoletos.
- nginx admite cargas de hasta 6 MB; el backend admite fotos de hasta 5 MB.
- La imagen observada ocupa aproximadamente 75.3 MB en disco y 21.3 MB de
  contenido comprimido.

La imagen base de nginx declara los puertos 80 y 8080, pero esta configuración
escucha en **8080**. Ese es el puerto que debe indicarse a Azure.

Validación local realizada el 22 de septiembre de 2026:

- `npm run build`: correcto.
- `npm run lint`: correcto, con 7 advertencias no bloqueantes de React.
- Comprobación TypeScript de pruebas: correcta.
- Vitest: 26 archivos y 149 pruebas correctas.
- Configuración de la imagen: nginx 1.27, `API_UPSTREAM=http://backend:3000`,
  entrypoint oficial de nginx y puerto 8080 expuesto.

## 3. Recuperar la configuración de Azure

Abre una nueva consola PowerShell, inicia sesión y selecciona tu suscripción
estudiantil si tienes más de una:

```powershell
az login
az account list -o table
az account set --subscription '<NOMBRE-O-ID-DE-AZURE-FOR-STUDENTS>'
```

Define los nombres. El grupo y la región se obtienen automáticamente del ACR:

```powershell
$ACR = 'tiendaropa'
$RG = az acr show --name $ACR --query resourceGroup -o tsv
$LOC = az acr show --name $ACR --query location -o tsv

$ENV_NAME = 'tiendaropa-env'
$BACKEND_APP = 'tiendaropa-backend'
$FRONTEND_APP = 'tiendaropa-frontend'
$IDENTITY = 'tiendaropa-acr-pull'
$IMAGE = "${ACR}.azurecr.io/frontend:latest"

Write-Host "Grupo: $RG"
Write-Host "Región: $LOC"
Write-Host "Imagen: $IMAGE"
```

Comprueba que la imagen existe:

```powershell
az acr repository show-tags `
  --name $ACR `
  --repository frontend `
  -o table

az acr repository show-manifests `
  --name $ACR `
  --repository frontend `
  -o table
```

## 4. Comprobar backend, entorno e identidad

Obtén los identificadores de los recursos creados con el manual anterior:

```powershell
$ENV_ID = az containerapp env show `
  --resource-group $RG `
  --name $ENV_NAME `
  --query id -o tsv

$BACKEND_ENV_ID = az containerapp show `
  --resource-group $RG `
  --name $BACKEND_APP `
  --query properties.environmentId -o tsv

$IDENTITY_ID = az identity show `
  --resource-group $RG `
  --name $IDENTITY `
  --query id -o tsv

$BACKEND_FQDN = az containerapp show `
  --resource-group $RG `
  --name $BACKEND_APP `
  --query properties.configuration.ingress.fqdn -o tsv

Write-Host "Backend: https://$BACKEND_FQDN/api/v1"
```

Comprueba que `$ENV_ID` y `$BACKEND_ENV_ID` sean iguales:

```powershell
if ($ENV_ID -ne $BACKEND_ENV_ID) {
  throw 'El backend no pertenece a tiendaropa-env. Ajusta ENV_NAME antes de continuar.'
}
```

Si `az identity show` indica que la identidad no existe, vuelve a ejecutar la
sección **Crear el entorno y la identidad para ACR** del manual del backend.

## 5. Crear la Container App del frontend

Como frontend y backend pertenecen al mismo entorno, utiliza el nombre corto
del backend. Azure Container Apps lo resuelve internamente:

```powershell
$API_UPSTREAM = "http://$BACKEND_APP"
```

No agregues `/api/v1` a esta variable. nginx ya recibe y conserva la ruta
completa solicitada por el navegador.

Crea la aplicación:

```powershell
$WEB_FQDN = az containerapp create `
  --resource-group $RG `
  --name $FRONTEND_APP `
  --environment $ENV_NAME `
  --image $IMAGE `
  --user-assigned $IDENTITY_ID `
  --registry-server "${ACR}.azurecr.io" `
  --registry-identity $IDENTITY_ID `
  --ingress external `
  --target-port 8080 `
  --transport auto `
  --min-replicas 0 `
  --max-replicas 1 `
  --cpu 0.25 `
  --memory 0.5Gi `
  --env-vars "API_UPSTREAM=$API_UPSTREAM" `
  --query properties.configuration.ingress.fqdn `
  --output tsv

Write-Host "Web: https://$WEB_FQDN"
Write-Host "API mediante nginx: https://$WEB_FQDN/api/v1"
```

El frontend es estático y nginx inicia rápidamente, por lo que `min-replicas=0`
reduce el consumo del crédito estudiantil. Antes de una presentación puedes
evitar el arranque en frío temporalmente:

```powershell
az containerapp update `
  --resource-group $RG `
  --name $FRONTEND_APP `
  --min-replicas 1 `
  --max-replicas 1
```

## 6. Verificar web, proxy y PWA

Comprueba primero la página principal:

```powershell
$WEB_RESPONSE = Invoke-WebRequest -Uri "https://$WEB_FQDN"
$WEB_RESPONSE.StatusCode
```

Debe devolver `200`. Comprueba después el proxy hacia NestJS:

```powershell
Invoke-RestMethod -Uri "https://$WEB_FQDN/api/v1"
```

La respuesta debe contener `Hello World!`. Esto verifica al mismo tiempo:

1. ingreso HTTPS del frontend;
2. nginx en el puerto 8080;
3. resolución interna de `tiendaropa-backend`;
4. disponibilidad del backend.

Comprueba los archivos de la PWA:

```powershell
(Invoke-WebRequest -Uri "https://$WEB_FQDN/manifest.webmanifest").StatusCode
(Invoke-WebRequest -Uri "https://$WEB_FQDN/sw.js").StatusCode
```

Finalmente abre `https://$WEB_FQDN` en una ventana privada y prueba registro,
login, catálogo y una consulta autenticada.

## 7. Logs y diagnóstico

Estado y revisiones:

```powershell
az containerapp show `
  --resource-group $RG `
  --name $FRONTEND_APP `
  --query "{fqdn:properties.configuration.ingress.fqdn,provisioning:properties.provisioningState,running:properties.runningStatus}" `
  -o table

az containerapp revision list `
  --resource-group $RG `
  --name $FRONTEND_APP `
  -o table
```

Logs del contenedor y del sistema:

```powershell
az containerapp logs show -g $RG -n $FRONTEND_APP --type console --follow
az containerapp logs show -g $RG -n $FRONTEND_APP --type system --tail 100
```

`Ctrl+C` detiene el seguimiento de logs.

## 8. CORS y URL del backend

Con esta imagen el navegador llama a `/api/v1` sobre el mismo dominio del
frontend, así que no depende de CORS para esas solicitudes. Configurar la URL
del frontend en `CORS_ORIGINS` del backend es válido, pero no es obligatorio
mientras todas las llamadas web pasen por nginx.

Sí debes mantener en `CORS_ORIGINS` los orígenes que llamen directamente al
FQDN del backend, por ejemplo un servidor Vite local. Las aplicaciones móviles
no están sujetas a CORS del navegador.

Si frontend y backend se despliegan en entornos distintos, el nombre corto no
funcionará. En ese caso cambia el upstream al FQDN HTTPS del backend:

```powershell
az containerapp update `
  --resource-group $RG `
  --name $FRONTEND_APP `
  --set-env-vars "API_UPSTREAM=https://$BACKEND_FQDN"
```

Cambiar `API_UPSTREAM` crea una nueva revisión, pero no requiere volver a
compilar ni publicar la imagen.

## 9. Stripe, Cloudinary y secretos

El frontend no necesita secretos de Stripe, Cloudinary, Gemini ni de la base de
datos. Todos deben permanecer en el backend.

- La clave publicable de Stripe se obtiene mediante la API del backend.
- Las cargas de Cloudinary pasan por el backend.
- La clave de Gemini nunca debe incluirse en una variable `VITE_*`.
- `API_UPSTREAM` no es un secreto; solo es una dirección interna.

Si se configura el webhook de Stripe usando el mismo dominio público de la web,
la dirección es:

```text
https://<FQDN-DEL-FRONTEND>/api/v1/payments/stripe/webhook
```

nginx reenviará la solicitud al backend.

## 10. Publicar una nueva versión

Para evitar ambigüedad y facilitar el rollback, no reutilices `latest`. Desde la
carpeta `frontend`:

```powershell
$TAG = Get-Date -Format 'yyyyMMdd-HHmm'
$NEW_IMAGE = "tiendaropa.azurecr.io/frontend:$TAG"

docker build -t $NEW_IMAGE .
docker push $NEW_IMAGE

az containerapp update `
  --resource-group $RG `
  --name $FRONTEND_APP `
  --image $NEW_IMAGE
```

Prueba la nueva revisión en una ventana privada. Si el navegador conserva la
versión anterior, recarga forzadamente o cierra todas las pestañas de la PWA
para permitir que el nuevo service worker tome control.

Lista las revisiones disponibles:

```powershell
az containerapp revision list -g $RG -n $FRONTEND_APP -o table
```

## 11. Dominio propio (opcional)

La dirección `azurecontainerapps.io` ya incluye HTTPS y es suficiente para la
presentación. Si tienes un dominio propio:

1. Abre la Container App `tiendaropa-frontend` en el Portal de Azure.
2. Entra en **Networking > Custom domains**.
3. Agrega un subdominio, por ejemplo `tienda.tudominio.com`.
4. Crea en tu proveedor DNS el registro CNAME y el registro TXT indicados por Azure.
5. Selecciona un certificado administrado gratuito y espera la validación.

No cambies `VITE_API_URL`: al usar `/api/v1`, el proxy seguirá funcionando con
el dominio nuevo.

## 12. Ahorrar crédito y limpiar recursos

Después de una presentación vuelve a permitir escala a cero:

```powershell
az containerapp update `
  --resource-group $RG `
  --name $FRONTEND_APP `
  --min-replicas 0 `
  --max-replicas 1
```

Para eliminar solamente el frontend:

```powershell
az containerapp delete `
  --resource-group $RG `
  --name $FRONTEND_APP `
  --yes
```

No elimines `tiendaropa-env`, `tiendaropa-acr-pull`, PostgreSQL ni el grupo de
recursos mientras el backend los utilice. Tampoco elimines el grupo completo si
quieres conservar el ACR `tiendaropa` y las imágenes publicadas.

## 13. Problemas frecuentes

### La revisión muestra `ImagePullBackOff` o `UNAUTHORIZED`

La identidad `tiendaropa-acr-pull` debe estar asignada al frontend y tener el
rol `AcrPull` sobre el ACR:

```powershell
$ACR_ID = az acr show -n $ACR --query id -o tsv
$PRINCIPAL_ID = az identity show -g $RG -n $IDENTITY --query principalId -o tsv
az role assignment list --assignee $PRINCIPAL_ID --scope $ACR_ID -o table
az containerapp registry list -g $RG -n $FRONTEND_APP -o table
```

### La página abre, pero `/api/v1` devuelve 502

Comprueba que ambas aplicaciones estén en el mismo entorno, que el backend se
llame exactamente `tiendaropa-backend` y que tenga ingreso habilitado:

```powershell
az containerapp show -g $RG -n $BACKEND_APP --query properties.environmentId -o tsv
az containerapp show -g $RG -n $FRONTEND_APP --query properties.environmentId -o tsv
az containerapp ingress show -g $RG -n $BACKEND_APP -o table
```

También puedes usar temporalmente `API_UPSTREAM=https://$BACKEND_FQDN` para
descartar un problema con el nombre corto.

### Azure informa que el puerto no responde

El target port debe ser `8080`, no `80`. Comprueba además que la variable
`API_UPSTREAM` tenga esquema (`http://` o `https://`).

### El navegador sigue mostrando una versión anterior

Prueba en una ventana privada. Si allí funciona, cierra las pestañas instaladas
de la PWA, recarga forzadamente y revisa **DevTools > Application > Service
Workers**. `sw.js` está servido con `Cache-Control: no-cache`, pero un service
worker anterior puede mantener abierta una versión hasta que deje de controlar
todas las pestañas.

### Las rutas como `/admin` devuelven 404

La imagen revisada ya incluye `try_files $uri $uri/ /index.html`. Si ocurre,
confirma que Azure está utilizando el digest indicado al inicio de este manual y
que el target port es 8080.

## Referencias oficiales

- [Comunicación entre aplicaciones de Container Apps](https://learn.microsoft.com/azure/container-apps/connect-apps)
- [Desplegar una imagen existente en Container Apps](https://learn.microsoft.com/azure/container-apps/get-started-existing-container-image)
- [Usar una identidad administrada para descargar imágenes de ACR](https://learn.microsoft.com/azure/container-apps/managed-identity-image-pull)
- [Variables de entorno de Container Apps](https://learn.microsoft.com/azure/container-apps/environment-variables)
- [Administrar revisiones de Container Apps](https://learn.microsoft.com/azure/container-apps/revisions-manage)
- [Dominios personalizados y certificados](https://learn.microsoft.com/azure/container-apps/custom-domains-certificates)
