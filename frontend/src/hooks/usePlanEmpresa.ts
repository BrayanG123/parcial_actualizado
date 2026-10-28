import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { empresaService } from '../services/empresa.service';
import type { Funcionalidades } from '../types/saas';
import { claves } from './claves';

/**
 * Plan y suscripcion de la empresa del usuario. Solo es UX (ocultar opciones y avisar):
 * el backend vuelve a validar el plan en cada peticion.
 */
export function usePlanEmpresa() {
  const { autenticado, sesionOffline } = useAuth();
  const consulta = useQuery({
    queryKey: claves.planEmpresa,
    queryFn: empresaService.plan,
    enabled: autenticado && !sesionOffline,
    staleTime: 60 * 1000,
    retry: false,
  });
  const plan = consulta.data;
  return {
    ...consulta,
    plan,
    soloLectura: plan?.solo_lectura ?? false,
    /** Sin datos (cargando, offline o error) no se oculta nada. */
    tieneFuncion: (funcion: keyof Funcionalidades) =>
      plan?.plan ? plan.plan.funcionalidades[funcion] === true : true,
  };
}
