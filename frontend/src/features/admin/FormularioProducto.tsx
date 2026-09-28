import { EditorFotos } from './EditorFotos';
import { EditorRecursosRA } from './EditorRecursosRA';
import { useQuery } from '@tanstack/react-query';
import { proveedorService } from '../../services/proveedor.service';
import { USAR_MOCKS } from '../../api/config';
import { useEffect, useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { ErrorEstado } from '../../components/ui/Estados';
import { useToast } from '../../context/ToastContext';
import {
  useCategorias,
  useColecciones,
  useColores,
  useGuardarProducto,
  useTallas,
  useTemporadas,
} from '../../hooks/useCatalogo';
import { useProveedores } from '../../hooks/useOperaciones';
import {
  hayErrores,
  numeroPositivo,
  rangoPorcentaje,
  requerido,
  type Errores,
} from '../../lib/validacion';
import type { DatosProducto } from '../../services/catalogo.service';
import type { Producto } from '../../types/domain';

const VACIO: DatosProducto = {
  nombre: '',
  descripcion: '',
  precio: 0,
  precio_mayorista: null,
  imagenes: [],
  imagen_url: '',
  descuento_pct: 0,
  promo_inicio: null,
  promo_fin: null,
  activo: true,
  id_categoria: 0,
  id_temporada: null,
  id_coleccion: null,
  id_proveedor: null,
  id_tallas: [],
  id_colores: [],
};

function aFormulario(p: Producto): DatosProducto {
  return {
    nombre: p.nombre,
    descripcion: p.descripcion,
    precio: p.precio,
    precio_mayorista: p.precio_mayorista ?? null,
    imagenes: p.imagenes ?? (p.imagen_url ? [p.imagen_url] : []),
    imagen_url: p.imagen_url,
    descuento_pct: p.descuento_pct,
    promo_inicio: p.promo_inicio,
    promo_fin: p.promo_fin,
    activo: p.activo,
    id_categoria: p.id_categoria,
    id_temporada: p.id_temporada,
    id_coleccion: p.id_coleccion,
    id_proveedor: p.id_proveedor,
    id_tallas: p.tallas.map((t) => t.id_talla),
    id_colores: p.colores.map((c) => c.id_color),
  };
}

interface Props {
  abierto: boolean;
  producto: Producto | null;
  onCerrar: () => void;
}

export function FormularioProducto({ abierto, producto, onCerrar }: Props) {
  const suministro = useQuery({ queryKey: ['proveedor-disponibilidad', producto?.id_producto],
    queryFn: () => proveedorService.suministro(producto!.id_producto), enabled: !USAR_MOCKS && abierto && Boolean(producto), retry: false });
  const [subiendoFotos, setSubiendoFotos] = useState(false);
  const categorias = useCategorias();
  const temporadas = useTemporadas();
  const colecciones = useColecciones();
  const proveedores = useProveedores();
  const tallas = useTallas();
  const colores = useColores();
  const guardar = useGuardarProducto();
  const toast = useToast();

  const [datos, setDatos] = useState<DatosProducto>(VACIO);
  const [errores, setErrores] = useState<Errores<DatosProducto>>({});
  const dependencias = [categorias, temporadas, colecciones, proveedores, tallas, colores];
  const cargandoCatalogos = dependencias.some((q) => q.isPending);
  const errorCatalogo = dependencias.find((q) => q.isError);

  useEffect(() => {
    if (!abierto) return;
    setErrores({});
    setDatos(producto ? aFormulario(producto) : VACIO);
  }, [abierto, producto]);

  function cambiar<K extends keyof DatosProducto>(clave: K, valor: DatosProducto[K]) {
    setDatos((d) => ({
      ...d,
      [clave]: valor,
      ...(clave === 'id_temporada' ? { id_coleccion: null } : {}),
    }));
  }

  function alternarLista(clave: 'id_tallas' | 'id_colores', id: number) {
    setDatos((d) => {
      const actual = d[clave];
      return {
        ...d,
        [clave]: actual.includes(id) ? actual.filter((x) => x !== id) : [...actual, id],
      };
    });
  }

  async function enviar() {
    if (cargandoCatalogos || errorCatalogo || subiendoFotos || guardar.isPending) return;
    const nuevos: Errores<DatosProducto> = {
      nombre:
        datos.nombre.trim().length < 2 || datos.nombre.trim().length > 160
          ? 'Usa entre 2 y 160 caracteres'
          : undefined,
      precio: numeroPositivo(datos.precio, 'El precio debe ser mayor a cero'),
      id_categoria: datos.id_categoria ? undefined : 'Selecciona una categoria',
      id_temporada: temporadas.data?.some((t) => t.id_temporada === datos.id_temporada && t.activa)
        ? undefined
        : 'Selecciona una temporada activa',
      id_coleccion: colecciones.data?.some(
        (c) =>
          c.id_coleccion === datos.id_coleccion &&
          c.id_temporada === datos.id_temporada &&
          c.activa,
      )
        ? undefined
        : 'Selecciona una coleccion activa de la temporada',
      id_proveedor: proveedores.data?.some((p) => p.id_proveedor === datos.id_proveedor && p.activo)
        ? undefined
        : 'Selecciona un proveedor activo',
      descuento_pct: rangoPorcentaje(datos.descuento_pct),
      id_tallas: requerido(datos.id_tallas, 'Selecciona al menos una talla'),
      id_colores: requerido(datos.id_colores, 'Selecciona al menos un color'),
    };
    if (Math.abs(datos.precio * 100 - Math.round(datos.precio * 100)) > 0.000001)
      nuevos.precio = 'Usa como maximo dos decimales';
    if (Math.abs(datos.descuento_pct * 100 - Math.round(datos.descuento_pct * 100)) > 0.000001)
      nuevos.descuento_pct = 'Usa como maximo dos decimales';
    if (Boolean(datos.promo_inicio) !== Boolean(datos.promo_fin))
      nuevos.promo_fin = 'Completa ambas fechas o deja ambas vacias';
    else if (datos.promo_inicio && datos.promo_fin && datos.promo_fin < datos.promo_inicio)
      nuevos.promo_fin = 'El fin debe ser igual o posterior al inicio';
    if (
      datos.precio_mayorista != null &&
      (!Number.isFinite(datos.precio_mayorista) ||
        datos.precio_mayorista <= 0 ||
        datos.precio_mayorista > datos.precio ||
        Math.abs(datos.precio_mayorista * 100 - Math.round(datos.precio_mayorista * 100)) >
          0.000001)
    )
      nuevos.precio_mayorista =
        'Usa un precio positivo con hasta dos decimales, no mayor al minorista';
    if (datos.imagen_url.trim()) {
      try {
        const url = new URL(datos.imagen_url.trim());
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
      } catch {
        nuevos.imagen_url = 'Ingresa una URL http o https valida';
      }
    }
    setErrores(nuevos);
    if (hayErrores(nuevos)) return;

    try {
      if (producto) {
        await guardar.mutateAsync({
          id: producto.id_producto,
          datos: {
            ...datos,
            // No truncar la hora que ya tiene el servidor al editar otro campo.
            promo_inicio:
              datos.promo_inicio === producto.promo_inicio ? undefined : datos.promo_inicio,
            promo_fin: datos.promo_fin === producto.promo_fin ? undefined : datos.promo_fin,
          },
        });
      } else await guardar.mutateAsync({ datos });
      toast.exito(producto ? 'Producto actualizado.' : 'Producto creado.');
      onCerrar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No pudimos guardar el producto.');
    }
  }

  return (
    <Modal
      abierto={abierto}
      titulo={producto ? 'Editar producto' : 'Nuevo producto'}
      onCerrar={() => {
        if (!subiendoFotos && !guardar.isPending) onCerrar();
      }}
      ancho
      pie={
        <>
          <button
            type="button"
            className="fs-btn fs-btn--contorno"
            disabled={subiendoFotos || guardar.isPending}
            onClick={onCerrar}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="fs-btn fs-btn--acento"
            onClick={enviar}
            disabled={
              subiendoFotos || guardar.isPending || cargandoCatalogos || Boolean(errorCatalogo)
            }
          >
            {guardar.isPending ? 'Guardando...' : 'Guardar producto'}
          </button>
        </>
      }
    >
      <div className="fs-pila">
        {suministro.data?.supplierAvailability && <div className="fs-alerta">
          <strong>Disponibilidad informada por el proveedor</strong>
          <p>{suministro.data.supplierAvailability}</p>
          <p className="fs-sub">Es informacion de suministro. Las existencias de la tienda se registran en Inventario.</p>
        </div>}
        {suministro.isError && <ErrorEstado error={suministro.error} onReintentar={() => suministro.refetch()} />}
        {cargandoCatalogos && <p>Cargando opciones del catalogo...</p>}
        {errorCatalogo && (
          <ErrorEstado
            error={errorCatalogo.error}
            onReintentar={() => dependencias.forEach((q) => void q.refetch())}
          />
        )}
        <div className="fs-campo">
          <label htmlFor="nombre-producto">Nombre</label>
          <input
            id="nombre-producto"
            maxLength={160}
            className={`fs-input${errores.nombre ? ' fs-input--error' : ''}`}
            value={datos.nombre}
            onChange={(e) => cambiar('nombre', e.target.value)}
          />
          {errores.nombre && <span className="fs-campo-error">{errores.nombre}</span>}
        </div>

        <div className="fs-campo">
          <label htmlFor="descripcion-producto">Descripcion</label>
          <textarea
            id="descripcion-producto"
            maxLength={5000}
            className="fs-textarea"
            value={datos.descripcion}
            onChange={(e) => cambiar('descripcion', e.target.value)}
          />
        </div>

        <div className="fs-rejilla-form">
          <div className="fs-campo">
            <label htmlFor="precio">Precio minorista (Bs)</label>
            <input
              id="precio"
              type="number"
              min={0}
              step="0.01"
              className={`fs-input${errores.precio ? ' fs-input--error' : ''}`}
              value={datos.precio}
              onChange={(e) => cambiar('precio', Number(e.target.value))}
            />
            {errores.precio && <span className="fs-campo-error">{errores.precio}</span>}
          </div>

          <div className="fs-campo">
            <label htmlFor="categoria">Categoria</label>
            <select
              id="categoria"
              className={`fs-select${errores.id_categoria ? ' fs-select--error' : ''}`}
              value={datos.id_categoria || ''}
              onChange={(e) => cambiar('id_categoria', Number(e.target.value))}
            >
              <option value="">Selecciona</option>
              {categorias.data?.map((c) => (
                <option key={c.id_categoria} value={c.id_categoria}>
                  {c.nombre}
                </option>
              ))}
            </select>
            {errores.id_categoria && <span className="fs-campo-error">{errores.id_categoria}</span>}
          </div>

          <div className="fs-campo">
            <label htmlFor="temporada">Temporada</label>
            <select
              id="temporada"
              className="fs-select"
              value={datos.id_temporada ?? ''}
              onChange={(e) =>
                cambiar('id_temporada', e.target.value ? Number(e.target.value) : null)
              }
            >
              <option value="">Selecciona una temporada</option>
              {temporadas.data?.map((t) => (
                <option key={t.id_temporada} value={t.id_temporada} disabled={!t.activa}>
                  {t.nombre}
                  {!t.activa && ' (inactiva)'}
                </option>
              ))}
            </select>
            {errores.id_temporada && <span className="fs-campo-error">{errores.id_temporada}</span>}
          </div>

          <div className="fs-campo">
            <label htmlFor="coleccion">Coleccion</label>
            <select
              id="coleccion"
              disabled={!datos.id_temporada}
              className="fs-select"
              value={datos.id_coleccion ?? ''}
              onChange={(e) =>
                cambiar('id_coleccion', e.target.value ? Number(e.target.value) : null)
              }
            >
              <option value="">Selecciona una coleccion</option>
              {colecciones.data
                ?.filter((c) => c.id_temporada === datos.id_temporada)
                .map((c) => (
                  <option key={c.id_coleccion} value={c.id_coleccion} disabled={!c.activa}>
                    {c.nombre}
                    {!c.activa && ' (inactiva)'}
                  </option>
                ))}
            </select>
            {errores.id_coleccion && <span className="fs-campo-error">{errores.id_coleccion}</span>}
          </div>

          <div className="fs-campo">
            <label htmlFor="proveedor">Proveedor</label>
            <select
              id="proveedor"
              className="fs-select"
              value={datos.id_proveedor ?? ''}
              onChange={(e) =>
                cambiar('id_proveedor', e.target.value ? Number(e.target.value) : null)
              }
            >
              <option value="">Selecciona un proveedor</option>
              {proveedores.data?.map((p) => (
                <option key={p.id_proveedor} value={p.id_proveedor} disabled={!p.activo}>
                  {p.nombre}
                  {!p.activo && ' (inactivo)'}
                </option>
              ))}
            </select>
            {errores.id_proveedor && <span className="fs-campo-error">{errores.id_proveedor}</span>}
          </div>

          <div className="fs-campo">
            <label htmlFor="precio-mayorista">Precio mayorista (Bs)</label>
            <input
              id="precio-mayorista"
              type="number"
              min="0.01"
              step="0.01"
              className="fs-input"
              value={datos.precio_mayorista ?? ''}
              onChange={(e) =>
                cambiar('precio_mayorista', e.target.value === '' ? null : Number(e.target.value))
              }
            />
            <span className="fs-sub">
              Opcional. Sin promociones adicionales. Si queda vacio, se usa el precio minorista
              vigente.
            </span>
            {errores.precio_mayorista && (
              <span className="fs-campo-error">{errores.precio_mayorista}</span>
            )}
          </div>
        </div>

        <hr className="fs-divisor" />
        <EditorFotos
          key={`${producto?.id_producto ?? 'nuevo'}-${abierto}`}
          fotos={datos.imagenes ?? []}
          disabled={guardar.isPending}
          onBusy={setSubiendoFotos}
          onChange={(imagenes) =>
            setDatos((d) => ({ ...d, imagenes, imagen_url: imagenes[0] ?? '' }))
          }
        />
        <hr className="fs-divisor" />
        <EditorRecursosRA idProducto={producto?.id_producto} />
        <hr className="fs-divisor" />
        <p className="fs-eyebrow">Promocion</p>
        <div className="fs-rejilla-form">
          <div className="fs-campo">
            <label htmlFor="descuento">Descuento (%)</label>
            <input
              id="descuento"
              step="0.01"
              type="number"
              min={0}
              max={100}
              className={`fs-input${errores.descuento_pct ? ' fs-input--error' : ''}`}
              value={datos.descuento_pct}
              onChange={(e) => cambiar('descuento_pct', Number(e.target.value))}
            />
            {errores.descuento_pct && (
              <span className="fs-campo-error">{errores.descuento_pct}</span>
            )}
          </div>
          <div className="fs-campo">
            <label htmlFor="promo-inicio">Inicio de promocion</label>
            <input
              id="promo-inicio"
              type="date"
              className="fs-input"
              value={datos.promo_inicio ?? ''}
              onChange={(e) => cambiar('promo_inicio', e.target.value || null)}
            />
          </div>
          <div className="fs-campo">
            <label htmlFor="promo-fin">Fin de promocion</label>
            <input
              id="promo-fin"
              type="date"
              className="fs-input"
              value={datos.promo_fin ?? ''}
              onChange={(e) => cambiar('promo_fin', e.target.value || null)}
            />
            {errores.promo_fin && <span className="fs-campo-error">{errores.promo_fin}</span>}
          </div>
        </div>

        <hr className="fs-divisor" />
        <div className="fs-campo">
          <label>Tallas disponibles</label>
          <div className="fs-opciones">
            {tallas.data?.map((t) => (
              <button
                key={t.id_talla}
                type="button"
                className={`fs-chip${datos.id_tallas.includes(t.id_talla) ? ' fs-chip--activo' : ''}`}
                onClick={() => alternarLista('id_tallas', t.id_talla)}
              >
                {t.nombre}
              </button>
            ))}
          </div>
          {errores.id_tallas && <span className="fs-campo-error">{errores.id_tallas}</span>}
        </div>

        <div className="fs-campo">
          <label>Colores disponibles</label>
          <div className="fs-opciones">
            {colores.data?.map((c) => (
              <button
                key={c.id_color}
                type="button"
                className={`fs-chip fs-chip--color${datos.id_colores.includes(c.id_color) ? ' fs-chip--activo' : ''}`}
                onClick={() => alternarLista('id_colores', c.id_color)}
              >
                <span className="fs-punto-color" style={{ background: c.codigo_hex }} />
                {c.nombre}
              </button>
            ))}
          </div>
          {errores.id_colores && <span className="fs-campo-error">{errores.id_colores}</span>}
        </div>

        {producto && (
          <label className="fs-check">
            <input
              type="checkbox"
              checked={datos.activo}
              onChange={(e) => cambiar('activo', e.target.checked)}
            />
            Producto visible en el catalogo
          </label>
        )}
      </div>
    </Modal>
  );
}
