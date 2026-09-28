/** Reservas del cliente: estado actual de cada visita a tienda. */
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Boton } from '../../components/Boton';
import { Cargando, ErrorVista, Vacio } from '../../components/Estados';
import { ImagenProducto } from '../../components/ImagenProducto';
import { InsigniaReserva } from '../../components/Insignias';
import { Pantalla } from '../../components/Pantalla';
import { RequiereSesion } from '../../components/RequiereSesion';
import { Chip } from '../../components/Selectores';
import { useSesion } from '../../context/SesionContext';
import { useReservas } from '../../hooks/useComercio';
import { fechaRelativa, hora, plural } from '../../lib/format';
import type { PropsTab } from '../../navigation/tipos';
import { EstadoReserva, type Reserva } from '../../types/domain';
import { colores, esp, radio, texto } from '../../theme';

const FILTROS: Array<{ texto: string; estado?: EstadoReserva }> = [
  { texto: 'Todas' },
  { texto: 'Pendientes', estado: EstadoReserva.PENDIENTE },
  { texto: 'Preparando', estado: EstadoReserva.PREPARANDO },
  { texto: 'Listas', estado: EstadoReserva.LISTA },
  { texto: 'Atendidas', estado: EstadoReserva.ATENDIDA },
  { texto: 'Canceladas', estado: EstadoReserva.CANCELADA },
];

export function PantallaReservas({ navigation }: PropsTab<'Reservas'>) {
  const { autenticado } = useSesion();
  const [estado, setEstado] = useState<EstadoReserva>();
  const reservas = useReservas(estado ? { estado } : {});

  if (!autenticado) {
    return (
      <Pantalla>
        <RequiereSesion
          titulo="Tus reservas"
          detalle="Inicia sesion para ver las prendas que apartaste y su estado."
          onAcceder={() => navigation.navigate('Acceso', { motivo: 'Inicia sesion para ver tus reservas.' })}
        />
      </Pantalla>
    );
  }

  const items = reservas.data?.items ?? [];

  return (
    <Pantalla>
      <View style={estilos.encabezado}>
        <View style={estilos.flex}>
          <Text style={estilos.titulo}>Mis reservas</Text>
          <Text style={estilos.detalle}>Prendas apartadas para probar en tienda</Text>
        </View>
        <Boton
          titulo="Nueva"
          icono="add"
          tamano="compacto"
          onPress={() => navigation.navigate('NuevaReserva')}
        />
      </View>

      <FlatList
        horizontal
        data={FILTROS}
        keyExtractor={(f) => f.texto}
        showsHorizontalScrollIndicator={false}
        style={estilos.filaChipsCaja}
        contentContainerStyle={estilos.filaChips}
        renderItem={({ item }) => (
          <Chip texto={item.texto} activo={estado === item.estado} onPress={() => setEstado(item.estado)} />
        )}
      />

      {reservas.isLoading ? (
        <Cargando mensaje="Cargando tus reservas..." />
      ) : reservas.isError ? (
        <ErrorVista error={reservas.error} onReintentar={() => void reservas.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(r) => String(r.id_reserva)}
          contentContainerStyle={estilos.lista}
          showsVerticalScrollIndicator={false}
          refreshing={reservas.isRefetching}
          onRefresh={() => void reservas.refetch()}
          ListEmptyComponent={
            <Vacio
              icono="calendar-outline"
              titulo="Sin reservas"
              detalle={
                estado
                  ? 'No tienes reservas en ese estado.'
                  : 'Aparta prendas desde el catalogo para probartelas en tienda.'
              }
              accion={{ titulo: 'Ir al catalogo', onPress: () => navigation.navigate('Catalogo') }}
            />
          }
          renderItem={({ item }) => (
            <TarjetaReserva
              reserva={item}
              onPress={() => navigation.navigate('DetalleReserva', { id: item.id_reserva })}
            />
          )}
        />
      )}
    </Pantalla>
  );
}

function TarjetaReserva({ reserva, onPress }: { reserva: Reserva; onPress: () => void }) {
  const unidades = reserva.detalles.reduce((acc, d) => acc + d.cantidad, 0);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [estilos.tarjeta, pressed && estilos.presionada]}
    >
      <View style={estilos.tarjetaEncabezado}>
        <View style={estilos.flex}>
          <Text style={estilos.tarjetaTitulo}>{reserva.sucursal?.nombre ?? 'Sucursal'}</Text>
          <Text style={estilos.detalle}>
            {fechaRelativa(reserva.horario_aproximado)} a las {hora(reserva.horario_aproximado)}
          </Text>
        </View>
        <InsigniaReserva estado={reserva.estado} />
      </View>

      <View style={estilos.miniaturas}>
        {reserva.detalles.slice(0, 4).map((d) => (
          <ImagenProducto
            key={d.id_detalle_reserva}
            url={d.producto?.imagen_url}
            claveReciclado={d.id_detalle_reserva}
            estilo={estilos.miniatura}
          />
        ))}
        {reserva.detalles.length > 4 ? (
          <View style={[estilos.miniatura, estilos.miniaturaMas]}>
            <Text style={estilos.miniaturaMasTexto}>+{reserva.detalles.length - 4}</Text>
          </View>
        ) : null}
      </View>

      <View style={estilos.tarjetaPie}>
        <Text style={estilos.detalle}>{plural(unidades, 'prenda', 'prendas')}</Text>
        <Ionicons name="chevron-forward" size={17} color={colores.tinta3} />
      </View>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  encabezado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: esp.m,
    paddingHorizontal: esp.l,
    paddingTop: esp.s,
    paddingBottom: esp.m,
  },
  titulo: { ...texto.titulo },
  detalle: { ...texto.menor },
  filaChips: { paddingHorizontal: esp.l, gap: esp.s, paddingBottom: esp.m },
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
  miniaturas: { flexDirection: 'row', gap: esp.s },
  miniatura: { width: 48, height: 62 },
  miniaturaMas: {
    backgroundColor: colores.crema2,
    borderRadius: radio.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniaturaMasTexto: { ...texto.menor, fontWeight: '600', color: colores.tinta2 },
  tarjetaPie: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
