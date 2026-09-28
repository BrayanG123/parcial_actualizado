import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colores, esp, radio, texto } from '../theme';
import { EstadoPago, EstadoReserva, EstadoVenta } from '../types/domain';
import { etiqueta } from '../lib/format';

type Tono = 'neutro' | 'exito' | 'alerta' | 'error' | 'info' | 'acento';

const TONOS: Record<Tono, { fondo: string; color: string }> = {
  neutro: { fondo: colores.crema2, color: colores.tinta2 },
  exito: { fondo: colores.exitoSuave, color: colores.exito },
  alerta: { fondo: colores.alertaSuave, color: colores.alerta },
  error: { fondo: colores.errorSuave, color: colores.error },
  info: { fondo: colores.infoSuave, color: colores.info },
  acento: { fondo: colores.acento, color: colores.blanco },
};

interface PropsInsignia {
  texto: string;
  tono?: Tono;
  estilo?: StyleProp<ViewStyle>;
}

export function Insignia({ texto: contenido, tono = 'neutro', estilo }: PropsInsignia) {
  const paleta = TONOS[tono];
  return (
    <View style={[estilos.insignia, { backgroundColor: paleta.fondo }, estilo]}>
      <Text style={[estilos.texto, { color: paleta.color }]} numberOfLines={1}>
        {contenido}
      </Text>
    </View>
  );
}

/** Los siete estados del diagrama, con el color que corresponde a cada uno. */
const TONO_RESERVA: Record<string, Tono> = {
  [EstadoReserva.PENDIENTE]: 'alerta',
  [EstadoReserva.PREPARANDO]: 'info',
  [EstadoReserva.LISTA]: 'exito',
  [EstadoReserva.CLIENTE_PRESENTE]: 'info',
  [EstadoReserva.ATENDIDA]: 'neutro',
  [EstadoReserva.CANCELADA]: 'error',
  [EstadoReserva.VENCIDA]: 'error',
};

const TEXTO_RESERVA: Record<string, string> = {
  [EstadoReserva.PENDIENTE]: 'Pendiente',
  [EstadoReserva.PREPARANDO]: 'Preparando',
  [EstadoReserva.LISTA]: 'Lista para probar',
  [EstadoReserva.CLIENTE_PRESENTE]: 'Estas en tienda',
  [EstadoReserva.ATENDIDA]: 'Atendida',
  [EstadoReserva.CANCELADA]: 'Cancelada',
  [EstadoReserva.VENCIDA]: 'Vencida',
};

export function InsigniaReserva({ estado }: { estado: string }) {
  return <Insignia texto={TEXTO_RESERVA[estado] ?? etiqueta(estado)} tono={TONO_RESERVA[estado] ?? 'neutro'} />;
}

const TONO_VENTA: Record<string, Tono> = {
  [EstadoVenta.PENDIENTE]: 'alerta',
  [EstadoVenta.PAGADA]: 'exito',
  [EstadoVenta.ENTREGADA]: 'info',
  [EstadoVenta.ANULADA]: 'error',
  [EstadoVenta.BORRADOR]: 'neutro',
  [EstadoVenta.REEMBOLSADA]: 'neutro',
};

export function InsigniaVenta({ estado }: { estado: string }) {
  return <Insignia texto={etiqueta(estado)} tono={TONO_VENTA[estado] ?? 'neutro'} />;
}

const TONO_PAGO: Record<string, Tono> = {
  [EstadoPago.PENDIENTE]: 'alerta',
  [EstadoPago.APROBADO]: 'exito',
  [EstadoPago.RECHAZADO]: 'error',
  [EstadoPago.ANULADO]: 'neutro',
  [EstadoPago.REEMBOLSADO]: 'neutro',
};

export function InsigniaPago({ estado }: { estado: string }) {
  return <Insignia texto={etiqueta(estado)} tono={TONO_PAGO[estado] ?? 'neutro'} />;
}

/**
 * Traduce el stock tecnico a algo util para el cliente.
 * No se le muestra el numero exacto salvo cuando queda poco.
 */
export function InsigniaStock({ disponible }: { disponible: number }) {
  if (disponible <= 0) return <Insignia texto="Agotado" tono="error" />;
  if (disponible <= 3) return <Insignia texto={`Ultimas ${disponible}`} tono="alerta" />;
  return <Insignia texto="Disponible" tono="exito" />;
}

export function InsigniaDescuento({ porcentaje }: { porcentaje: number }) {
  return <Insignia texto={`-${Math.round(porcentaje)}%`} tono="acento" />;
}

const estilos = StyleSheet.create({
  insignia: {
    paddingHorizontal: esp.s,
    paddingVertical: 3,
    borderRadius: radio.pill,
    alignSelf: 'flex-start',
  },
  texto: { ...texto.menor, fontSize: 11, fontWeight: '600' },
});
