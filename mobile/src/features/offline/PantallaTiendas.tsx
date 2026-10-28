import { useQuery } from '@tanstack/react-query';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../../api/http';
import { fijarEmpresa, obtenerEmpresa } from '../../api/empresa';
import { Cargando, ErrorVista } from '../../components/Estados';
import { Insignia } from '../../components/Insignias';
import { useSesion } from '../../context/SesionContext';
import type { PropsStack } from '../../navigation/tipos';
import { colores, esp, radio, texto } from '../../theme';

/** F6.4: el cliente elige la tienda (empresa); se envia como X-Tenant. */
export function PantallaTiendas({ navigation }: PropsStack<'Tiendas'>) {
  const { autenticado, cerrarSesion } = useSesion();
  const actual = obtenerEmpresa();
  const directorio = useQuery({
    queryKey: ['directorio-empresas'],
    queryFn: () => api.get<Array<{ slug: string; name: string }>>('/tenant/directory'),
  });
  async function elegir(slug: string, nombre: string) {
    // Una sesion pertenece a una sola empresa: cambiar de tienda la cierra.
    if (autenticado && actual?.slug !== slug) await cerrarSesion();
    fijarEmpresa({ slug, nombre });
    navigation.goBack();
  }
  if (directorio.isPending) return <Cargando mensaje="Buscando tiendas..." />;
  if (directorio.isError) return <ErrorVista error={directorio.error} onReintentar={() => directorio.refetch()} />;
  return (
    <ScrollView contentContainerStyle={{ padding: esp.l, gap: esp.m }}>
      <Text style={texto.cuerpo}>Cada tienda tiene su propio catalogo, sucursales y cuentas.</Text>
      {directorio.data.map((e) => (
        <Pressable key={e.slug} style={estilos.tienda} onPress={() => void elegir(e.slug, e.name)}>
          <View style={{ flex: 1 }}>
            <Text style={texto.subtitulo}>{e.name}</Text>
            <Text style={texto.menor}>{e.slug}</Text>
          </View>
          {(actual?.slug ?? 'fashionstore') === e.slug && <Insignia texto="Actual" tono="acento" />}
        </Pressable>
      ))}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  tienda: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: esp.l,
    backgroundColor: colores.blanco,
    borderRadius: radio.m,
    borderWidth: 1,
    borderColor: colores.borde,
  },
});
