/** Detalle de una compra: prendas, totales y pagos registrados. */
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Boton } from '../../components/Boton';
import { Cargando, ErrorVista } from '../../components/Estados';
import { ImagenProducto } from '../../components/ImagenProducto';
import { Insignia, InsigniaPago, InsigniaVenta } from '../../components/Insignias';
import { Pantalla } from '../../components/Pantalla';
import { subtotal } from '../../lib/domain';
import { etiqueta, fechaHora, moneda } from '../../lib/format';
import { ventasService } from '../../services/comercio.service';
import { claves } from '../../hooks/claves';
import type { PropsStack } from '../../navigation/tipos';
import { colores, esp, radio, texto } from '../../theme';

export function PantallaDetalleCompra({ navigation, route }: PropsStack<'DetalleCompra'>) {
  const { id } = route.params;

  const venta = useQuery({
    queryKey: claves.venta(id),
    queryFn: () => ventasService.obtener(id),
  });

  if (venta.isLoading) return <Cargando mensaje="Cargando tu compra..." />;
  if (venta.isError || !venta.data) {
    return <ErrorVista error={venta.error} onReintentar={() => void venta.refetch()} />;
  }

  const v = venta.data;
  const descuentos = v.detalles.reduce((acc, d) => acc + d.descuento, 0);
  const bruto = v.detalles.reduce((acc, d) => acc + d.cantidad * d.precio_unitario, 0);

  return (
    <Pantalla bordes={['bottom']}>
      <ScrollView contentContainerStyle={estilos.contenido} showsVerticalScrollIndicator={false}>
        <View style={estilos.encabezado}>
          <View style={estilos.flex}>
            <Text style={estilos.titulo}>Pedido #{v.id_venta}</Text>
            <Text style={estilos.detalle}>{fechaHora(v.fecha)}</Text>
          </View>
          <View style={estilos.insignias}>
            <Insignia texto={etiqueta(v.canal)} tono="info" />
            <InsigniaVenta estado={v.estado} />
          </View>
        </View>

        {v.sucursal ? (
          <View style={estilos.tarjeta}>
            <Text style={estilos.tituloBloque}>Sucursal</Text>
            <Text style={estilos.cuerpo}>{v.sucursal.nombre}</Text>
            <Text style={estilos.detalle}>
              {v.sucursal.direccion} - {v.sucursal.ciudad}
            </Text>
          </View>
        ) : null}

        <View style={estilos.tarjeta}>
          <Text style={estilos.tituloBloque}>Prendas</Text>
          {v.detalles.map((d) => (
            <View key={d.id_detalle_venta} style={estilos.linea}>
              <ImagenProducto
                url={d.producto?.imagen_url}
                claveReciclado={d.id_detalle_venta}
                estilo={estilos.miniatura}
              />
              <View style={estilos.flex}>
                <Text style={estilos.lineaNombre} numberOfLines={2}>
                  {d.producto?.nombre ?? 'Prenda'}
                </Text>
                <Text style={estilos.detalle}>
                  Talla {d.talla?.nombre ?? '-'} - {d.color?.nombre ?? '-'} - x{d.cantidad}
                </Text>
                <Text style={estilos.detalle}>{moneda(d.precio_unitario)} c/u</Text>
              </View>
              <Text style={estilos.lineaTotal}>
                {moneda(subtotal(d.cantidad, d.precio_unitario, d.descuento))}
              </Text>
            </View>
          ))}
        </View>

        <View style={estilos.tarjeta}>
          <Text style={estilos.tituloBloque}>Totales</Text>
          <FilaTotal etiqueta="Subtotal" valor={moneda(bruto)} />
          {descuentos > 0 ? <FilaTotal etiqueta="Descuentos" valor={`- ${moneda(descuentos)}`} /> : null}
          <View style={estilos.separador} />
          <FilaTotal etiqueta="Total" valor={moneda(v.total)} destacado />
        </View>

        <View style={estilos.tarjeta}>
          <Text style={estilos.tituloBloque}>Pagos</Text>
          {v.pagos.map((pago) => (
            <View key={pago.id_pago} style={estilos.pago}>
              <View style={estilos.flex}>
                <Text style={estilos.cuerpo}>
                  {etiqueta(pago.metodo)} - {etiqueta(pago.tipo)}
                </Text>
                <Text style={estilos.detalle}>
                  {fechaHora(pago.fecha)}
                  {pago.referencia_externa ? ` - ${pago.referencia_externa}` : ''}
                </Text>
              </View>
              <View style={estilos.pagoDerecha}>
                <Text style={estilos.cuerpo}>{moneda(pago.monto)}</Text>
                <InsigniaPago estado={pago.estado} />
              </View>
            </View>
          ))}
        </View>

        <Boton titulo="Volver" variante="secundario" ancho onPress={() => navigation.goBack()} />
      </ScrollView>
    </Pantalla>
  );
}

function FilaTotal({
  etiqueta: nombre,
  valor,
  destacado = false,
}: {
  etiqueta: string;
  valor: string;
  destacado?: boolean;
}) {
  return (
    <View style={estilos.filaTotal}>
      <Text style={destacado ? estilos.tituloBloque : estilos.cuerpo}>{nombre}</Text>
      <Text style={destacado ? estilos.totalDestacado : estilos.cuerpo}>{valor}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  contenido: { padding: esp.l, gap: esp.m, paddingBottom: esp.xl },
  encabezado: { flexDirection: 'row', alignItems: 'flex-start', gap: esp.m },
  titulo: { ...texto.titulo },
  detalle: { ...texto.menor },
  cuerpo: { ...texto.cuerpo, color: colores.tinta },
  insignias: { alignItems: 'flex-end', gap: 4 },
  tarjeta: {
    padding: esp.m,
    borderRadius: radio.m,
    backgroundColor: colores.blanco,
    borderWidth: 1,
    borderColor: colores.borde,
    gap: esp.s,
  },
  tituloBloque: { ...texto.subtitulo },
  linea: { flexDirection: 'row', gap: esp.m, alignItems: 'center' },
  miniatura: { width: 52, height: 68 },
  lineaNombre: { ...texto.cuerpo, fontWeight: '600', color: colores.tinta },
  lineaTotal: { ...texto.cuerpo, fontWeight: '600', color: colores.tinta },
  filaTotal: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalDestacado: { ...texto.subtitulo, fontSize: 18 },
  separador: { height: 1, backgroundColor: colores.borde, marginVertical: esp.xs },
  pago: { flexDirection: 'row', gap: esp.m, alignItems: 'center' },
  pagoDerecha: { alignItems: 'flex-end', gap: 4 },
});
