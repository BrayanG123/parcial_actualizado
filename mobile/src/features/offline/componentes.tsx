import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Insignia } from '../../components/Insignias';
import { antiguedad, DESACTUALIZADO_MS } from '../../hooks/useOffline';
import { moneda } from '../../lib/format';
import type { Descarga, EstadoOperacion, ItemSeleccion, OperacionLocal, VarianteLocal } from '../../offline/tipos';
import { colores, esp, radio, texto } from '../../theme';

const clave = (v: { productId: number; sizeId: number; colorId: number }) => `${v.productId}:${v.sizeId}:${v.colorId}`;
const claveVariante = (v: VarianteLocal) => `${v.producto_id}:${v.talla_id}:${v.color_id}`;

export function AvisoDescarga({ descarga }: { descarga: Descarga }) {
  const viejo = Date.now() - Date.parse(descarga.generado_en) > DESACTUALIZADO_MS;
  return (
    <View style={[estilos.aviso, { backgroundColor: viejo ? colores.alertaSuave : colores.infoSuave }]}>
      <Text style={texto.cuerpo}>
        Datos de {descarga.sucursal} descargados {antiguedad(descarga.generado_en)}.
        {viejo ? ' Pueden estar desactualizados.' : ''} Precio y stock se confirman al sincronizar.
      </Text>
    </View>
  );
}

/** Catalogo descargado con stock conocido; permite sumar o quitar unidades. */
export function CatalogoLocal({
  variantes,
  seleccion,
  onCambiar,
}: {
  variantes: VarianteLocal[];
  seleccion: ItemSeleccion[];
  onCambiar: (s: ItemSeleccion[]) => void;
}) {
  const productos = new Map<number, VarianteLocal[]>();
  for (const v of variantes) productos.set(v.producto_id, [...(productos.get(v.producto_id) ?? []), v]);
  const cantidad = (v: VarianteLocal) => seleccion.find((i) => clave(i) === claveVariante(v))?.quantity ?? 0;
  function cambiar(v: VarianteLocal, delta: number) {
    const nueva = Math.max(0, Math.min(100, v.stock_local, cantidad(v) + delta));
    const resto = seleccion.filter((i) => clave(i) !== claveVariante(v));
    onCambiar(nueva ? [...resto, { productId: v.producto_id, sizeId: v.talla_id, colorId: v.color_id, quantity: nueva }] : resto);
  }
  if (!variantes.length) return <Text style={texto.cuerpo}>No hay prendas descargadas.</Text>;
  return (
    <View style={{ gap: esp.m }}>
      {[...productos.values()].map((vs) => (
        <View key={vs[0]!.producto_id} style={estilos.tarjeta}>
          <Text style={texto.subtitulo}>{vs[0]!.producto}</Text>
          <Text style={texto.menor}>{vs[0]!.categoria}</Text>
          {vs.map((v) => (
            <View key={claveVariante(v)} style={estilos.fila}>
              <View style={[estilos.color, { backgroundColor: v.hex }]} />
              <Text style={[texto.cuerpo, { flex: 1 }]}>
                {v.talla} / {v.color} · {moneda(v.precio_neto)} · stock {v.stock_local - cantidad(v)}
              </Text>
              {cantidad(v) > 0 && (
                <Pressable accessibilityLabel={`Quitar ${v.producto}`} onPress={() => cambiar(v, -1)} hitSlop={8}>
                  <Ionicons name="remove-circle-outline" size={26} color={colores.acento} />
                </Pressable>
              )}
              {cantidad(v) > 0 && <Text style={texto.subtitulo}>{cantidad(v)}</Text>}
              <Pressable
                accessibilityLabel={`Agregar ${v.producto} ${v.talla} ${v.color}`}
                disabled={v.stock_local - cantidad(v) <= 0}
                onPress={() => cambiar(v, 1)}
                hitSlop={8}
              >
                <Ionicons
                  name="add-circle"
                  size={26}
                  color={v.stock_local - cantidad(v) > 0 ? colores.acento : colores.borde}
                />
              </Pressable>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const ESTADOS: Record<EstadoOperacion, { texto: string; tono: 'neutro' | 'exito' | 'alerta' | 'error' | 'info' }> = {
  LOCAL: { texto: 'Guardada localmente', tono: 'info' },
  SENDING: { texto: 'Enviando', tono: 'info' },
  RETRY: { texto: 'Reintento pendiente', tono: 'alerta' },
  CONFIRMED: { texto: 'Confirmada', tono: 'exito' },
  CONFLICT: { texto: 'En conflicto', tono: 'error' },
  REJECTED: { texto: 'Rechazada', tono: 'error' },
  DESCARTADA: { texto: 'Descartada', tono: 'neutro' },
};

const EXPLICACION: Record<string, string> = {
  STOCK_INSUFFICIENT: 'El servidor no tiene existencias suficientes.',
  PRICE_CHANGED: 'El precio cambio respecto al usado en el telefono.',
  PRODUCT_INACTIVE: 'La prenda ya no esta disponible.',
  BRANCH_NOT_AUTHORIZED: 'La operacion no corresponde a tu sucursal.',
  SHIFT_CLOSED: 'El turno se cerro antes de sincronizar.',
  SUBSCRIPTION_INVALID: 'La suscripcion de la empresa no esta vigente; se reintentara.',
  RESERVATION_TIME_PASSED: 'El horario de la reserva ya paso.',
  NETWORK_ERROR: 'Sin conexion; se reintentara automaticamente.',
  ROLE_NOT_ALLOWED: 'Tu cuenta no puede registrar esta operacion.',
};

export function TarjetaOperacion({
  op,
  onReintentar,
  onDescartar,
}: {
  op: OperacionLocal;
  onReintentar?: () => void;
  onDescartar?: () => void;
}) {
  const estado = ESTADOS[op.estado];
  const detalle = op.detalle
    ? (JSON.parse(op.detalle) as { variants?: Array<{ requested?: number; available?: number; localUnitPrice?: number; currentUnitPrice?: number }> })
    : null;
  return (
    <View style={estilos.tarjeta}>
      <View style={estilos.fila}>
        <Text style={[texto.subtitulo, { flex: 1 }]}>{op.titulo}</Text>
        <Insignia texto={estado.texto} tono={estado.tono} />
      </View>
      <Text style={texto.menor}>
        {new Date(op.creada_local).toLocaleString()} · id {op.operation_id.slice(0, 8)} · intentos {op.intentos}
        {op.total !== null ? ` · ${moneda(op.total)}` : ''}
      </Text>
      {op.lineas.map((l) => (
        <Text key={l.n} style={texto.cuerpo}>
          {l.cantidad} × {l.nombre}
        </Text>
      ))}
      {op.recurso_id ? (
        <Text style={texto.cuerpo}>
          Confirmada como {op.recurso_tipo === 'SALE' ? 'venta' : 'reserva'} #{op.recurso_id}
        </Text>
      ) : null}
      {op.codigo && op.estado !== 'CONFIRMED' ? (
        <Text style={[texto.cuerpo, { color: colores.error }]}>
          {op.codigo}: {EXPLICACION[op.codigo] ?? op.mensaje}
        </Text>
      ) : null}
      {detalle?.variants?.map((v, i) => (
        <Text key={i} style={texto.menor}>
          {v.requested !== undefined ? `Solicitado ${v.requested}, disponible ${v.available}` : ''}
          {v.currentUnitPrice !== undefined ? `Precio local ${v.localUnitPrice}, vigente ${v.currentUnitPrice}` : ''}
        </Text>
      ))}
      <View style={estilos.fila}>
        {onReintentar && (op.estado === 'CONFLICT' || op.estado === 'RETRY') && (
          <Pressable onPress={onReintentar} style={estilos.accion}>
            <Text style={estilos.accionTexto}>Reintentar</Text>
          </Pressable>
        )}
        {onDescartar && ['CONFLICT', 'REJECTED', 'RETRY', 'LOCAL'].includes(op.estado) && (
          <Pressable onPress={onDescartar} style={estilos.accion}>
            <Text style={estilos.accionTexto}>Descartar</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  aviso: { padding: esp.m, borderRadius: radio.m },
  tarjeta: {
    backgroundColor: colores.blanco,
    borderRadius: radio.m,
    borderWidth: 1,
    borderColor: colores.borde,
    padding: esp.m,
    gap: esp.xs,
  },
  fila: { flexDirection: 'row', alignItems: 'center', gap: esp.s, flexWrap: 'wrap' },
  color: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: colores.borde },
  accion: { paddingVertical: esp.xs, paddingHorizontal: esp.m, borderRadius: radio.pill, borderWidth: 1, borderColor: colores.acento },
  accionTexto: { color: colores.acento, fontWeight: '600' },
});
