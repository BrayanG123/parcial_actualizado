/**
 * Detalle del producto: imagen, promocion, seleccion de talla/color,
 * disponibilidad por sucursal y las tres acciones del cliente
 * (carrito, reserva y probador virtual).
 */
import { useLayoutEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Boton } from '../../components/Boton';
import { AvisoEnLinea, Cargando, ErrorVista } from '../../components/Estados';
import { ImagenProducto } from '../../components/ImagenProducto';
import { InsigniaDescuento, InsigniaStock } from '../../components/Insignias';
import { Precio } from '../../components/Precio';
import { Contador, SelectorColor, SelectorTalla } from '../../components/Selectores';
import { useAvisos } from '../../context/AvisosContext';
import { useSesion } from '../../context/SesionContext';
import { useDisponibilidad, useProducto } from '../../hooks/useCatalogo';
import { useAgregarAlCarrito } from '../../hooks/useComercio';
import { promocionVigente } from '../../lib/domain';
import { fecha } from '../../lib/format';
import type { PropsStack } from '../../navigation/tipos';
import { colores, esp, radio, texto } from '../../theme';
import { useBorradorReserva } from '../reservations/BorradorReserva';
import { useSeleccion } from './useSeleccion';

export function PantallaProducto({ navigation, route }: PropsStack<'Producto'>) {
  const { id } = route.params;
  const { width } = useWindowDimensions();
  const { autenticado } = useSesion();
  const { avisar, avisarError } = useAvisos();

  const producto = useProducto(id);
  const disponibilidad = useDisponibilidad(id);
  const agregar = useAgregarAlCarrito();
  const borradorReserva = useBorradorReserva();

  const seleccion = useSeleccion(producto.data, disponibilidad.data ?? []);

  useLayoutEffect(() => {
    navigation.setOptions({ title: route.params.nombre ?? 'Producto' });
  }, [navigation, route.params.nombre]);

  if (producto.isLoading) return <Cargando mensaje="Cargando prenda..." />;
  if (producto.isError || !producto.data) {
    return <ErrorVista error={producto.error} onReintentar={() => void producto.refetch()} />;
  }

  const p = producto.data;
  const enPromocion = promocionVigente(p);

  function exigirSesion(motivo: string): boolean {
    if (autenticado) return true;
    navigation.navigate('Acceso', { motivo });
    return false;
  }

  async function agregarAlCarrito() {
    if (!seleccion.completa) {
      avisar('Elige talla y color antes de continuar.', 'info');
      return;
    }
    if (!exigirSesion('Inicia sesion para usar tu carrito.')) return;
    try {
      await agregar.mutateAsync({
        id_producto: p.id_producto,
        id_talla: seleccion.idTalla!,
        id_color: seleccion.idColor!,
        cantidad: seleccion.cantidad,
      });
      avisar('Agregado a tu carrito.');
    } catch (error) {
      avisarError(error);
    }
  }

  function reservar() {
    if (!seleccion.completa) {
      avisar('Elige talla y color para reservar.', 'info');
      return;
    }
    if (!exigirSesion('Inicia sesion para reservar prendas.')) return;

    const talla = p.tallas.find((t) => t.id_talla === seleccion.idTalla);
    const color = p.colores.find((c) => c.id_color === seleccion.idColor);
    if (!talla || !color) return;

    // La reserva se arma en varios pasos: la prenda entra al borrador y el
    // cliente elige sucursal y horario en la pantalla siguiente.
    borradorReserva.agregar(p, talla, color, seleccion.cantidad);
    navigation.navigate('NuevaReserva');
  }

  return (
    <View style={estilos.raiz}>
      <ScrollView contentContainerStyle={estilos.contenido} showsVerticalScrollIndicator={false}>
        <View>
          <ImagenProducto
            url={p.imagen_url}
            claveReciclado={p.id_producto}
            estilo={{ width, height: width * 1.15 }}
            redondeo={0}
            tamanoIcono={56}
          />
          {enPromocion ? (
            <View style={estilos.descuento}>
              <InsigniaDescuento porcentaje={p.descuento_pct} />
            </View>
          ) : null}
          <Pressable
            style={estilos.botonProbador}
            accessibilityRole="button"
            onPress={() => navigation.navigate('Probador', { idProducto: p.id_producto, nombre: p.nombre })}
          >
            <Ionicons name="scan-outline" size={17} color={colores.blanco} />
            <Text style={estilos.botonProbadorTexto}>Probador virtual</Text>
          </Pressable>
        </View>

        <View style={estilos.bloque}>
          <Text style={estilos.categoria}>{p.categoria?.nombre ?? ''}</Text>
          <Text style={estilos.nombre}>{p.nombre}</Text>
          <Precio producto={p} tamano="grande" />
          {enPromocion && p.promo_fin ? (
            <Text style={estilos.promoVigencia}>Promocion vigente hasta el {fecha(p.promo_fin)}</Text>
          ) : null}
          <Text style={estilos.descripcion}>{p.descripcion}</Text>
          {p.coleccion ? (
            <Text style={estilos.meta}>
              Coleccion {p.coleccion.nombre}
              {p.temporada ? ` - ${p.temporada.nombre}` : ''}
            </Text>
          ) : null}
        </View>

        {seleccion.agotado ? (
          <View style={estilos.bloque}>
            <AvisoEnLinea texto="Esta prenda esta agotada en todas nuestras sucursales." />
          </View>
        ) : null}

        <View style={estilos.bloque}>
          <Text style={estilos.tituloBloque}>Talla</Text>
          <View style={estilos.opciones}>
            {p.tallas.map((t) => (
              <SelectorTalla
                key={t.id_talla}
                nombre={t.nombre}
                activo={seleccion.idTalla === t.id_talla}
                agotada={!seleccion.tallasHabilitadas.has(t.id_talla)}
                onPress={() => seleccion.elegirTalla(t.id_talla)}
              />
            ))}
          </View>
        </View>

        <View style={estilos.bloque}>
          <Text style={estilos.tituloBloque}>
            Color{seleccion.idColor ? `: ${p.colores.find((c) => c.id_color === seleccion.idColor)?.nombre}` : ''}
          </Text>
          <View style={estilos.opciones}>
            {p.colores.map((c) => (
              <SelectorColor
                key={c.id_color}
                hex={c.codigo_hex}
                nombre={c.nombre}
                activo={seleccion.idColor === c.id_color}
                agotado={!seleccion.coloresHabilitados.has(c.id_color)}
                onPress={() => seleccion.elegirColor(c.id_color)}
              />
            ))}
          </View>
        </View>

        <View style={estilos.bloque}>
          <Text style={estilos.tituloBloque}>Disponibilidad</Text>
          {disponibilidad.isLoading ? (
            <Text style={estilos.meta}>Consultando sucursales...</Text>
          ) : !seleccion.completa ? (
            <Text style={estilos.meta}>Elige talla y color para ver el stock por sucursal.</Text>
          ) : seleccion.porSucursal.every((s) => s.disponible <= 0) ? (
            <AvisoEnLinea texto="Esa combinacion no esta disponible por ahora." />
          ) : (
            <View style={estilos.sucursales}>
              {seleccion.porSucursal.map((s) => (
                <Pressable
                  key={s.id_sucursal}
                  onPress={() => s.disponible > 0 && seleccion.elegirSucursal(s.id_sucursal)}
                  accessibilityRole="button"
                  style={[
                    estilos.sucursal,
                    seleccion.idSucursal === s.id_sucursal && estilos.sucursalActiva,
                    s.disponible <= 0 && estilos.sucursalInactiva,
                  ]}
                >
                  <View style={estilos.sucursalTextos}>
                    <Text style={estilos.sucursalNombre}>{s.nombre}</Text>
                    <Text style={estilos.meta}>{s.ciudad}</Text>
                  </View>
                  <InsigniaStock disponible={s.disponible} />
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {seleccion.completa && seleccion.disponible > 0 ? (
          <View style={[estilos.bloque, estilos.filaCantidad]}>
            <View>
              <Text style={estilos.tituloBloque}>Cantidad</Text>
              <Text style={estilos.meta}>
                {seleccion.disponible} disponibles
                {seleccion.idSucursal ? ' en la sucursal elegida' : ' en total'}
              </Text>
            </View>
            <Contador
              valor={seleccion.cantidad}
              max={Math.max(1, seleccion.disponible)}
              onCambiar={seleccion.setCantidad}
            />
          </View>
        ) : null}

        <View style={estilos.bloque}>
          <Boton
            titulo="Reservar para probar en tienda"
            icono="calendar-outline"
            variante="secundario"
            ancho
            onPress={reservar}
            deshabilitado={seleccion.agotado}
          />
        </View>
      </ScrollView>

      <View style={estilos.pie}>
        <View style={estilos.piePrecio}>
          <Text style={estilos.pieEtiqueta}>Total</Text>
          <Precio producto={p} />
        </View>
        <Boton
          titulo="Agregar al carrito"
          icono="bag-add-outline"
          onPress={agregarAlCarrito}
          cargando={agregar.isPending}
          deshabilitado={seleccion.agotado || (seleccion.completa && seleccion.disponible <= 0)}
          estilo={estilos.pieBoton}
        />
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: colores.crema },
  contenido: { paddingBottom: esp.xl },
  descuento: { position: 'absolute', top: esp.l, left: esp.l },
  botonProbador: {
    position: 'absolute',
    bottom: esp.l,
    right: esp.l,
    flexDirection: 'row',
    alignItems: 'center',
    gap: esp.s,
    backgroundColor: 'rgba(28,27,26,0.8)',
    paddingHorizontal: esp.l,
    paddingVertical: esp.m,
    borderRadius: radio.pill,
  },
  botonProbadorTexto: { ...texto.cuerpo, color: colores.blanco, fontWeight: '600' },
  bloque: {
    paddingHorizontal: esp.l,
    paddingTop: esp.l,
    gap: esp.s,
  },
  categoria: { ...texto.etiqueta, textTransform: 'uppercase' },
  nombre: { ...texto.display, fontSize: 24 },
  promoVigencia: { ...texto.menor, color: colores.acento },
  descripcion: { ...texto.cuerpo, marginTop: esp.xs },
  meta: { ...texto.menor },
  tituloBloque: { ...texto.subtitulo },
  opciones: { flexDirection: 'row', flexWrap: 'wrap', gap: esp.s, alignItems: 'center' },
  sucursales: { gap: esp.s },
  sucursal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: esp.m,
    padding: esp.m,
    borderRadius: radio.m,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.blanco,
  },
  sucursalActiva: { borderColor: colores.acento, backgroundColor: colores.acentoSuave },
  sucursalInactiva: { opacity: 0.55 },
  sucursalTextos: { flex: 1, gap: 1 },
  sucursalNombre: { ...texto.cuerpo, fontWeight: '600', color: colores.tinta },
  filaCantidad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pie: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: esp.m,
    paddingHorizontal: esp.l,
    paddingVertical: esp.m,
    borderTopWidth: 1,
    borderTopColor: colores.borde,
    backgroundColor: colores.blanco,
  },
  piePrecio: { gap: 1 },
  pieEtiqueta: { ...texto.etiqueta, textTransform: 'uppercase' },
  pieBoton: { flex: 1 },
});
