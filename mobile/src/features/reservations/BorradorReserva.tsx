/**
 * Borrador de reserva: las prendas que el cliente va juntando para probarse
 * en una sucursal. Vive en memoria mientras arma la reserva y se vacia al
 * confirmarla; no es el carrito de compra ni se guarda en el backend.
 *
 * Es estado global porque se alimenta desde cualquier detalle de producto y se
 * revisa en otra pantalla, pero se mantiene minimo a proposito.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Color, Producto, Talla } from '../../types/domain';

export interface LineaBorrador {
  /** Clave estable de la combinacion producto + talla + color. */
  clave: string;
  id_producto: number;
  id_talla: number;
  id_color: number;
  cantidad: number;
  nombre: string;
  imagen_url: string;
  talla: string;
  color: string;
}

interface ValorBorrador {
  lineas: LineaBorrador[];
  agregar: (producto: Producto, talla: Talla, color: Color, cantidad: number) => void;
  cambiarCantidad: (clave: string, cantidad: number) => void;
  quitar: (clave: string) => void;
  vaciar: () => void;
}

const Contexto = createContext<ValorBorrador | null>(null);

const clave = (p: number, t: number, c: number) => `${p}:${t}:${c}`;

export function ProveedorBorradorReserva({ children }: { children: ReactNode }) {
  const [lineas, setLineas] = useState<LineaBorrador[]>([]);

  const agregar = useCallback(
    (producto: Producto, talla: Talla, color: Color, cantidad: number) => {
      const id = clave(producto.id_producto, talla.id_talla, color.id_color);
      setLineas((actuales) => {
        const existente = actuales.find((l) => l.clave === id);
        if (existente) {
          return actuales.map((l) => (l.clave === id ? { ...l, cantidad: l.cantidad + cantidad } : l));
        }
        return [
          ...actuales,
          {
            clave: id,
            id_producto: producto.id_producto,
            id_talla: talla.id_talla,
            id_color: color.id_color,
            cantidad,
            nombre: producto.nombre,
            imagen_url: producto.imagen_url,
            talla: talla.nombre,
            color: color.nombre,
          },
        ];
      });
    },
    [],
  );

  const cambiarCantidad = useCallback((id: string, cantidad: number) => {
    setLineas((actuales) =>
      actuales.map((l) => (l.clave === id ? { ...l, cantidad: Math.max(1, cantidad) } : l)),
    );
  }, []);

  const quitar = useCallback((id: string) => {
    setLineas((actuales) => actuales.filter((l) => l.clave !== id));
  }, []);

  const vaciar = useCallback(() => setLineas([]), []);

  const valor = useMemo(
    () => ({ lineas, agregar, cambiarCantidad, quitar, vaciar }),
    [lineas, agregar, cambiarCantidad, quitar, vaciar],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useBorradorReserva(): ValorBorrador {
  const valor = useContext(Contexto);
  if (!valor) throw new Error('useBorradorReserva debe usarse dentro de ProveedorBorradorReserva.');
  return valor;
}
