-- F10.3: los reportes filtran ventas por empresa, estado y fecha de confirmacion.
-- Medido con 180 000 ventas: un reporte de 30 dias de una empresa chica baja de ~10 ms
-- (lectura de todas sus ventas) a ~1,4 ms.
CREATE INDEX "ventas_id_empresa_estado_fecha_confirmacion_idx" ON "ventas"("id_empresa", "estado", "fecha_confirmacion");
