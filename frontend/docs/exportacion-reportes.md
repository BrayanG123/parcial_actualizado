# Exportación de reportes

En la web, **Reportes > Exportar PDF / Exportar Excel** descarga el conjunto de reportes con los filtros seleccionados. En **Reportes por voz o texto**, los botones aparecen junto al resultado generado.

## Contenido

- Ventas: resumen, evolución diaria, horas, sucursales y canales.
- Ranking: primeras 8 prendas en Reportes; límite interpretado en IA.
- Reservas: cantidades por estado.
- Caja: resumen, cajas, todos los turnos recibidos y arqueo (sin el recorte visual de 20 turnos).
- Inventario: resumen, sucursales y todas las filas del filtro, recorriendo páginas de 100.

PDF: tablas paginadas con encabezados, filtros, fecha y numeración.
Excel: archivo XLSX real, hoja Contexto y hojas por sección, números y fechas tipados, filtros y encabezados congelados. Los textos se escriben como texto, incluso si empiezan por "="; no se convierten en fórmulas.

## Filtros y alcance

Reportes consulta nuevamente la API al exportar; captura período, sucursal, canal, umbral y filtro de bajo stock al pulsar. Canal afecta ventas/ranking; reservas/caja usan período/sucursal; inventario refleja stock actual sin período/canal.

Los reportes IA exportan el resultado mostrado. Inventario IA vuelve a consultar todas sus páginas conservando sucursal, umbral y bajo stock; su resumen textual sigue perteneciendo a la consulta original y se identifica así en el archivo.

El backend sigue autorizando las consultas. El navegador no envía reportes a servicios externos. Un cambio de sesión impide la descarga. Si falla una sección o página, no se descarga un reporte incompleto.

Se detectan cambios de total y IDs duplicados durante paginación. No hay una transacción global que congele todos los endpoints: movimientos concurrentes pueden modificar cifras durante la consulta. Para auditoría de un instante exacto haría falta un snapshot backend.

Los adaptadores conservan la moneda principal y las exclusiones existentes: ventas identifica monedas omitidas; ranking conserva su moneda; cada turno conserva la propia. Las celdas nulas de arqueo quedan vacías.

## Implementación y validación

- UI: BotonesExportar, PaginaReportes y PaginaReporteIA.
- datos-exportacion.ts: carga, paginación y sesión.
- modelo-exportacion.ts: columnas y proyecciones comunes.
- archivo-exportacion.ts: jsPDF + AutoTable y ExcelJS, importados bajo demanda.
- Sin endpoints nuevos, migraciones ni configuración del servidor.

Pruebas: exportacion-datos.test.ts, exportacion-archivos.test.ts y exportacion-ui.test.tsx, además de las suites de reportes/IA existentes.
Los tests reabren un XLSX real y generan PDF con datos ficticios; REPORT_EXPORT_QA_DIR permite guardar muestras temporales para revisión.

```powershell
npm ci
npm test -- test/exportacion-datos.test.ts test/exportacion-archivos.test.ts test/exportacion-ui.test.tsx test/reportes.test.ts test/ia.test.ts test/reportes-ia-ui.test.tsx --pool=forks --maxWorkers=1
npm run build
npm run lint
```

Dependencias: [jsPDF](https://github.com/parallax/jsPDF), [AutoTable](https://github.com/simonbengtsson/jsPDF-AutoTable), [ExcelJS](https://github.com/exceljs/exceljs).
