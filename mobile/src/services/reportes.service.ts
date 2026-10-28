/**
 * Reportes generativos (F8.6). NestJS interpreta la solicitud, valida la intencion contra su
 * lista blanca y calcula los datos con los permisos del usuario (empresa, rol y sucursal).
 *   POST /ai/reports         -> tabla, especificacion de grafico y narrativa
 *   GET  /tenant/subscription -> funcionalidades del plan (aiReports)
 */
import { api } from '../api/http';
import { endpoints } from '../api/endpoints';
import { adaptarReporte, type ReporteIABackend, type ReporteMovil } from '../features/reportes/modelo';

interface SuscripcionBackend {
  plan: { features?: Record<string, boolean> } | null;
}

export const reportesService = {
  async generar(pregunta: string): Promise<ReporteMovil> {
    return adaptarReporte(
      await api.post<ReporteIABackend>(endpoints.ia.reportes, { question: pregunta }, { timeout: 45000 }),
    );
  },
  async incluyeReportesIA(): Promise<boolean> {
    const datos = await api.get<SuscripcionBackend>(endpoints.empresa.suscripcion);
    return Boolean(datos.plan?.features?.aiReports);
  },
};
