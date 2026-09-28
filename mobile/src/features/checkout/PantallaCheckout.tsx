/**
 * Compra desde el movil (canal MOBILE).
 *
 *   Resumen -> Sucursal con stock -> Cotizacion del servidor -> Pago -> Resultado
 *
 * El total lo calcula NestJS (quoteHash). Con tarjeta, la venta queda pendiente
 * y Stripe confirma el cobro; con contra entrega, se paga en efectivo al recibir.
 * La pantalla solo muestra lo que el backend confirma.
 */
import { useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Boton } from '../../components/Boton';
import { Campo } from '../../components/Campo';
import { AvisoEnLinea, Cargando, ErrorVista } from '../../components/Estados';
import { ImagenProducto } from '../../components/ImagenProducto';
import { Pantalla } from '../../components/Pantalla';
import { Chip } from '../../components/Selectores';
import { useAvisos } from '../../context/AvisosContext';
import { useSesion } from '../../context/SesionContext';
import { useCarrito, useConfirmarCheckout } from '../../hooks/useComercio';
import { moneda, plural } from '../../lib/format';
import type { PropsStack } from '../../navigation/tipos';
import {
  checkoutService,
  nuevaClaveIdempotencia,
  type IntentoPago,
  type OpcionPago,
  type ResultadoCheckout,
} from '../../services/checkout.service';
import type { DetalleCarrito } from '../../types/domain';
import { PagoStripeWeb } from './PagoStripeWeb';
import { colores, esp, texto } from '../../theme';

const SIN_LINEAS: DetalleCarrito[] = [];
const ESPERA_PAGO_MS = 3000;
const INTENTOS_CONFIRMACION = 20;

export function PantallaCheckout({ navigation }: PropsStack<'Checkout'>) {
  const { cliente, usuario } = useSesion();
  const { avisarError } = useAvisos();
  const carrito = useCarrito();
  const confirmar = useConfirmarCheckout();
  const queryClient = useQueryClient();

  const [idSucursal, setIdSucursal] = useState<number>();
  const [opcion, setOpcion] = useState<OpcionPago>('STRIPE');
  // La sesion ya esta restaurada al llegar aqui: se precargan los datos del cliente.
  const [entrega, setEntrega] = useState(() => ({
    nombre: usuario?.nombre ?? '',
    telefono: cliente?.telefono ?? '',
    direccion: cliente?.direccion ?? '',
  }));
  const [error, setError] = useState<string | null>(null);
  const [pago, setPago] = useState<{ saleId: number; intento: IntentoPago; total: number } | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoCheckout | null>(null);
  /** La misma clave para reintentos de la misma cotizacion: no duplica pedidos. */
  const clave = useRef({ quoteHash: '', valor: '' });

  const idCarrito = carrito.data?.id_carrito;
  const cotizacion = useQuery({
    queryKey: ['checkout', 'cotizacion', idCarrito, idSucursal, carrito.dataUpdatedAt],
    queryFn: () => checkoutService.cotizar(idCarrito!, idSucursal!),
    enabled: Boolean(idCarrito && idSucursal) && !pago && !resultado,
    retry: false,
  });

  const detalles = carrito.data?.detalles ?? SIN_LINEAS;
  const sucursales = carrito.data?.sucursales_disponibles ?? [];
  const unidades = detalles.reduce((acc, d) => acc + d.cantidad, 0);

  if (carrito.isLoading) return <Cargando mensaje="Preparando tu compra..." />;
  if (carrito.isError) return <ErrorVista error={carrito.error} onReintentar={() => void carrito.refetch()} />;

  if (resultado) return <Resultado resultado={resultado} navigation={navigation} />;

  if (pago) {
    if (confirmando) return <Cargando mensaje="Confirmando tu pago con Stripe..." />;
    return (
      <Pantalla bordes={['bottom']}>
        <PagoStripeWeb
          publishableKey={pago.intento.publishableKey!}
          clientSecret={pago.intento.clientSecret!}
          monto={moneda(pago.total)}
          onPagado={() => void esperarConfirmacion(pago.saleId)}
          onCancelar={() => cancelarPago(pago.saleId)}
        />
      </Pantalla>
    );
  }

  if (detalles.length === 0) {
    return (
      <Pantalla bordes={['bottom']}>
        <View style={estilos.centro}>
          <Ionicons name="bag-outline" size={30} color={colores.tinta3} />
          <Text style={estilos.tituloResultado}>No hay nada que comprar</Text>
          <Text style={estilos.detalleResultado}>Agrega prendas a tu carrito para continuar.</Text>
          <Boton titulo="Volver al catalogo" variante="secundario" onPress={() => navigation.goBack()} />
        </View>
      </Pantalla>
    );
  }

  function validar(): string | null {
    if (!idSucursal) return 'Elige la sucursal desde donde se prepara tu pedido.';
    if (!cotizacion.data) return 'Espera a que el servidor calcule el total.';
    if (opcion === 'CASH_ON_DELIVERY') {
      if (entrega.nombre.trim().length < 2) return 'Indica quien recibe el pedido.';
      if (!/^[+\d][\d ()-]{5,29}$/.test(entrega.telefono.trim())) return 'Indica un telefono de contacto valido.';
      if (entrega.direccion.trim().length < 10) return 'Escribe la direccion completa de entrega (minimo 10 caracteres).';
    }
    return null;
  }

  function pedirConfirmacion() {
    const problema = validar();
    setError(problema);
    if (problema || !cotizacion.data) return;
    const total = moneda(cotizacion.data.total);
    Alert.alert(
      'Confirmar compra',
      opcion === 'STRIPE'
        ? `Se apartaran tus prendas y pagaras ${total} con tarjeta.`
        : `Pagaras ${total} en efectivo al recibir el pedido.`,
      [
        { text: 'Revisar', style: 'cancel' },
        { text: 'Confirmar', onPress: () => void enviar() },
      ],
    );
  }

  async function enviar() {
    const q = cotizacion.data!;
    if (clave.current.quoteHash !== q.quoteHash) clave.current = { quoteHash: q.quoteHash, valor: nuevaClaveIdempotencia() };
    try {
      const creado = await confirmar.mutateAsync({
        cartId: q.cartId,
        branchId: q.branchId,
        quoteHash: q.quoteHash,
        idempotencyKey: clave.current.valor,
        paymentOption: opcion,
        ...(opcion === 'CASH_ON_DELIVERY'
          ? {
              deliveryName: entrega.nombre.trim(),
              deliveryPhone: entrega.telefono.trim(),
              deliveryAddress: entrega.direccion.trim(),
            }
          : {}),
      });
      if (opcion === 'STRIPE' && creado.estado === 'PENDING_PAYMENT') {
        const intento = await checkoutService.intentoStripe(creado.venta.id_venta);
        if (intento.clientSecret && intento.publishableKey) {
          setPago({ saleId: creado.venta.id_venta, intento, total: creado.venta.total });
          return;
        }
        setResultado(await checkoutService.consultar(creado.venta.id_venta));
        return;
      }
      setResultado(creado);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos registrar tu compra.');
      avisarError(e);
      void queryClient.invalidateQueries({ queryKey: ['checkout'] });
    }
  }

  /** Stripe confirma el cobro y NestJS lo sincroniza: se consulta hasta verlo reflejado. */
  async function esperarConfirmacion(saleId: number) {
    setConfirmando(true);
    let ultimo: ResultadoCheckout | null = null;
    for (let i = 0; i < INTENTOS_CONFIRMACION; i++) {
      try {
        ultimo = await checkoutService.consultar(saleId);
        if (ultimo.estado !== 'PENDING_PAYMENT') break;
      } catch {
        // Un corte momentaneo no invalida el pago: se vuelve a consultar.
      }
      await new Promise((r) => setTimeout(r, ESPERA_PAGO_MS));
    }
    void queryClient.invalidateQueries({ queryKey: ['ventas'] });
    setConfirmando(false);
    setPago(null);
    if (ultimo) setResultado(ultimo);
    else navigation.replace('Compras');
  }

  function cancelarPago(saleId: number) {
    Alert.alert('Cancelar pago', 'Se anulara el pedido pendiente y las prendas volveran al stock.', [
      { text: 'Seguir pagando', style: 'cancel' },
      {
        text: 'Cancelar pedido',
        style: 'destructive',
        onPress: async () => {
          try {
            await checkoutService.cancelar(saleId);
          } catch (e) {
            avisarError(e);
          }
          setPago(null);
          void queryClient.invalidateQueries({ queryKey: ['ventas'] });
          navigation.replace('Compras');
        },
      },
    ]);
  }

  return (
    <Pantalla bordes={['bottom']}>
      <ScrollView contentContainerStyle={estilos.contenido} showsVerticalScrollIndicator={false}>
        <Paso numero={1} titulo="Resumen" detalle={plural(unidades, 'prenda', 'prendas')}>
          {detalles.map((d) => (
            <View key={d.id_detalle_carrito} style={estilos.linea}>
              <ImagenProducto url={d.producto?.imagen_url} claveReciclado={d.id_detalle_carrito} estilo={estilos.miniatura} />
              <View style={estilos.lineaCuerpo}>
                <Text style={estilos.lineaNombre} numberOfLines={1}>
                  {d.producto?.nombre ?? 'Prenda'}
                </Text>
                <Text style={estilos.lineaMeta}>
                  Talla {d.talla?.nombre ?? '-'} - {d.color?.nombre ?? '-'} - x{d.cantidad}
                </Text>
              </View>
              <Text style={estilos.lineaTotal}>{moneda(d.subtotal ?? d.cantidad * d.precio_unitario)}</Text>
            </View>
          ))}
        </Paso>

        <Paso numero={2} titulo="Sucursal" detalle="Solo aparecen las que tienen stock de todo tu carrito">
          {sucursales.length === 0 ? (
            <AvisoEnLinea texto="Ninguna sucursal tiene stock para todo el carrito. Ajusta las cantidades." />
          ) : (
            <View style={estilos.opciones}>
              {sucursales.map((s) => (
                <Chip
                  key={s.id_sucursal}
                  texto={`${s.nombre} - ${s.ciudad}`}
                  activo={idSucursal === s.id_sucursal}
                  onPress={() => setIdSucursal(s.id_sucursal)}
                />
              ))}
            </View>
          )}
        </Paso>

        <Paso numero={3} titulo="Forma de pago">
          <View style={estilos.opciones}>
            <Chip texto="Tarjeta (Stripe)" activo={opcion === 'STRIPE'} onPress={() => setOpcion('STRIPE')} />
            <Chip
              texto="Contra entrega"
              activo={opcion === 'CASH_ON_DELIVERY'}
              onPress={() => setOpcion('CASH_ON_DELIVERY')}
            />
          </View>
          {opcion === 'STRIPE' ? (
            <Text style={estilos.nota}>
              Pagas en el formulario seguro de Stripe (modo prueba). Tienes unos minutos para completar el pago antes de que
              se liberen las prendas.
            </Text>
          ) : (
            <View style={estilos.formulario}>
              <Text style={estilos.nota}>Envio gratuito dentro de la ciudad de la sucursal. Pagas en efectivo al recibir.</Text>
              <Campo etiqueta="Recibe" value={entrega.nombre} onChangeText={(nombre) => setEntrega((e) => ({ ...e, nombre }))} />
              <Campo
                etiqueta="Telefono"
                keyboardType="phone-pad"
                value={entrega.telefono}
                onChangeText={(telefono) => setEntrega((e) => ({ ...e, telefono }))}
              />
              <Campo
                etiqueta="Direccion de entrega"
                value={entrega.direccion}
                multiline
                onChangeText={(direccion) => setEntrega((e) => ({ ...e, direccion }))}
              />
            </View>
          )}
        </Paso>

        {cotizacion.isError ? <AvisoEnLinea texto={cotizacion.error.message} /> : null}
        {error ? <AvisoEnLinea texto={error} /> : null}
      </ScrollView>

      <View style={estilos.pie}>
        <View style={estilos.filaTotal}>
          <Text style={estilos.totalEtiqueta}>Total a pagar</Text>
          <Text style={estilos.totalValor}>
            {cotizacion.data ? moneda(cotizacion.data.total) : cotizacion.isFetching ? 'Calculando...' : '-'}
          </Text>
        </View>
        <Boton
          titulo={opcion === 'STRIPE' ? 'Continuar al pago' : 'Confirmar pedido'}
          icono="checkmark-circle-outline"
          ancho
          onPress={pedirConfirmacion}
          cargando={confirmar.isPending}
          deshabilitado={!cotizacion.data}
        />
      </View>
    </Pantalla>
  );
}

function Paso({ numero, titulo, detalle, children }: { numero: number; titulo: string; detalle?: string; children: React.ReactNode }) {
  return (
    <View style={estilos.paso}>
      <View style={estilos.pasoEncabezado}>
        <View style={estilos.pasoNumero}>
          <Text style={estilos.pasoNumeroTexto}>{numero}</Text>
        </View>
        <View style={estilos.flex}>
          <Text style={estilos.pasoTitulo}>{titulo}</Text>
          {detalle ? <Text style={estilos.lineaMeta}>{detalle}</Text> : null}
        </View>
      </View>
      <View style={estilos.pasoCuerpo}>{children}</View>
    </View>
  );
}

function Resultado({ resultado, navigation }: { resultado: ResultadoCheckout; navigation: PropsStack<'Checkout'>['navigation'] }) {
  const { venta, estado } = resultado;
  const pagado = estado === 'COMPLETED' || estado === 'PAID';
  const anulado = estado === 'CANCELLED' || estado === 'REFUNDED';
  const titulo = pagado
    ? 'Compra confirmada'
    : anulado
      ? 'El pago no se completo'
      : venta.contra_entrega
        ? 'Pedido registrado'
        : 'Estamos confirmando tu pago';
  const detalle = pagado
    ? `Tu pedido #${venta.id_venta} por ${moneda(venta.total)} esta pagado.`
    : anulado
      ? `El pedido #${venta.id_venta} fue anulado y las prendas volvieron al stock.`
      : venta.contra_entrega
        ? `Tu pedido #${venta.id_venta} por ${moneda(venta.total)} se pagara en efectivo al recibirlo. La tienda te llamara para coordinar.`
        : `Stripe todavia no confirma el pedido #${venta.id_venta}. Revisa su estado en Mis compras en unos minutos.`;

  return (
    <Pantalla bordes={['bottom']}>
      <View style={estilos.centro}>
        <View style={[estilos.circuloResultado, { backgroundColor: anulado ? colores.errorSuave : colores.exitoSuave }]}>
          <Ionicons
            name={anulado ? 'close-circle-outline' : pagado ? 'checkmark-circle-outline' : 'time-outline'}
            size={34}
            color={anulado ? colores.error : colores.exito}
          />
        </View>
        <Text style={estilos.tituloResultado}>{titulo}</Text>
        <Text style={estilos.detalleResultado}>{detalle}</Text>
        <View style={estilos.accionesResultado}>
          <Boton titulo="Ver mis compras" ancho onPress={() => navigation.replace('Compras')} />
          <Boton titulo="Seguir comprando" variante="secundario" ancho onPress={() => navigation.navigate('Tabs')} />
        </View>
      </View>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  contenido: { padding: esp.l, gap: esp.l, paddingBottom: esp.xl },
  paso: { gap: esp.m },
  pasoEncabezado: { flexDirection: 'row', alignItems: 'center', gap: esp.m },
  pasoNumero: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colores.tinta,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pasoNumeroTexto: { color: colores.blanco, fontSize: 12, fontWeight: '700' },
  pasoTitulo: { ...texto.subtitulo },
  pasoCuerpo: { gap: esp.s, paddingLeft: 38 },
  linea: { flexDirection: 'row', alignItems: 'center', gap: esp.m },
  miniatura: { width: 44, height: 58 },
  lineaCuerpo: { flex: 1, gap: 2 },
  lineaNombre: { ...texto.cuerpo, fontWeight: '600', color: colores.tinta },
  lineaMeta: { ...texto.menor },
  lineaTotal: { ...texto.cuerpo, fontWeight: '600', color: colores.tinta },
  opciones: { flexDirection: 'row', flexWrap: 'wrap', gap: esp.s },
  formulario: { gap: esp.m },
  nota: { ...texto.menor, marginTop: esp.xs },
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
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: esp.xl, gap: esp.s },
  circuloResultado: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: esp.s,
  },
  tituloResultado: { ...texto.titulo, textAlign: 'center' },
  detalleResultado: { ...texto.cuerpo, textAlign: 'center', color: colores.tinta3 },
  accionesResultado: { alignSelf: 'stretch', gap: esp.s, marginTop: esp.l },
});
