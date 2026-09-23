import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '../../context/ToastContext';
import {
  activarPush,
  estadoActual,
  PUSH_CONFIGURADO,
  sincronizarPush,
  type EstadoPush,
} from '../../lib/push';

interface MensajeServiceWorker {
  tipo?: 'PUSH' | 'NAVEGAR';
  titulo?: string;
  cuerpo?: string;
  url?: string;
  datos?: { tipo?: string };
}

const TEXTO: Record<Exclude<EstadoPush, 'no-disponible'>, string> = {
  pendiente: 'Activar avisos de compras',
  activo: 'Avisos de compras activos',
  bloqueado: 'Avisos bloqueados en el navegador',
};

/**
 * Avisos push de compras para administradores, encargados y cajeros.
 * Muestra el boton para activarlos y, con la pestana abierta, convierte cada
 * push en un aviso dentro de la app y refresca las listas de ventas.
 */
export function AvisosPush() {
  const [estado, setEstado] = useState<EstadoPush>(estadoActual);
  const [cargando, setCargando] = useState(false);
  const toast = useToast();
  const navegar = useNavigate();
  const queryClient = useQueryClient();

  // Con el permiso ya concedido, se renueva el registro en silencio (FCM rota los tokens).
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted')
      void sincronizarPush().then(setEstado).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const alMensaje = (evento: MessageEvent<MensajeServiceWorker>) => {
      const m = evento.data;
      if (m?.tipo === 'PUSH') {
        toast.exito(m.cuerpo ? `${m.titulo}: ${m.cuerpo}` : (m.titulo ?? 'Nueva compra'));
        if (m.datos?.tipo === 'VENTA') void queryClient.invalidateQueries({ queryKey: ['ventas'] });
      } else if (m?.tipo === 'NAVEGAR' && m.url) navegar(m.url);
    };
    navigator.serviceWorker.addEventListener('message', alMensaje);
    return () => navigator.serviceWorker.removeEventListener('message', alMensaje);
  }, [toast, navegar, queryClient]);

  if (!PUSH_CONFIGURADO || estado === 'no-disponible') return null;

  async function activar() {
    if (estado !== 'pendiente' || cargando) return;
    setCargando(true);
    try {
      const nuevo = await activarPush();
      setEstado(nuevo);
      if (nuevo === 'activo') toast.exito('Listo: te avisaremos cuando un cliente compre.');
      else if (nuevo === 'bloqueado')
        toast.error('El navegador bloqueo las notificaciones. Habilitalas desde el candado de la barra de direcciones.');
    } catch {
      toast.error('No pudimos activar los avisos. Intenta de nuevo.');
    } finally {
      setCargando(false);
    }
  }

  return (
    <button
      type="button"
      className={`fs-btn fs-btn--s ${estado === 'pendiente' ? 'fs-btn--contorno' : 'fs-btn--fantasma'}`}
      onClick={activar}
      disabled={cargando || estado !== 'pendiente'}
      title={TEXTO[estado]}
      aria-label={TEXTO[estado]}
    >
      {estado === 'pendiente' ? (cargando ? 'Activando...' : 'Activar avisos') : estado === 'activo' ? 'Avisos activos' : 'Bloqueados'}
    </button>
  );
}
