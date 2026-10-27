import { useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Boton } from '../../components/Boton';
import { Campo } from '../../components/Campo';
import { Pantalla } from '../../components/Pantalla';
import { Vacio } from '../../components/Estados';
import { useAvisos } from '../../context/AvisosContext';
import { useSesion } from '../../context/SesionContext';
import { useAlcanceOffline, useDatosOffline, useSincronizacion } from '../../hooks/useOffline';
import { moneda } from '../../lib/format';
import type { PropsStack } from '../../navigation/tipos';
import { offlineService } from '../../offline/servicio';
import type { ItemSeleccion } from '../../offline/tipos';
import { colores, esp, texto } from '../../theme';
import { AvisoDescarga, CatalogoLocal } from './componentes';

/** "AAAA-MM-DD HH:MM" en hora local -> ISO. */
function interpretarHorario(valor: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(valor.trim());
  if (!m) return null;
  const fecha = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  return Number.isFinite(fecha.getTime()) ? fecha.toISOString() : null;
}
const manana = (hora: number) => {
  const d = new Date(Date.now() + 86400000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(hora)}:00`;
};

/** F6.2/F6.3/F6.5: catalogo descargado en SQLite y reserva offline del cliente. */
export function PantallaTiendaOffline({ navigation }: PropsStack<'TiendaOffline'>) {
  const { cliente } = useSesion();
  const alcance = useAlcanceOffline();
  const [sucursal, setSucursal] = useState<number | undefined>();
  const [busqueda, setBusqueda] = useState('');
  const { descarga, catalogo, sucursales, pendientes } = useDatosOffline(alcance, sucursal, busqueda);
  useSincronizacion(alcance, pendientes.length > 0);
  const { avisar, avisarError } = useAvisos();
  const [seleccion, setSeleccion] = useState<ItemSeleccion[]>([]);
  const [horario, setHorario] = useState(manana(10));
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
      <Pantalla bordes={[]}>
        <Vacio
          icono="cloud-offline-outline"
          titulo="Tienda sin conexion"
          detalle="Inicia sesion en la app Android para descargar el catalogo y reservar sin conexion."
          accion={{ titulo: 'Ingresar', onPress: () => navigation.navigate('Acceso') }}
        />
      </Pantalla>
    );
  const total =
    seleccion.reduce((s, i) => {
      const v = catalogo.find((x) => x.producto_id === i.productId && x.talla_id === i.sizeId && x.color_id === i.colorId);
      return s + Math.round((v?.precio_neto ?? 0) * 100) * i.quantity;
    }, 0) / 100;
  return (
    <Pantalla bordes={[]}>
      <ScrollView contentContainerStyle={{ padding: esp.l, gap: esp.m }} keyboardShouldPersistTaps="handled">
        {sucursales.length > 1 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: esp.s }}>
            {sucursales.map((s) => (
              <Pressable
                key={s.id}
                onPress={() => {
                  setSucursal(s.id);
                  setSeleccion([]);
                }}
                style={{
                  paddingHorizontal: esp.m,
                  paddingVertical: esp.xs,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: (sucursal ?? descarga?.sucursal_id) === s.id ? colores.acento : colores.borde,
                }}
              >
                <Text style={texto.cuerpo}>{s.nombre}</Text>
              </Pressable>
            ))}
          </View>
        )}
        <Boton
          titulo={descarga ? 'Actualizar catalogo' : 'Descargar catalogo'}
          icono="cloud-download-outline"
          variante="secundario"
          cargando={ocupado}
          onPress={() => accion(async () => void (await offlineService.descargar(alcance, sucursal ?? descarga?.sucursal_id)))}
        />
        {descarga ? <AvisoDescarga descarga={descarga} /> : <Text style={texto.cuerpo}>Aun no descargaste esta sucursal.</Text>}
        {descarga && (
          <>
            <Campo etiqueta="Buscar prenda" value={busqueda} onChangeText={setBusqueda} />
            <CatalogoLocal variantes={catalogo} seleccion={seleccion} onCambiar={setSeleccion} />
          </>
        )}
        {descarga && cliente && (
          <View style={{ gap: esp.s }}>
            <Text style={texto.subtitulo}>Reservar en {descarga.sucursal}</Text>
            <Text style={texto.cuerpo}>Total estimado: {moneda(total)}</Text>
            <Campo
              etiqueta="Visita (AAAA-MM-DD HH:MM)"
              value={horario}
              onChangeText={setHorario}
              autoCapitalize="none"
            />
            <Boton
              titulo="Reservar sin conexion"
              icono="calendar-outline"
              ancho
              deshabilitado={!seleccion.length}
              cargando={ocupado}
              onPress={() =>
                accion(async () => {
                  const iso = interpretarHorario(horario);
                  if (!iso) throw new Error('Escribe la visita como AAAA-MM-DD HH:MM.');
                  await offlineService.reservar(alcance, {
                    sucursalId: descarga.sucursal_id,
                    items: seleccion,
                    horario: iso,
                  });
                  setSeleccion([]);
                  avisar('Reserva guardada en el telefono; se enviara a la tienda al sincronizar.');
                  void offlineService.sincronizar(alcance).catch(() => undefined);
                })
              }
            />
            <Boton titulo="Ver pendientes" variante="plano" onPress={() => navigation.navigate('Pendientes')} />
          </View>
        )}
      </ScrollView>
    </Pantalla>
  );
}
