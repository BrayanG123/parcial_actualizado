/**
 * Seleccion de talla, color y sucursal sobre la disponibilidad real.
 *
 * La combinacion concreta del dominio es Producto + Talla + Color + Sucursal,
 * y la disponibilidad es cantidad_fisica - cantidad_reservada. Aqui se traduce
 * esa estructura a lo que la pantalla necesita saber: que opciones puede tocar
 * el cliente y cuantas unidades quedan de la combinacion elegida.
 *
 * Cuando una eleccion deja sin stock a la otra (elegir un color que no existe
 * en la talla marcada), la correccion se hace en el mismo momento del toque y
 * no en un efecto posterior: asi la pantalla nunca se dibuja con una
 * combinacion imposible.
 */
import { useCallback, useMemo, useState } from 'react';
import { stockDisponible } from '../../lib/domain';
import type { Inventario, Producto } from '../../types/domain';

export interface DisponibilidadSucursal {
  id_sucursal: number;
  nombre: string;
  ciudad: string;
  disponible: number;
}

export interface EstadoSeleccion {
  idTalla?: number;
  idColor?: number;
  idSucursal?: number;
  cantidad: number;
  elegirTalla: (id: number) => void;
  elegirColor: (id: number) => void;
  elegirSucursal: (id: number) => void;
  setCantidad: (n: number) => void;
  /** Ids de talla con al menos una unidad segun el color/sucursal elegidos. */
  tallasHabilitadas: Set<number>;
  coloresHabilitados: Set<number>;
  /** Stock por sucursal de la combinacion talla + color elegida. */
  porSucursal: DisponibilidadSucursal[];
  /** Total disponible de la combinacion (en la sucursal elegida, si hay una). */
  disponible: number;
  completa: boolean;
  /** El producto no tiene stock en ninguna combinacion. */
  agotado: boolean;
}

interface Filtro {
  idTalla?: number;
  idColor?: number;
  idSucursal?: number;
}

function stockDe(inventario: Inventario[], filtro: Filtro): number {
  return inventario.reduce((acc, i) => {
    if (filtro.idTalla && i.id_talla !== filtro.idTalla) return acc;
    if (filtro.idColor && i.id_color !== filtro.idColor) return acc;
    if (filtro.idSucursal && i.id_sucursal !== filtro.idSucursal) return acc;
    return acc + stockDisponible(i);
  }, 0);
}

export function useSeleccion(producto: Producto | undefined, inventario: Inventario[] = []): EstadoSeleccion {
  const [seleccion, setSeleccion] = useState<Filtro>({});
  const [cantidadPedida, setCantidadPedida] = useState(1);
  const { idTalla, idColor, idSucursal } = seleccion;

  const tallasHabilitadas = useMemo(() => {
    const set = new Set<number>();
    for (const t of producto?.tallas ?? []) {
      if (stockDe(inventario, { idTalla: t.id_talla, idColor, idSucursal }) > 0) set.add(t.id_talla);
    }
    return set;
  }, [producto, inventario, idColor, idSucursal]);

  const coloresHabilitados = useMemo(() => {
    const set = new Set<number>();
    for (const c of producto?.colores ?? []) {
      if (stockDe(inventario, { idTalla, idColor: c.id_color, idSucursal }) > 0) set.add(c.id_color);
    }
    return set;
  }, [producto, inventario, idTalla, idSucursal]);

  const porSucursal = useMemo<DisponibilidadSucursal[]>(() => {
    if (!idTalla || !idColor) return [];
    return inventario
      .filter((i) => i.id_talla === idTalla && i.id_color === idColor)
      .map((i) => ({
        id_sucursal: i.id_sucursal,
        nombre: i.sucursal?.nombre ?? `Sucursal ${i.id_sucursal}`,
        ciudad: i.sucursal?.ciudad ?? '',
        disponible: stockDisponible(i),
      }))
      .sort((a, b) => b.disponible - a.disponible);
  }, [inventario, idTalla, idColor]);

  const disponible = useMemo(
    () => (idTalla && idColor ? stockDe(inventario, { idTalla, idColor, idSucursal }) : 0),
    [inventario, idTalla, idColor, idSucursal],
  );

  const agotado = useMemo(
    () => inventario.length > 0 && inventario.every((i) => stockDisponible(i) <= 0),
    [inventario],
  );

  /**
   * Aplica un cambio y descarta en el acto lo que quede sin stock.
   * Volver a tocar la opcion marcada la deselecciona.
   */
  const cambiar = useCallback(
    (campo: keyof Filtro, id: number) => {
      setSeleccion((actual) => {
        const propuesta: Filtro = { ...actual, [campo]: actual[campo] === id ? undefined : id };
        if (propuesta.idTalla && stockDe(inventario, { ...propuesta, idColor: undefined }) <= 0) {
          propuesta.idTalla = undefined;
        }
        if (propuesta.idColor && stockDe(inventario, { ...propuesta, idTalla: undefined }) <= 0) {
          propuesta.idColor = undefined;
        }
        if (propuesta.idTalla && propuesta.idColor && stockDe(inventario, propuesta) <= 0) {
          // La pareja talla + color no existe: se conserva lo ultimo que toco.
          if (campo === 'idTalla') propuesta.idColor = undefined;
          else if (campo === 'idColor') propuesta.idTalla = undefined;
          else propuesta.idSucursal = undefined;
        }
        return propuesta;
      });
    },
    [inventario],
  );

  const elegirTalla = useCallback((id: number) => cambiar('idTalla', id), [cambiar]);
  const elegirColor = useCallback((id: number) => cambiar('idColor', id), [cambiar]);
  const elegirSucursal = useCallback((id: number) => cambiar('idSucursal', id), [cambiar]);

  // La cantidad se acota al mostrar, no con un efecto: si el stock baja
  // mientras la pantalla esta abierta, el contador se ajusta solo.
  const cantidad = disponible > 0 ? Math.min(cantidadPedida, disponible) : cantidadPedida;

  return {
    idTalla,
    idColor,
    idSucursal,
    cantidad,
    elegirTalla,
    elegirColor,
    elegirSucursal,
    setCantidad: setCantidadPedida,
    tallasHabilitadas,
    coloresHabilitados,
    porSucursal,
    disponible,
    completa: Boolean(idTalla && idColor),
    agotado,
  };
}
