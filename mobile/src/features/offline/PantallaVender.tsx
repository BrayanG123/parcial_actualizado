import { useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Boton } from '../../components/Boton';
import { Campo } from '../../components/Campo';
import { Pantalla } from '../../components/Pantalla';
import { Vacio } from '../../components/Estados';
import { useAvisos } from '../../context/AvisosContext';
import { useAlcanceOffline, useDatosOffline, useSincronizacion } from '../../hooks/useOffline';
import { moneda } from '../../lib/format';
import { offlineService } from '../../offline/servicio';
import type { ItemSeleccion } from '../../offline/tipos';
import { colores, esp, texto } from '../../theme';
import { AvisoDescarga, CatalogoLocal } from './componentes';

/**
 * F6.6 Modo vendedor: POS de contado que funciona sin conexion. El turno se abre con
 * conexion (web o caja); al descargar se guarda el turno y el catalogo de la sucursal.
 */
export function PantallaVender() {
  const alcance = useAlcanceOffline();
  const [busqueda, setBusqueda] = useState('');
  const { descarga, catalogo, clientes, pendientes } = useDatosOffline(alcance, undefined, busqueda);
  const { sinConexion } = useSincronizacion(alcance, pendientes.length > 0);
  const { avisar, avisarError } = useAvisos();
  const [seleccion, setSeleccion] = useState<ItemSeleccion[]>([]);
  const [recibido, setRecibido] = useState('');
  const [clienteId, setClienteId] = useState<number | undefined>();
  const [ocupado, setOcupado] = useState(false);
  const candado = useRef(false);

  async function accion(fn: () => Promise<void>) {
    if (candado.current) return;
    candado.current = true;
    setOcupado(true);
    try {
      await fn();
    } catch (e) {
      avisarError(e);
    } finally {
      candado.current = false;
      setOcupado(false);
    }
  }

  if (!alcance)
    return (
      <Pantalla>
        <Vacio icono="cash-outline" titulo="Modo vendedor" detalle="La venta offline esta disponible en la app Android." />
      </Pantalla>
    );
  const total =
    seleccion.reduce((s, i) => {
      const v = catalogo.find((x) => x.producto_id === i.productId && x.talla_id === i.sizeId && x.color_id === i.colorId);
      return s + Math.round((v?.precio_neto ?? 0) * 100) * i.quantity;
    }, 0) / 100;
  const efectivo = Number(recibido.replace(',', '.'));

  return (
    <Pantalla>
      <ScrollView contentContainerStyle={{ padding: esp.l, gap: esp.m }} keyboardShouldPersistTaps="handled">
        <Text style={texto.titulo}>Venta de contado</Text>
        <Text style={texto.cuerpo}>
          {sinConexion ? 'Sin conexion: las ventas se guardan en el telefono.' : 'Las ventas se envian automaticamente.'}
        </Text>
        <Boton
          titulo={descarga ? 'Actualizar datos de mi sucursal' : 'Descargar datos de mi sucursal'}
          icono="cloud-download-outline"
          variante="secundario"
          cargando={ocupado}
          onPress={() => accion(async () => void (await offlineService.descargar(alcance)))}
        />
        {descarga && <AvisoDescarga descarga={descarga} />}
        {descarga && !descarga.turno_id && (
          <Text style={[texto.cuerpo, { color: colores.error }]}>
            No habia un turno abierto al descargar. Abre tu turno con conexion y vuelve a descargar.
          </Text>
        )}
        {descarga?.turno_id ? (
          <>
            <Text style={texto.menor}>
              {descarga.sucursal} · {descarga.caja} · Turno #{descarga.turno_id}
            </Text>
            <Campo etiqueta="Buscar prenda" value={busqueda} onChangeText={setBusqueda} />
            <CatalogoLocal variantes={catalogo} seleccion={seleccion} onCambiar={setSeleccion} />
            <Text style={texto.subtitulo}>Cliente</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: esp.s }}>
              {[{ id: undefined, nombre: 'Consumidor final' }, ...clientes.slice(0, 20)].map((c) => (
                <Pressable
                  key={c.id ?? 0}
                  onPress={() => setClienteId(c.id)}
                  style={{
                    paddingHorizontal: esp.m,
                    paddingVertical: esp.xs,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: clienteId === c.id ? colores.acento : colores.borde,
                  }}
                >
                  <Text style={texto.cuerpo}>{c.nombre}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={texto.titulo}>Total: {moneda(total)}</Text>
            <Campo etiqueta="Efectivo recibido" keyboardType="decimal-pad" value={recibido} onChangeText={setRecibido} />
            <Text style={texto.cuerpo}>Cambio: {moneda(Number.isFinite(efectivo) ? Math.max(0, efectivo - total) : 0)}</Text>
            <Boton
              titulo="Cobrar y guardar venta"
              icono="checkmark-circle-outline"
              ancho
              deshabilitado={!seleccion.length || !recibido}
              cargando={ocupado}
              onPress={() =>
                accion(async () => {
                  const r = await offlineService.vender(alcance, {
                    sucursalId: descarga.sucursal_id,
                    items: seleccion,
                    recibido: efectivo,
                    clienteId,
                  });
                  setSeleccion([]);
                  setRecibido('');
                  setClienteId(undefined);
                  Alert.alert(
                    'Venta guardada',
                    `Ticket ${r.operationId.slice(0, 8)} · ${moneda(r.total)}\nCambio: ${moneda(efectivo - r.total)}\n` +
                      'Pendiente de confirmacion del servidor: no vuelvas a cobrarlo.',
                  );
                  void offlineService.sincronizar(alcance).catch(() => undefined);
                  avisar('Venta guardada en el telefono.');
                })
              }
            />
          </>
        ) : null}
      </ScrollView>
    </Pantalla>
  );
}
