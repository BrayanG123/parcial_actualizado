/**
 * Elegir la tienda (empresa) con la que trabaja la app: escribiendo su codigo o desde el
 * directorio de tiendas activas. La tienda elegida viaja como X-Tenant sin sesion.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { fijarEmpresa } from '../../api/empresa';
import { Boton } from '../../components/Boton';
import { Campo } from '../../components/Campo';
import { Cargando, ErrorVista } from '../../components/Estados';
import { Insignia } from '../../components/Insignias';
import { useSesion } from '../../context/SesionContext';
import { useEmpresaActiva } from '../../hooks/useEmpresa';
import { normalizarCodigo, validarCodigo } from '../../lib/tienda';
import { tiendaService } from '../../services/tienda.service';
import { colores, esp, radio, texto } from '../../theme';

export function SelectorTienda({ onElegida }: { onElegida?: () => void }) {
  const { autenticado, cerrarSesion } = useSesion();
  const actual = useEmpresaActiva();
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string>();
  const [verificando, setVerificando] = useState(false);
  const directorio = useQuery({ queryKey: ['directorio-empresas'], queryFn: tiendaService.directorio });

  async function elegir(slug: string, nombre: string) {
    // Una sesion pertenece a una sola empresa: cambiar de tienda la cierra.
    if (autenticado && actual?.slug !== slug) await cerrarSesion();
    fijarEmpresa({ slug, nombre });
    onElegida?.();
  }

  async function entrarConCodigo() {
    if (verificando) return;
    const problema = validarCodigo(codigo);
    setError(problema);
    if (problema) return;
    setVerificando(true);
    try {
      const slug = normalizarCodigo(codigo);
      // Con sesion el token decide la empresa: se cierra antes de consultar otra tienda.
      if (autenticado && actual?.slug !== slug) await cerrarSesion();
      const tienda = await tiendaService.verificar(slug);
      await elegir(tienda.slug, tienda.nombre);
    } catch {
      setError('No encontramos una tienda activa con ese codigo.');
    } finally {
      setVerificando(false);
    }
  }

  return (
    <View style={estilos.contenedor}>
      <View style={estilos.tarjeta}>
        <Campo
          etiqueta="Codigo de la tienda"
          value={codigo}
          onChangeText={(v) => {
            setCodigo(v.toLowerCase());
            setError(undefined);
          }}
          placeholder="ej. mi-tienda"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={() => void entrarConCodigo()}
          error={error}
          ayuda="Te lo da la tienda o lo ves en el enlace de su web (/t/codigo)."
        />
        <Boton titulo="Entrar a la tienda" onPress={() => void entrarConCodigo()} cargando={verificando} ancho />
      </View>

      <Text style={estilos.titulo}>O elige una tienda</Text>
      {directorio.isPending && <Cargando mensaje="Buscando tiendas..." />}
      {directorio.isError && (
        <ErrorVista error={directorio.error} onReintentar={() => void directorio.refetch()} />
      )}
      {directorio.data?.map((e) => (
        <Pressable
          key={e.slug}
          style={estilos.tienda}
          accessibilityRole="button"
          onPress={() => void elegir(e.slug, e.nombre)}
        >
          <View style={{ flex: 1 }}>
            <Text style={texto.subtitulo}>{e.nombre}</Text>
            <Text style={texto.menor}>{e.slug}</Text>
          </View>
          {actual?.slug === e.slug && <Insignia texto="Actual" tono="acento" />}
        </Pressable>
      ))}
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: { gap: esp.m },
  tarjeta: {
    gap: esp.m,
    padding: esp.l,
    backgroundColor: colores.blanco,
    borderRadius: radio.l,
  },
  titulo: { ...texto.etiqueta, textTransform: 'uppercase', marginTop: esp.s },
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
