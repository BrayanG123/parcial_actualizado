interface Variante { id_producto: number; id_talla: number; id_color: number; cantidad: number }
interface Existencia {
  id_producto: number; id_talla: number; id_color: number; id_sucursal: number;
  cantidad_fisica: number; cantidad_reservada: number;
}
interface ConsultaStock {
  isFetching: boolean; isSuccess: boolean; isError: boolean; data?: Existencia[];
}
export function estadoPrendaReserva(linea: Variante, sucursal: number | undefined, consulta: ConsultaStock) {
  if (!sucursal) return { estado: 'sin-sucursal', disponible: null } as const;
  if (consulta.isFetching) return { estado: 'consultando', disponible: null } as const;
  if (consulta.isError) return { estado: 'error', disponible: null } as const;
  if (!consulta.isSuccess) return { estado: 'consultando', disponible: null } as const;
  const disponible = (consulta.data ?? [])
    .filter((i) => i.id_sucursal === sucursal && i.id_producto === linea.id_producto
      && i.id_talla === linea.id_talla && i.id_color === linea.id_color)
    .reduce((total, i) => total + Math.max(0, i.cantidad_fisica - i.cantidad_reservada), 0);
  return { estado: disponible >= linea.cantidad ? 'disponible' : 'insuficiente', disponible } as const;
}
