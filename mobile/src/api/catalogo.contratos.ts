/** DTO de catalogo de NestJS adaptados al dominio en espanol de la app. */
import type {
  Categoria,
  Coleccion,
  Color,
  Inventario,
  Producto,
  RecursoRA,
  Sucursal,
  Talla,
  Temporada,
} from '../types/domain';

export interface NombreBackend {
  id: number;
  name: string;
}
export interface CategoriaBackend extends NombreBackend {
  description: string | null;
}
export interface ColorBackend extends NombreBackend {
  hexCode: string;
}
export interface TemporadaBackend extends NombreBackend {
  startDate: string;
  endDate: string;
  active: boolean;
}
export interface ColeccionBackend extends CategoriaBackend {
  seasonId: number;
  active: boolean;
}
export interface SucursalBackend extends NombreBackend {
  city: string;
  address: string;
  phone: string | null;
  active: boolean;
}
export interface RecursoBackend {
  id: number;
  productId: number;
  type: string;
  url: string;
  format: string;
  active: boolean;
}
export interface ProductoBackend extends CategoriaBackend {
  imageUrls?: string[];
  price: number;
  currentPrice: number;
  discountPercent: number;
  promotionActive: boolean;
  promotionStart: string | null;
  promotionEnd: string | null;
  imageUrl: string | null;
  active: boolean;
  categoryId: number;
  seasonId: number;
  collectionId: number;
  supplierId: number;
  category: CategoriaBackend;
  season: TemporadaBackend;
  collection: ColeccionBackend;
  sizes: NombreBackend[];
  colors: ColorBackend[];
  arResources: RecursoBackend[];
}
/** La consulta publica solo expone unidades disponibles, no fisicas ni reservadas. */
export interface DisponibilidadBackend {
  id: number;
  availableQuantity: number;
  branch: Pick<SucursalBackend, 'id' | 'name' | 'city' | 'active'>;
  product: NombreBackend;
  size: NombreBackend;
  color: ColorBackend;
}

export const soloFecha = (valor: string | null) => valor?.slice(0, 10) ?? null;

export const adaptarCategoria = (v: CategoriaBackend): Categoria => ({
  id_categoria: v.id,
  nombre: v.name,
  descripcion: v.description ?? '',
});
export const adaptarTalla = (v: NombreBackend): Talla => ({ id_talla: v.id, nombre: v.name });
export const adaptarColor = (v: ColorBackend): Color => ({ id_color: v.id, nombre: v.name, codigo_hex: v.hexCode });
export const adaptarTemporada = (v: TemporadaBackend): Temporada => ({
  id_temporada: v.id,
  nombre: v.name,
  fecha_inicio: soloFecha(v.startDate) ?? '',
  fecha_fin: soloFecha(v.endDate) ?? '',
  activa: v.active,
});
export const adaptarColeccion = (v: ColeccionBackend): Coleccion => ({
  id_coleccion: v.id,
  nombre: v.name,
  descripcion: v.description ?? '',
  id_temporada: v.seasonId,
  activa: v.active,
});
export const adaptarSucursal = (v: SucursalBackend): Sucursal => ({
  id_sucursal: v.id,
  nombre: v.name,
  ciudad: v.city,
  direccion: v.address,
  telefono: v.phone ?? '',
  activa: v.active,
});
export const adaptarRecurso = (v: RecursoBackend): RecursoRA => ({
  id_recurso_ra: v.id,
  id_producto: v.productId,
  tipo: v.type,
  url_recurso: v.url,
  formato: v.format,
  activo: v.active,
});

export function adaptarProducto(v: ProductoBackend): Producto {
  const imagenes = v.imageUrls?.length ? v.imageUrls : v.imageUrl ? [v.imageUrl] : [];
  return {
    id_producto: v.id,
    nombre: v.name,
    descripcion: v.description ?? '',
    precio: v.price,
    precio_actual: v.currentPrice,
    promocion_activa: v.promotionActive,
    descuento_pct: v.discountPercent,
    promo_inicio: soloFecha(v.promotionStart),
    promo_fin: soloFecha(v.promotionEnd),
    imagen_url: imagenes[0] ?? '',
    imagenes,
    activo: v.active,
    id_categoria: v.categoryId,
    id_temporada: v.seasonId,
    id_coleccion: v.collectionId,
    id_proveedor: v.supplierId,
    categoria: adaptarCategoria(v.category),
    temporada: adaptarTemporada(v.season),
    coleccion: adaptarColeccion(v.collection),
    tallas: v.sizes.map(adaptarTalla),
    colores: v.colors.map(adaptarColor),
    tiene_recurso_ra: v.arResources.some((r) => r.active),
    recursos_ra: v.arResources.map(adaptarRecurso),
  };
}

/**
 * La seleccion de talla/color trabaja con Inventario. El cliente solo recibe
 * unidades disponibles, asi que se representan como fisicas sin reservas.
 */
export function adaptarDisponibilidad(v: DisponibilidadBackend): Inventario {
  return {
    id_inventario: v.id,
    id_sucursal: v.branch.id,
    id_producto: v.product.id,
    id_talla: v.size.id,
    id_color: v.color.id,
    cantidad_fisica: v.availableQuantity,
    cantidad_reservada: 0,
    talla: adaptarTalla(v.size),
    color: adaptarColor(v.color),
    sucursal: {
      id_sucursal: v.branch.id,
      nombre: v.branch.name,
      ciudad: v.branch.city,
      direccion: '',
      telefono: '',
      activa: v.branch.active,
    },
  };
}
