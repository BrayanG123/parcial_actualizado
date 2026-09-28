/**
 * Carrito del cliente.
 *
 * Cada mutacion devuelve el carrito completo y se escribe en la cache, asi que
 * cambiar una cantidad no vuelve a pedir la lista ni re-renderiza la app entera.
 */
import { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Boton } from '../../components/Boton';
import { Cargando, ErrorVista, Vacio } from '../../components/Estados';
import { ImagenProducto } from '../../components/ImagenProducto';
import { Pantalla } from '../../components/Pantalla';
import { RequiereSesion } from '../../components/RequiereSesion';
import { Contador } from '../../components/Selectores';
import { useAvisos } from '../../context/AvisosContext';
import { useSesion } from '../../context/SesionContext';
import {
  useCambiarCantidad,
  useCarrito,
  useQuitarDelCarrito,
  useVaciarCarrito,
} from '../../hooks/useComercio';
import { subtotal, totalLineas } from '../../lib/domain';
import { moneda, plural } from '../../lib/format';
import type { DetalleCarrito } from '../../types/domain';
import type { PropsTab } from '../../navigation/tipos';
import { colores, esp, radio, texto } from '../../theme';

/** Referencia estable mientras el carrito todavia no llego. */
const SIN_LINEAS: DetalleCarrito[] = [];

export function PantallaCarrito({ navigation }: PropsTab<'Carrito'>) {
  const { autenticado } = useSesion();
  const { avisarError } = useAvisos();
  const carrito = useCarrito();
  const cambiarCantidad = useCambiarCantidad();
  const quitar = useQuitarDelCarrito();
  const vaciar = useVaciarCarrito();

  /** Id de la linea que se esta modificando, para deshabilitar solo esa fila. */
  const [ocupada, setOcupada] = useState<number | null>(null);

  const detalles = carrito.data?.detalles ?? SIN_LINEAS;
  const total = useMemo(() => totalLineas(detalles), [detalles]);
  const unidades = useMemo(() => detalles.reduce((acc, d) => acc + d.cantidad, 0), [detalles]);

  if (!autenticado) {
    return (
      <Pantalla>
        <RequiereSesion
          titulo="Tu carrito te espera"
          detalle="Inicia sesion para guardar tus prendas y completar la compra."
          onAcceder={() => navigation.navigate('Acceso', { motivo: 'Inicia sesion para usar tu carrito.' })}
        />
      </Pantalla>
    );
  }

  if (carrito.isLoading) {
    return (
      <Pantalla>
        <Cargando mensaje="Cargando tu carrito..." />
      </Pantalla>
    );
  }

  if (carrito.isError) {
    return (
      <Pantalla>
        <ErrorVista error={carrito.error} onReintentar={() => void carrito.refetch()} />
      </Pantalla>
    );
  }

  async function ejecutar(id: number, accion: () => Promise<unknown>) {
    setOcupada(id);
    try {
      await accion();
    } catch (error) {
      avisarError(error);
    } finally {
      setOcupada(null);
    }
  }

  function confirmarVaciar() {
    Alert.alert('Vaciar carrito', 'Se quitaran todas las prendas. Esta accion no se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Vaciar',
        style: 'destructive',
        onPress: () => {
          vaciar.mutate(undefined, { onError: avisarError });
        },
      },
    ]);
  }

  return (
    <Pantalla>
      <View style={estilos.encabezado}>
        <View>
          <Text style={estilos.titulo}>Tu carrito</Text>
          <Text style={estilos.detalle}>
            {detalles.length > 0 ? plural(unidades, 'prenda', 'prendas') : 'Sin prendas todavia'}
          </Text>
        </View>
        {detalles.length > 0 ? (
          <Pressable onPress={confirmarVaciar} hitSlop={8} accessibilityRole="button">
            <Text style={estilos.vaciar}>Vaciar</Text>
          </Pressable>
        ) : null}
      </View>

      <FlatList
        data={detalles}
        keyExtractor={(d) => String(d.id_detalle_carrito)}
        contentContainerStyle={estilos.lista}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <Vacio
            icono="bag-outline"
            titulo="Tu carrito esta vacio"
            detalle="Explora el catalogo y agrega las prendas que te gusten."
            accion={{ titulo: 'Ver catalogo', onPress: () => navigation.navigate('Catalogo') }}
          />
        }
        renderItem={({ item }) => (
          <LineaCarrito
            linea={item}
            ocupada={ocupada === item.id_detalle_carrito}
            onCantidad={(cantidad) =>
              ejecutar(item.id_detalle_carrito, () =>
                cambiarCantidad.mutateAsync({ id: item.id_detalle_carrito, cantidad }),
              )
            }
            onQuitar={() =>
              ejecutar(item.id_detalle_carrito, () => quitar.mutateAsync(item.id_detalle_carrito))
            }
            onAbrir={() =>
              navigation.navigate('Producto', { id: item.id_producto, nombre: item.producto?.nombre })
            }
          />
        )}
      />

      {detalles.length > 0 ? (
        <View style={estilos.pie}>
          <View style={estilos.filaTotal}>
            <Text style={estilos.totalEtiqueta}>Total</Text>
            <Text style={estilos.totalValor}>{moneda(total)}</Text>
          </View>
          <Text style={estilos.aviso}>El stock se confirma al finalizar la compra.</Text>
          <Boton
            titulo="Continuar compra"
            icono="arrow-forward"
            ancho
            onPress={() => navigation.navigate('Checkout')}
          />
        </View>
      ) : null}
    </Pantalla>
  );
}

interface PropsLinea {
  linea: DetalleCarrito;
  ocupada: boolean;
  onCantidad: (cantidad: number) => void;
  onQuitar: () => void;
  onAbrir: () => void;
}

function LineaCarrito({ linea, ocupada, onCantidad, onQuitar, onAbrir }: PropsLinea) {
  return (
    <View style={[estilos.linea, ocupada && estilos.lineaOcupada]}>
      <Pressable onPress={onAbrir} accessibilityRole="button">
        <ImagenProducto
          url={linea.producto?.imagen_url}
          claveReciclado={linea.id_detalle_carrito}
          estilo={estilos.imagen}
        />
      </Pressable>

      <View style={estilos.lineaCuerpo}>
        <Pressable onPress={onAbrir} accessibilityRole="button">
          <Text style={estilos.lineaNombre} numberOfLines={2}>
            {linea.producto?.nombre ?? 'Prenda'}
          </Text>
        </Pressable>
        <Text style={estilos.lineaMeta}>
          Talla {linea.talla?.nombre ?? '-'} - {linea.color?.nombre ?? '-'}
        </Text>
        <Text style={estilos.lineaPrecio}>
          {moneda(linea.precio_unitario)} c/u
        </Text>

        <View style={estilos.lineaAcciones}>
          <Contador
            valor={linea.cantidad}
            compacto
            onCambiar={onCantidad}
          />
          <Text style={estilos.lineaSubtotal}>{moneda(subtotal(linea.cantidad, linea.precio_unitario))}</Text>
          <Pressable onPress={onQuitar} hitSlop={8} accessibilityRole="button" accessibilityLabel="Quitar prenda">
            <Ionicons name="trash-outline" size={18} color={colores.tinta3} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  encabezado: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: esp.l,
    paddingTop: esp.s,
    paddingBottom: esp.m,
  },
  titulo: { ...texto.titulo },
  detalle: { ...texto.menor },
  vaciar: { ...texto.cuerpo, color: colores.error, fontWeight: '600' },
  lista: { paddingHorizontal: esp.l, paddingBottom: esp.xl, gap: esp.m, flexGrow: 1 },
  linea: {
    flexDirection: 'row',
    gap: esp.m,
    padding: esp.m,
    backgroundColor: colores.blanco,
    borderRadius: radio.m,
    borderWidth: 1,
    borderColor: colores.borde,
  },
  lineaOcupada: { opacity: 0.6 },
  imagen: { width: 74, height: 98 },
  lineaCuerpo: { flex: 1, gap: 3 },
  lineaNombre: { ...texto.cuerpo, fontWeight: '600', color: colores.tinta },
  lineaMeta: { ...texto.menor },
  lineaPrecio: { ...texto.menor, color: colores.tinta2 },
  lineaAcciones: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: esp.s,
    marginTop: esp.xs,
  },
  lineaSubtotal: { ...texto.cuerpo, fontWeight: '700', color: colores.tinta },
  pie: {
    paddingHorizontal: esp.l,
    paddingTop: esp.m,
    paddingBottom: esp.m,
    borderTopWidth: 1,
    borderTopColor: colores.borde,
    backgroundColor: colores.blanco,
    gap: esp.s,
  },
  filaTotal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  totalEtiqueta: { ...texto.subtitulo },
  totalValor: { ...texto.titulo, fontFamily: undefined, fontWeight: '700' },
  aviso: { ...texto.menor },
});
