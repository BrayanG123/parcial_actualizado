/**
 * Detalle de una reserva con su linea de estados.
 * Los estados son los siete del dominio; el avance lo decide la tienda, el
 * cliente solo puede cancelar mientras la reserva siga abierta.
 */
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Boton } from '../../components/Boton';
import { Cargando, ErrorVista } from '../../components/Estados';
import { ImagenProducto } from '../../components/ImagenProducto';
import { InsigniaReserva } from '../../components/Insignias';
import { Pantalla } from '../../components/Pantalla';
import { useAvisos } from '../../context/AvisosContext';
import { useCancelarReserva } from '../../hooks/useComercio';
import { fechaHora, fechaRelativa, hora } from '../../lib/format';
import { reservasService } from '../../services/comercio.service';
import type { PropsStack } from '../../navigation/tipos';
import { EstadoReserva } from '../../types/domain';
import { colores, esp, radio, texto } from '../../theme';

/** Avance normal de una reserva atendida. */
const PASOS: Array<{ estado: EstadoReserva; titulo: string; detalle: string }> = [
  { estado: EstadoReserva.PENDIENTE, titulo: 'Recibida', detalle: 'La tienda vio tu solicitud' },
  { estado: EstadoReserva.PREPARANDO, titulo: 'Preparando', detalle: 'Estan juntando tus prendas' },
  { estado: EstadoReserva.LISTA, titulo: 'Lista', detalle: 'Te esperan en el probador' },
  { estado: EstadoReserva.CLIENTE_PRESENTE, titulo: 'En tienda', detalle: 'Llegaste a la sucursal' },
  { estado: EstadoReserva.ATENDIDA, titulo: 'Atendida', detalle: 'Visita completada' },
];

const CERRADAS: string[] = [EstadoReserva.CANCELADA, EstadoReserva.VENCIDA];

const CANCELABLES: string[] = [
  EstadoReserva.PENDIENTE,
  EstadoReserva.PREPARANDO,
  EstadoReserva.LISTA,
  EstadoReserva.CLIENTE_PRESENTE,
];

export function PantallaDetalleReserva({ navigation, route }: PropsStack<'DetalleReserva'>) {
  const { id } = route.params;
  const { avisar, avisarError } = useAvisos();
  const cancelar = useCancelarReserva();

  const reserva = useQuery({
    queryKey: ['reserva', id],
    queryFn: () => reservasService.obtener(id),
  });

  if (reserva.isLoading) return <Cargando mensaje="Cargando reserva..." />;
  if (reserva.isError || !reserva.data) {
    return <ErrorVista error={reserva.error} onReintentar={() => void reserva.refetch()} />;
  }

  const r = reserva.data;
  const cerrada = CERRADAS.includes(r.estado);
  const indiceActual = PASOS.findIndex((p) => p.estado === r.estado);

  function confirmarCancelacion() {
    Alert.alert('Cancelar reserva', 'Se liberaran las prendas apartadas para otras clientas.', [
      { text: 'Volver', style: 'cancel' },
      {
        text: 'Cancelar reserva',
        style: 'destructive',
        onPress: async () => {
          try {
            await cancelar.mutateAsync(id);
            await reserva.refetch();
            avisar('Reserva cancelada.');
          } catch (error) {
            avisarError(error);
          }
        },
      },
    ]);
  }

  return (
    <Pantalla bordes={['bottom']}>
      <ScrollView contentContainerStyle={estilos.contenido} showsVerticalScrollIndicator={false}>
        <View style={estilos.encabezado}>
          <View style={estilos.flex}>
            <Text style={estilos.titulo}>Reserva #{r.id_reserva}</Text>
            <Text style={estilos.detalle}>Creada el {fechaHora(r.fecha_reserva)}</Text>
          </View>
          <InsigniaReserva estado={r.estado} />
        </View>

        <View style={estilos.tarjeta}>
          <Fila icono="storefront-outline" titulo={r.sucursal?.nombre ?? 'Sucursal'} detalle={r.sucursal?.direccion ?? ''} />
          <Fila
            icono="time-outline"
            titulo={`${fechaRelativa(r.horario_aproximado)} a las ${hora(r.horario_aproximado)}`}
            detalle="Horario aproximado de tu visita"
          />
          {r.sucursal?.telefono ? (
            <Fila icono="call-outline" titulo={r.sucursal.telefono} detalle="Telefono de la sucursal" />
          ) : null}
        </View>

        {cerrada ? (
          <View style={estilos.tarjeta}>
            <Text style={estilos.detalle}>
              {r.estado === EstadoReserva.CANCELADA
                ? 'Esta reserva fue cancelada y las prendas volvieron al stock.'
                : 'La reserva vencio y las prendas volvieron al stock.'}
            </Text>
          </View>
        ) : (
          <View style={estilos.tarjeta}>
            <Text style={estilos.tituloBloque}>Estado</Text>
            {PASOS.map((paso, i) => {
              const alcanzado = indiceActual >= i;
              return (
                <View key={paso.estado} style={estilos.paso}>
                  <View style={estilos.pasoIndicador}>
                    <View style={[estilos.punto, alcanzado && estilos.puntoActivo]}>
                      {alcanzado ? <Ionicons name="checkmark" size={11} color={colores.blanco} /> : null}
                    </View>
                    {i < PASOS.length - 1 ? (
                      <View style={[estilos.linea, indiceActual > i && estilos.lineaActiva]} />
                    ) : null}
                  </View>
                  <View style={estilos.pasoTextos}>
                    <Text style={[estilos.pasoTitulo, alcanzado && estilos.pasoTituloActivo]}>
                      {paso.titulo}
                    </Text>
                    <Text style={estilos.detalle}>{paso.detalle}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={estilos.tarjeta}>
          <Text style={estilos.tituloBloque}>Prendas</Text>
          {r.detalles.map((d) => (
            <View key={d.id_detalle_reserva} style={estilos.prenda}>
              <ImagenProducto
                url={d.producto?.imagen_url}
                claveReciclado={d.id_detalle_reserva}
                estilo={estilos.miniatura}
              />
              <View style={estilos.flex}>
                <Text style={estilos.prendaNombre} numberOfLines={2}>
                  {d.producto?.nombre ?? 'Prenda'}
                </Text>
                <Text style={estilos.detalle}>
                  Talla {d.talla?.nombre ?? '-'} - {d.color?.nombre ?? '-'} - x{d.cantidad}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {r.observacion ? (
          <View style={estilos.tarjeta}>
            <Text style={estilos.tituloBloque}>Tu nota</Text>
            <Text style={estilos.detalleCuerpo}>{r.observacion}</Text>
          </View>
        ) : null}

        {CANCELABLES.includes(r.estado) ? (
          <Boton
            titulo="Cancelar reserva"
            variante="peligro"
            ancho
            onPress={confirmarCancelacion}
            cargando={cancelar.isPending}
          />
        ) : null}

        <Boton
          titulo="Ver mis reservas"
          variante="plano"
          onPress={() => navigation.navigate('Tabs')}
        />
      </ScrollView>
    </Pantalla>
  );
}

function Fila({
  icono,
  titulo,
  detalle,
}: {
  icono: keyof typeof Ionicons.glyphMap;
  titulo: string;
  detalle: string;
}) {
  return (
    <View style={estilos.fila}>
      <Ionicons name={icono} size={18} color={colores.tinta3} />
      <View style={estilos.flex}>
        <Text style={estilos.filaTitulo}>{titulo}</Text>
        {detalle ? <Text style={estilos.detalle}>{detalle}</Text> : null}
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  contenido: { padding: esp.l, gap: esp.m, paddingBottom: esp.xl },
  encabezado: { flexDirection: 'row', alignItems: 'flex-start', gap: esp.m },
  titulo: { ...texto.titulo },
  detalle: { ...texto.menor },
  detalleCuerpo: { ...texto.cuerpo },
  tarjeta: {
    padding: esp.m,
    borderRadius: radio.m,
    backgroundColor: colores.blanco,
    borderWidth: 1,
    borderColor: colores.borde,
    gap: esp.m,
  },
  tituloBloque: { ...texto.subtitulo },
  fila: { flexDirection: 'row', alignItems: 'center', gap: esp.m },
  filaTitulo: { ...texto.cuerpo, fontWeight: '600', color: colores.tinta },
  paso: { flexDirection: 'row', gap: esp.m },
  pasoIndicador: { alignItems: 'center', width: 18 },
  punto: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colores.bordeFuerte,
    backgroundColor: colores.crema,
    alignItems: 'center',
    justifyContent: 'center',
  },
  puntoActivo: { backgroundColor: colores.exito, borderColor: colores.exito },
  linea: { flex: 1, width: 2, backgroundColor: colores.borde, marginVertical: 2 },
  lineaActiva: { backgroundColor: colores.exito },
  pasoTextos: { flex: 1, paddingBottom: esp.m, gap: 1 },
  pasoTitulo: { ...texto.cuerpo, color: colores.tinta3, fontWeight: '600' },
  pasoTituloActivo: { color: colores.tinta },
  prenda: { flexDirection: 'row', gap: esp.m, alignItems: 'center' },
  miniatura: { width: 52, height: 68 },
  prendaNombre: { ...texto.cuerpo, fontWeight: '600', color: colores.tinta },
});
