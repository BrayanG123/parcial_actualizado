import {
  adaptarColor,
  adaptarTalla,
  type ColorBackend,
  type NombreBackend,
} from './catalogo.contratos';
import { EstadoCarrito, type Carrito } from '../types/domain';
interface SucursalCarritoBackend extends NombreBackend {
  city: string;
}
export interface ItemCarritoBackend {
  id: number;
  productId: number;
  sizeId: number;
  colorId: number;
  quantity: number;
  unitPrice: number;
  storedUnitPrice: number;
  priceChanged: boolean;
  promotionActive: boolean;
  subtotal: number;
  available: boolean;
  product: NombreBackend & { imageUrl: string | null; active: boolean };
  size: NombreBackend;
  color: ColorBackend;
  availability: Array<{ branch: SucursalCarritoBackend; availableQuantity: number }>;
  issue: 'PRODUCT_INACTIVE' | 'VARIANT_UNAVAILABLE' | 'INSUFFICIENT_STOCK' | null;
}
export interface CarritoBackend {
  id: number;
  status: 'ACTIVE' | 'CONVERTED' | 'ABANDONED';
  createdAt: string;
  updatedAt: string;
  items: ItemCarritoBackend[];
  itemCount: number;
  totalQuantity: number;
  total: number;
  availableBranches: SucursalCarritoBackend[];
  hasAvailability: boolean;
}
const sucursal = (v: SucursalCarritoBackend) => ({
  id_sucursal: v.id,
  nombre: v.name,
  ciudad: v.city,
});
export function adaptarCarrito(v: CarritoBackend): Carrito {
  return {
    id_carrito: v.id,
    fecha_creacion: v.createdAt,
    estado: {
      ACTIVE: EstadoCarrito.ACTIVO,
      CONVERTED: EstadoCarrito.CONVERTIDO,
      ABANDONED: EstadoCarrito.ABANDONADO,
    }[v.status],
    total: v.total,
    cantidad_total: v.totalQuantity,
    tiene_disponibilidad: v.hasAvailability,
    sucursales_disponibles: v.availableBranches.map(sucursal),
    detalles: v.items.map((i) => ({
      id_detalle_carrito: i.id,
      id_carrito: v.id,
      id_producto: i.productId,
      id_talla: i.sizeId,
      id_color: i.colorId,
      cantidad: i.quantity,
      precio_unitario: i.unitPrice,
      precio_guardado: i.storedUnitPrice,
      precio_cambio: i.priceChanged,
      subtotal: i.subtotal,
      disponible: i.available,
      problema: i.issue,
      producto: {
        id_producto: i.product.id,
        nombre: i.product.name,
        imagen_url: i.product.imageUrl ?? '',
        activo: i.product.active,
      },
      talla: adaptarTalla(i.size),
      color: adaptarColor(i.color),
      disponibilidad: i.availability.map((a) => ({
        sucursal: sucursal(a.branch),
        cantidad_disponible: a.availableQuantity,
      })),
    })),
  };
}
