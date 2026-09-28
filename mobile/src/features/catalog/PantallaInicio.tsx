/**
 * Inicio: puerta de entrada a la tienda.
 * Muestra novedades, promociones vigentes y, si hay sesion, las
 * recomendaciones que produce el servicio de IA.
 */
import { useCallback } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Cargando, ErrorVista } from '../../components/Estados';
import { Pantalla, TituloSeccion } from '../../components/Pantalla';
import { useCategorias, useProductos } from '../../hooks/useCatalogo';
import { useRecomendaciones } from '../../hooks/useIA';
import { useSesion } from '../../context/SesionContext';
import type { Producto } from '../../types/domain';
import type { PropsTab } from '../../navigation/tipos';
import { colores, esp, radio, texto } from '../../theme';
import { TarjetaProducto } from './TarjetaProducto';

const ANCHO_TARJETA = 158;

const ACCESOS = [
  { icono: 'shirt-outline', titulo: 'Probador virtual', detalle: 'Pruebate una prenda con la camara' },
  { icono: 'calendar-outline', titulo: 'Reservar en tienda', detalle: 'Aparta prendas para probartelas' },
  { icono: 'sparkles-outline', titulo: 'Asistente de estilo', detalle: 'Pide ideas para tu proximo look' },
] as const;

export function PantallaInicio({ navigation }: PropsTab<'Inicio'>) {
  const { usuario } = useSesion();

  const novedades = useProductos({ orden: 'nombre', solo_disponibles: true });
  const promociones = useProductos({ solo_promocion: true, orden: 'descuento' });
  const { data: categorias } = useCategorias();
  const { data: recomendaciones } = useRecomendaciones({ limite: 6 });

  const abrirProducto = useCallback(
    (producto: Producto) =>
      navigation.navigate('Producto', { id: producto.id_producto, nombre: producto.nombre }),
    [navigation],
  );

  const listaNovedades = novedades.data?.pages[0]?.items ?? [];
  const listaPromociones = promociones.data?.pages[0]?.items ?? [];
  const listaRecomendados = (recomendaciones ?? [])
    .map((r) => r.producto)
    .filter((p): p is Producto => Boolean(p));

  if (novedades.isLoading) {
    return (
      <Pantalla>
        <Cargando mensaje="Preparando la tienda..." />
      </Pantalla>
    );
  }

  if (novedades.isError) {
    return (
      <Pantalla>
        <ErrorVista error={novedades.error} onReintentar={() => void novedades.refetch()} />
      </Pantalla>
    );
  }

  return (
    <Pantalla>
      <ScrollView
        contentContainerStyle={estilos.contenido}
        showsVerticalScrollIndicator={false}
      >
        <View style={estilos.hero}>
          <Text style={estilos.saludo}>
            {usuario ? `Hola, ${usuario.nombre.split(' ')[0]}` : 'Bienvenida a'}
          </Text>
          <Text style={estilos.marca}>FashionStore</Text>
          <Text style={estilos.lema}>
            Coleccion de temporada, disponible en nuestras sucursales y lista para probar.
          </Text>
          <Pressable
            style={estilos.botonHero}
            accessibilityRole="button"
            onPress={() => navigation.navigate('Catalogo')}
          >
            <Text style={estilos.botonHeroTexto}>Explorar catalogo</Text>
            <Ionicons name="arrow-forward" size={16} color={colores.blanco} />
          </Pressable>
        </View>

        <View style={estilos.seccion}>
          <FlatList
            horizontal
            data={categorias ?? []}
            keyExtractor={(c) => String(c.id_categoria)}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={estilos.filaCategorias}
            renderItem={({ item }) => (
              <Pressable
                style={estilos.categoria}
                accessibilityRole="button"
                onPress={() =>
                  navigation.navigate('Catalogo', {
                    filtros: { id_categoria: item.id_categoria },
                  })
                }
              >
                <Text style={estilos.categoriaTexto}>{item.nombre}</Text>
              </Pressable>
            )}
          />
        </View>

        {listaPromociones.length > 0 ? (
          <View style={estilos.seccion}>
            <TituloSeccion
              titulo="Promociones"
              detalle="Descuentos vigentes esta temporada"
              accion={
                <Pressable
                  onPress={() =>
                    navigation.navigate('Catalogo', {
                      filtros: { solo_promocion: true, orden: 'descuento' },
                    })
                  }
                >
                  <Text style={estilos.verTodo}>Ver todo</Text>
                </Pressable>
              }
            />
            <Carrusel productos={listaPromociones} onPress={abrirProducto} />
          </View>
        ) : null}

        {listaRecomendados.length > 0 ? (
          <View style={estilos.seccion}>
            <TituloSeccion titulo="Recomendado para ti" detalle="Segun tus compras y el stock actual" />
            <Carrusel productos={listaRecomendados} onPress={abrirProducto} />
          </View>
        ) : null}

        <View style={estilos.seccion}>
          <TituloSeccion titulo="Novedades" detalle="Prendas con stock en sucursales" />
          <Carrusel productos={listaNovedades} onPress={abrirProducto} />
        </View>

        <View style={estilos.seccion}>
          <TituloSeccion titulo="Que quieres hacer" />
          <View style={estilos.accesos}>
            {ACCESOS.map((acceso, i) => (
              <Pressable
                key={acceso.titulo}
                style={estilos.acceso}
                accessibilityRole="button"
                onPress={() => {
                  if (i === 0) navigation.navigate('Catalogo', { filtros: { solo_disponibles: true } });
                  else if (i === 1) navigation.navigate('NuevaReserva');
                  else navigation.navigate('Asistente');
                }}
              >
                <View style={estilos.accesoIcono}>
                  <Ionicons name={acceso.icono} size={19} color={colores.acento} />
                </View>
                <View style={estilos.accesoTextos}>
                  <Text style={estilos.accesoTitulo}>{acceso.titulo}</Text>
                  <Text style={estilos.accesoDetalle}>{acceso.detalle}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colores.tinta3} />
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </Pantalla>
  );
}

function Carrusel({ productos, onPress }: { productos: Producto[]; onPress: (p: Producto) => void }) {
  return (
    <FlatList
      horizontal
      data={productos}
      keyExtractor={(p) => String(p.id_producto)}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={estilos.carrusel}
      renderItem={({ item }) => (
        <TarjetaProducto producto={item} ancho={ANCHO_TARJETA} onPress={onPress} />
      )}
      initialNumToRender={3}
      windowSize={5}
      removeClippedSubviews
    />
  );
}

const estilos = StyleSheet.create({
  contenido: { paddingBottom: esp.xxl },
  hero: {
    marginHorizontal: esp.l,
    marginTop: esp.s,
    padding: esp.xl,
    borderRadius: radio.l,
    backgroundColor: colores.tinta,
    gap: esp.xs,
  },
  saludo: { ...texto.etiqueta, color: colores.crema2, textTransform: 'uppercase' },
  marca: { ...texto.display, color: colores.blanco, fontSize: 30 },
  lema: { ...texto.cuerpo, color: colores.crema2, marginTop: esp.xs },
  botonHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: esp.s,
    alignSelf: 'flex-start',
    marginTop: esp.m,
    backgroundColor: colores.acento,
    paddingHorizontal: esp.l,
    paddingVertical: esp.m,
    borderRadius: radio.pill,
  },
  botonHeroTexto: { ...texto.cuerpo, color: colores.blanco, fontWeight: '600' },
  seccion: { marginTop: esp.xl, paddingHorizontal: esp.l },
  filaCategorias: { gap: esp.s, paddingRight: esp.l },
  categoria: {
    paddingHorizontal: esp.l,
    paddingVertical: esp.m,
    borderRadius: radio.m,
    backgroundColor: colores.blanco,
    borderWidth: 1,
    borderColor: colores.borde,
  },
  categoriaTexto: { ...texto.cuerpo, fontWeight: '500', color: colores.tinta },
  verTodo: { ...texto.cuerpo, color: colores.acento, fontWeight: '600' },
  carrusel: { gap: esp.m, paddingRight: esp.l, paddingVertical: 2 },
  accesos: { gap: esp.s },
  acceso: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: esp.m,
    padding: esp.m,
    borderRadius: radio.m,
    backgroundColor: colores.blanco,
    borderWidth: 1,
    borderColor: colores.borde,
  },
  accesoIcono: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colores.acentoSuave,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accesoTextos: { flex: 1, gap: 1 },
  accesoTitulo: { ...texto.cuerpo, fontWeight: '600', color: colores.tinta },
  accesoDetalle: { ...texto.menor },
});
