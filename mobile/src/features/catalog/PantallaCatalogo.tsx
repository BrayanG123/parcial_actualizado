/**
 * Catalogo: busqueda, filtros, ordenamiento y scroll infinito.
 *
 * La lista es una FlatList de dos columnas (tres en pantallas anchas) y solo
 * pide la siguiente pagina cuando el usuario llega al final.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Boton } from '../../components/Boton';
import { Cargando, ErrorVista, Vacio } from '../../components/Estados';
import { Hoja } from '../../components/Hoja';
import { Pantalla } from '../../components/Pantalla';
import { Chip } from '../../components/Selectores';
import { useCategorias, useColores, useProductos, useSucursales, useTallas } from '../../hooks/useCatalogo';
import { useDebounce } from '../../hooks/useDebounce';
import type { FiltrosProducto, OrdenCatalogo } from '../../services/catalogo.service';
import type { Producto } from '../../types/domain';
import type { PropsTab } from '../../navigation/tipos';
import { colores, esp, radio, texto } from '../../theme';
import { TarjetaProducto } from './TarjetaProducto';

const ORDENES: Array<{ valor: OrdenCatalogo; texto: string }> = [
  { valor: 'nombre', texto: 'Nombre' },
  { valor: 'precio_asc', texto: 'Menor precio' },
  { valor: 'precio_desc', texto: 'Mayor precio' },
  { valor: 'descuento', texto: 'Mayor descuento' },
];

/** Filtros que el usuario configura en el panel inferior. */
type FiltrosPanel = Omit<FiltrosProducto, 'q' | 'page' | 'page_size'>;

function contarFiltros(f: FiltrosPanel): number {
  return [
    f.id_categoria,
    f.id_talla,
    f.id_color,
    f.id_sucursal,
    f.solo_promocion || undefined,
    f.solo_disponibles || undefined,
    f.orden,
  ].filter(Boolean).length;
}

export function PantallaCatalogo({ navigation, route }: PropsTab<'Catalogo'>) {
  const inicial = route.params?.filtros ?? {};
  const [busqueda, setBusqueda] = useState(inicial.q ?? '');
  const [filtros, setFiltros] = useState<FiltrosPanel>(inicial);
  const [borrador, setBorrador] = useState<FiltrosPanel>(inicial);
  const [panelAbierto, setPanelAbierto] = useState(false);

  const busquedaDiferida = useDebounce(busqueda);
  const { width } = useWindowDimensions();

  // La pestana ya esta montada cuando Inicio navega hacia ella con filtros
  // nuevos (una categoria, las promociones): hay que adoptarlos.
  const parametros = route.params?.filtros;
  useEffect(() => {
    if (!parametros) return;
    setFiltros(parametros);
    setBorrador(parametros);
    setBusqueda(parametros.q ?? '');
  }, [parametros]);

  // En telefonos anchos y tablets entra una columna mas sin apretar el diseno.
  const columnas = width >= 620 ? 3 : 2;
  const anchoTarjeta = (width - esp.l * 2 - esp.m * (columnas - 1)) / columnas;

  const consulta = useMemo<FiltrosProducto>(
    () => ({ ...filtros, q: busquedaDiferida.trim() || undefined }),
    [filtros, busquedaDiferida],
  );

  const { data, isLoading, isError, error, refetch, isRefetching, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useProductos(consulta);

  const productos = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);
  const total = data?.pages[0]?.total ?? 0;

  const { data: categorias } = useCategorias();
  const { data: tallas } = useTallas();
  const { data: coloresCatalogo } = useColores();
  const { data: sucursales } = useSucursales();

  const abrirProducto = useCallback(
    (producto: Producto) =>
      navigation.navigate('Producto', { id: producto.id_producto, nombre: producto.nombre }),
    [navigation],
  );

  const aplicar = () => {
    setFiltros(borrador);
    setPanelAbierto(false);
  };

  const limpiar = () => {
    setBorrador({});
    setFiltros({});
    setPanelAbierto(false);
  };

  const activos = contarFiltros(filtros);

  const cabecera = (
    <View style={estilos.cabecera}>
      <View style={estilos.buscador}>
        <Ionicons name="search" size={18} color={colores.tinta3} />
        <TextInput
          value={busqueda}
          onChangeText={setBusqueda}
          placeholder="Buscar prendas, categorias..."
          placeholderTextColor={colores.tinta3}
          style={estilos.inputBusqueda}
          returnKeyType="search"
          autoCorrect={false}
        />
        {busqueda ? (
          <Pressable onPress={() => setBusqueda('')} hitSlop={10} accessibilityLabel="Limpiar busqueda">
            <Ionicons name="close-circle" size={17} color={colores.tinta3} />
          </Pressable>
        ) : null}
      </View>
      <Pressable
        onPress={() => {
          setBorrador(filtros);
          setPanelAbierto(true);
        }}
        accessibilityRole="button"
        accessibilityLabel="Abrir filtros"
        style={estilos.botonFiltro}
      >
        <Ionicons name="options-outline" size={20} color={colores.tinta} />
        {activos > 0 ? (
          <View style={estilos.contadorFiltros}>
            <Text style={estilos.contadorFiltrosTexto}>{activos}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );

  const categoriasFila = (
    <FlatList
      horizontal
      data={[{ id_categoria: 0, nombre: 'Todo', descripcion: '' }, ...(categorias ?? [])]}
      keyExtractor={(c) => String(c.id_categoria)}
      showsHorizontalScrollIndicator={false}
      style={estilos.filaChipsCaja}
      contentContainerStyle={estilos.filaChips}
      renderItem={({ item }) => (
        <Chip
          texto={item.nombre}
          activo={(filtros.id_categoria ?? 0) === item.id_categoria}
          onPress={() =>
            setFiltros((f) => ({ ...f, id_categoria: item.id_categoria === 0 ? undefined : item.id_categoria }))
          }
        />
      )}
    />
  );

  function contenido() {
    if (isLoading) return <Cargando mensaje="Buscando prendas..." />;
    if (isError) return <ErrorVista error={error} onReintentar={() => void refetch()} />;

    return (
      <FlatList
        data={productos}
        keyExtractor={(p) => String(p.id_producto)}
        numColumns={columnas}
        key={columnas}
        columnWrapperStyle={estilos.columna}
        contentContainerStyle={estilos.lista}
        renderItem={({ item }) => (
          <TarjetaProducto producto={item} ancho={anchoTarjeta} onPress={abrirProducto} />
        )}
        ListHeaderComponent={
          productos.length > 0 ? (
            <Text style={estilos.resumen}>
              {total} {total === 1 ? 'prenda encontrada' : 'prendas encontradas'}
            </Text>
          ) : null
        }
        ListEmptyComponent={
          <Vacio
            icono="search-outline"
            titulo="Sin resultados"
            detalle="Prueba con otra busqueda o quita algunos filtros."
            accion={activos > 0 || busqueda ? { titulo: 'Limpiar filtros', onPress: limpiar } : undefined}
          />
        }
        ListFooterComponent={
          isFetchingNextPage ? <ActivityIndicator style={estilos.pie} color={colores.acento} /> : null
        }
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
        }}
        refreshing={isRefetching}
        onRefresh={() => void refetch()}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
      />
    );
  }

  return (
    <Pantalla>
      {cabecera}
      {categoriasFila}
      {contenido()}

      <Hoja
        visible={panelAbierto}
        titulo="Filtros"
        onCerrar={() => setPanelAbierto(false)}
        pie={
          <View style={estilos.pieHoja}>
            <Boton titulo="Limpiar" variante="secundario" onPress={limpiar} estilo={estilos.mitad} />
            <Boton titulo="Aplicar" onPress={aplicar} estilo={estilos.mitad} />
          </View>
        }
      >
        <GrupoFiltro titulo="Ordenar por">
          {ORDENES.map((o) => (
            <Chip
              key={o.valor}
              texto={o.texto}
              activo={borrador.orden === o.valor}
              onPress={() =>
                setBorrador((f) => ({ ...f, orden: f.orden === o.valor ? undefined : o.valor }))
              }
            />
          ))}
        </GrupoFiltro>

        <GrupoFiltro titulo="Talla">
          {(tallas ?? []).map((t) => (
            <Chip
              key={t.id_talla}
              texto={t.nombre}
              activo={borrador.id_talla === t.id_talla}
              onPress={() =>
                setBorrador((f) => ({ ...f, id_talla: f.id_talla === t.id_talla ? undefined : t.id_talla }))
              }
            />
          ))}
        </GrupoFiltro>

        <GrupoFiltro titulo="Color">
          {(coloresCatalogo ?? []).map((c) => (
            <Chip
              key={c.id_color}
              texto={c.nombre}
              activo={borrador.id_color === c.id_color}
              onPress={() =>
                setBorrador((f) => ({ ...f, id_color: f.id_color === c.id_color ? undefined : c.id_color }))
              }
            />
          ))}
        </GrupoFiltro>

        <GrupoFiltro titulo="Disponible en sucursal">
          {(sucursales ?? []).map((s) => (
            <Chip
              key={s.id_sucursal}
              texto={s.nombre.replace('FashionStore ', '')}
              activo={borrador.id_sucursal === s.id_sucursal}
              onPress={() =>
                setBorrador((f) => ({
                  ...f,
                  id_sucursal: f.id_sucursal === s.id_sucursal ? undefined : s.id_sucursal,
                }))
              }
            />
          ))}
        </GrupoFiltro>

        <GrupoFiltro titulo="Otros">
          <Chip
            texto="Solo promociones"
            activo={Boolean(borrador.solo_promocion)}
            onPress={() => setBorrador((f) => ({ ...f, solo_promocion: !f.solo_promocion || undefined }))}
          />
          <Chip
            texto="Solo con stock"
            activo={Boolean(borrador.solo_disponibles)}
            onPress={() => setBorrador((f) => ({ ...f, solo_disponibles: !f.solo_disponibles || undefined }))}
          />
        </GrupoFiltro>
      </Hoja>
    </Pantalla>
  );
}

function GrupoFiltro({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <View style={estilos.grupo}>
      <Text style={estilos.grupoTitulo}>{titulo}</Text>
      <View style={estilos.grupoOpciones}>{children}</View>
    </View>
  );
}

const estilos = StyleSheet.create({
  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: esp.s,
    paddingHorizontal: esp.l,
    paddingTop: esp.s,
    paddingBottom: esp.m,
  },
  buscador: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: esp.s,
    backgroundColor: colores.blanco,
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: radio.pill,
    paddingHorizontal: esp.m,
    height: 44,
  },
  inputBusqueda: { flex: 1, ...texto.cuerpo, color: colores.tinta, paddingVertical: 0 },
  botonFiltro: {
    width: 44,
    height: 44,
    borderRadius: radio.pill,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.blanco,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contadorFiltros: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colores.acento,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  contadorFiltrosTexto: { color: colores.blanco, fontSize: 10, fontWeight: '700' },
  filaChips: { paddingHorizontal: esp.l, gap: esp.s, paddingBottom: esp.m },
  /** La fila de chips conserva su alto: no debe encogerse frente a la lista. */
  filaChipsCaja: { flexGrow: 0, flexShrink: 0 },

  lista: { paddingHorizontal: esp.l, paddingBottom: esp.xxl, gap: esp.m },
  columna: { gap: esp.m },
  resumen: { ...texto.menor, marginBottom: esp.s },
  pie: { paddingVertical: esp.l },
  grupo: { gap: esp.s },
  grupoTitulo: { ...texto.etiqueta, textTransform: 'uppercase' },
  grupoOpciones: { flexDirection: 'row', flexWrap: 'wrap', gap: esp.s },
  pieHoja: { flexDirection: 'row', gap: esp.m },
  mitad: { flex: 1 },
});
