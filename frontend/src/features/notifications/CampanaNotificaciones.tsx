import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import {
  useContadorNotificaciones,
  useMarcarNotificacion,
  useNotificaciones,
} from '../../hooks/useNotificaciones';
import { etiqueta, fechaHora } from '../../lib/format';
import type { Notificacion } from '../../types/notificaciones';
import '../../styles/notificaciones.css';

/** Avisos de reservas nuevas; al abrir uno se marca leido solo para el usuario actual. */
export function CampanaNotificaciones({ rutaReservas }: { rutaReservas: string }) {
  const [abierto, setAbierto] = useState(false);
  const [soloNoLeidas, setSoloNoLeidas] = useState(false);
  const contador = useContadorNotificaciones(true);
  const lista = useNotificaciones({ page: 1, page_size: 8, solo_no_leidas: soloNoLeidas }, abierto);
  const marcar = useMarcarNotificacion();
  const navegar = useNavigate();
  const toast = useToast();
  const contenedor = useRef<HTMLDivElement>(null);
  const anterior = useRef<number | null>(null);

  const noLeidas = contador.data ?? 0;

  useEffect(() => {
    if (contador.data === undefined) return;
    const nuevas = anterior.current === null ? 0 : contador.data - anterior.current;
    if (nuevas > 0)
      toast.mostrar(nuevas === 1 ? 'Llego una nueva reserva a tu sucursal.' : `Llegaron ${nuevas} reservas nuevas.`);
    anterior.current = contador.data;
  }, [contador.data, toast]);

  useEffect(() => {
    if (!abierto) return;
    const cerrar = (evento: MouseEvent | KeyboardEvent) => {
      if (evento instanceof KeyboardEvent ? evento.key === 'Escape' : !contenedor.current?.contains(evento.target as Node))
        setAbierto(false);
    };
    document.addEventListener('mousedown', cerrar);
    document.addEventListener('keydown', cerrar);
    return () => {
      document.removeEventListener('mousedown', cerrar);
      document.removeEventListener('keydown', cerrar);
    };
  }, [abierto]);

  function abrir(n: Notificacion) {
    if (!n.leida) marcar.mutate([n.id_notificacion]);
    setAbierto(false);
    navegar(`${rutaReservas}?reserva=${n.id_reserva}`);
  }

  const visiblesSinLeer = lista.data?.items.filter((n) => !n.leida).map((n) => n.id_notificacion) ?? [];

  return (
    <div className="fs-campana" ref={contenedor}>
      <button
        type="button"
        className="fs-btn fs-btn--fantasma fs-campana__boton"
        aria-label={noLeidas ? `Notificaciones: ${noLeidas} sin leer` : 'Notificaciones'}
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
      >
        &#128276;
        {noLeidas > 0 && <span className="fs-campana__contador">{noLeidas > 99 ? '99+' : noLeidas}</span>}
      </button>

      {abierto && (
        <div className="fs-campana__panel" role="dialog" aria-label="Notificaciones de reservas">
          <div className="fs-campana__cabecera">
            <strong>Reservas recibidas</strong>
            <label className="fs-fila fs-sub" style={{ gap: 6, fontSize: '0.8rem' }}>
              <input type="checkbox" checked={soloNoLeidas} onChange={(e) => setSoloNoLeidas(e.target.checked)} />
              Solo sin leer
            </label>
          </div>

          {lista.isPending && <p className="fs-sub" style={{ padding: 16 }}>Cargando...</p>}
          {lista.isError && (
            <p className="fs-campo-error" style={{ padding: 16 }}>
              {lista.error instanceof Error ? lista.error.message : 'No pudimos cargar las notificaciones.'}
            </p>
          )}
          {lista.data && lista.data.items.length === 0 && (
            <p className="fs-sub" style={{ padding: 16 }}>
              {soloNoLeidas ? 'No tienes avisos sin leer.' : 'Todavia no hay reservas notificadas.'}
            </p>
          )}
          {lista.data && lista.data.items.length > 0 && (
            <ul className="fs-campana__lista">
              {lista.data.items.map((n) => (
                <li key={n.id_notificacion}>
                  <button
                    type="button"
                    className={`fs-campana__item${n.leida ? '' : ' fs-campana__item--nueva'}`}
                    onClick={() => abrir(n)}
                  >
                    <strong>{n.titulo}</strong>
                    <span>
                      {n.mensaje} - {n.sucursal}
                    </span>
                    <span className="fs-sub">
                      Visita {fechaHora(n.horario_aproximado)} - {etiqueta(n.estado_reserva)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="fs-campana__pie">
            <button
              type="button"
              className="fs-btn fs-btn--fantasma fs-btn--s"
              disabled={visiblesSinLeer.length === 0 || marcar.isPending}
              onClick={() => marcar.mutate(visiblesSinLeer)}
            >
              Marcar visibles como leidas
            </button>
            <button
              type="button"
              className="fs-btn fs-btn--contorno fs-btn--s"
              onClick={() => {
                setAbierto(false);
                navegar(rutaReservas);
              }}
            >
              Ver reservas
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
