/**
 * Historial de compras del cliente.
 * Incluye las ventas de los tres canales (presencial, web y movil) porque son
 * compras de la misma persona; el canal se muestra como etiqueta.
 */
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Cargando, ErrorVista, Vacio } from '../../components/Estados';
import { ImagenProducto } from '../../components/ImagenProducto';
import { Insignia, InsigniaVenta } from '../../components/Insignias';
import { Pantalla } from '../../components/Pantalla';
import { RequiereSesion } from '../../components/RequiereSesion';
import { Chip } from '../../components/Selectores';
import { useSesion } from '../../context/SesionContext';
import { useCompras } from '../../hooks/useComercio';
import { fecha, moneda, plural } from '../../lib/format';
import type { PropsStack } from '../../navigation/tipos';
import { CanalVenta, type Venta } from '../../types/domain';
import { colores, esp, radio, texto } from '../../theme';

const CANALES: Array<{ texto: string; canal?: CanalVenta }> = [
  { texto: 'Todas' },
  { texto: 'Desde la app', canal: CanalVenta.MOVIL },
  { texto: 'Web', canal: CanalVenta.WEB },
  { texto: 'En tienda', canal: CanalVenta.PRESENCIAL },
];

const ETIQUETA_CANAL: Record<string, string> = {
  [CanalVenta.MOVIL]: 'App',
  [CanalVenta.WEB]: 'Web',
  [CanalVenta.PRESENCIAL]: 'Tienda',
};

export function PantallaCompras({ navigation }: PropsStack<'Compras'>) {
  const { autenticado } = useSesion();
  const [canal, setCanal] = useState<CanalVenta>();
  const compras = useCompras(canal ? { canal } : {});

  if (!autenticado) {
    return (
      <Pantalla bordes={['bottom']}>
        <RequiereSesion
          titulo="Tus compras"
          detalle="Inicia sesion para ver el historial de tus pedidos."
          onAcceder={() => navigation.navigate('Acceso', { motivo: 'Inicia sesion para ver tus compras.' })}
        />
      </Pantalla>
    );
  }

  const items = compras.data?.items ?? [];

  return (
    <Pantalla bordes={['bottom']}>
      <FlatList
        horizontal
        data={CANALES}
        keyExtractor={(c) => c.texto}
        showsHorizontalScrollIndicator={false}
        style={estilos.filaChipsCaja}
        contentContainerStyle={estilos.filaChips}
        renderItem={({ item }) => (
          <Chip texto={item.texto} activo={canal === item.canal} onPress={() => setCanal(item.canal)} />
        )}
      />

      {compras.isLoading ? (
        <Cargando mensaje="Cargando tus compras..." />
      ) : compras.isError ? (
        <ErrorVista error={compras.error} onReintentar={() => void compras.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(v) => String(v.id_venta)}
          contentContainerStyle={estilos.lista}
          showsVerticalScrollIndicator={false}
          refreshing={compras.isRefetching}
          onRefresh={() => void compras.refetch()}
          ListEmptyComponent={
            <Vacio
              icono="receipt-outline"
              titulo="Sin compras todavia"
              detalle="Cuando completes una compra la veras aqui."
              accion={{ titulo: 'Ver catalogo', onPress: () => navigation.navigate('Tabs') }}
            />
          }
          renderItem={({ item }) => (
            <TarjetaCompra
              venta={item}
              onPress={() => navigation.navigate('DetalleCompra', { id: item.id_venta })}
            />
          )}
        />
      )}
    </Pantalla>
  );
}

function TarjetaCompra({ venta, onPress }: { venta: Venta; onPress: () => void }) {
  const unidades = venta.detalles.reduce((acc, d) => acc + d.cantidad, 0);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [estilos.tarjeta, pressed && estilos.presionada]}
    >
      <View style={estilos.tarjetaEncabezado}>
        <View style={estilos.flex}>
          <Text style={estilos.tarjetaTitulo}>Pedido #{venta.id_venta}</Text>
          <Text style={estilos.detalle}>{fecha(venta.fecha)}</Text>
        </View>
        <View style={estilos.insignias}>
          <Insignia texto={ETIQUETA_CANAL[venta.canal] ?? venta.canal} tono="info" />
          <InsigniaVenta estado={venta.estado} />
        </View>
      </View>

      <View style={estilos.miniaturas}>
        {venta.detalles.slice(0, 4).map((d) => (
          <ImagenProducto
            key={d.id_detalle_venta}
            url={d.producto?.imagen_url}
            claveReciclado={d.id_detalle_venta}
            estilo={estilos.miniatura}
          />
        ))}
      </View>

      <View style={estilos.tarjetaPie}>
        <Text style={estilos.detalle}>{plural(unidades, 'prenda', 'prendas')}</Text>
        <View style={estilos.totalFila}>
          <Text style={estilos.total}>{moneda(venta.total)}</Text>
          <Ionicons name="chevron-forward" size={17} color={colores.tinta3} />
        </View>
      </View>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  filaChips: { paddingHorizontal: esp.l, gap: esp.s, paddingVertical: esp.m },
  /** La fila de chips conserva su alto: no debe encogerse frente a la lista. */
  filaChipsCaja: { flexGrow: 0, flexShrink: 0 },

  lista: { paddingHorizontal: esp.l, paddingBottom: esp.xl, gap: esp.m, flexGrow: 1 },
  tarjeta: {
    padding: esp.m,
    borderRadius: radio.m,
    backgroundColor: colores.blanco,
    borderWidth: 1,
    borderColor: colores.borde,
    gap: esp.m,
  },
  presionada: { opacity: 0.9 },
  tarjetaEncabezado: { flexDirection: 'row', alignItems: 'flex-start', gap: esp.m },
  tarjetaTitulo: { ...texto.cuerpo, fontWeight: '600', color: colores.tinta },
  detalle: { ...texto.menor },
  insignias: { alignItems: 'flex-end', gap: 4 },
  miniaturas: { flexDirection: 'row', gap: esp.s },
  miniatura: { width: 46, height: 60 },
  tarjetaPie: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  totalFila: { flexDirection: 'row', alignItems: 'center', gap: esp.xs },
  total: { ...texto.cuerpo, fontWeight: '700', color: colores.tinta },
});
