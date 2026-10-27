import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { Boton } from '../../components/Boton';
import { Pantalla } from '../../components/Pantalla';
import { Vacio } from '../../components/Estados';
import { useAvisos } from '../../context/AvisosContext';
import { useAlcanceOffline, useDatosOffline, useSincronizacion } from '../../hooks/useOffline';
import { offlineService } from '../../offline/servicio';
import { esp, texto } from '../../theme';
import { TarjetaOperacion } from './componentes';

/** F6.7: operaciones guardadas en el telefono, sus estados y el resultado de la sincronizacion. */
export function PantallaPendientes() {
  const alcance = useAlcanceOffline();
  const { operaciones, pendientes, error } = useDatosOffline(alcance);
  const { sincronizando, ultimo, sinConexion, sincronizar } = useSincronizacion(alcance, pendientes.length > 0);
  const { avisar, avisarError } = useAvisos();
  const [todas, setTodas] = useState(false);
  const visibles = todas ? operaciones : pendientes;

  async function enviar(incluir: string[] = []) {
    try {
      const r = await sincronizar(incluir);
      if (r?.sinConexion) avisar('Sin conexion: se reintentara automaticamente.', 'info');
      else if (r) avisar(`${r.confirmadas} confirmadas, ${r.conflictos} en conflicto, ${r.rechazadas} rechazadas.`);
    } catch (e) {
      avisarError(e);
    }
  }

  if (!alcance)
    return (
      <Pantalla>
        <Vacio icono="cloud-offline-outline" titulo="Operaciones offline" detalle="Inicia sesion en la app Android para usar el modo offline." />
      </Pantalla>
    );
  return (
    <Pantalla bordes={[]}>
      <ScrollView contentContainerStyle={{ padding: esp.l, gap: esp.m }}>
        <Text style={texto.titulo}>Operaciones pendientes</Text>
        <Text style={texto.cuerpo}>
          {sinConexion ? 'Sin conexion: todo queda guardado en el telefono. ' : ''}
          {pendientes.length} pendiente(s). Se envian solas al abrir la app y cada 30 segundos.
        </Text>
        {ultimo && ultimo.enviadas > 0 && (
          <Text style={texto.menor}>
            Ultimo envio: {ultimo.confirmadas} confirmadas, {ultimo.conflictos} en conflicto, {ultimo.rechazadas} rechazadas.
          </Text>
        )}
        {error ? <Text style={texto.cuerpo}>{error}</Text> : null}
        <View style={{ flexDirection: 'row', gap: esp.s }}>
          <Boton titulo="Sincronizar ahora" icono="sync-outline" cargando={sincronizando} onPress={() => void enviar()} />
          <Boton titulo={todas ? 'Ver pendientes' : 'Ver todas'} variante="secundario" onPress={() => setTodas((v) => !v)} />
        </View>
        {visibles.length === 0 && <Text style={texto.cuerpo}>No hay operaciones en esta vista.</Text>}
        {visibles.map((op) => (
          <TarjetaOperacion
            key={op.operation_id}
            op={op}
            onReintentar={() => void enviar([op.operation_id])}
            onDescartar={() =>
              Alert.alert('Descartar operacion', 'Quedara como descartada en el historial (no se borra).', [
                { text: 'Cancelar', style: 'cancel' },
                {
                  text: 'Descartar',
                  style: 'destructive',
                  onPress: () => void offlineService.descartar(alcance, op.operation_id).catch(avisarError),
                },
              ])
            }
          />
        ))}
      </ScrollView>
    </Pantalla>
  );
}
