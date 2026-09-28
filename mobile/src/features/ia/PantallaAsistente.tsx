/**
 * Asistente de estilo.
 *
 * La app solo conversa con el endpoint /ia/asistente de NestJS, que es quien
 * habla con Gemini. La clave de la API nunca viaja al telefono: un APK se
 * puede abrir y cualquier clave incrustada quedaria expuesta.
 */
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ImagenProducto } from '../../components/ImagenProducto';
import { Pantalla } from '../../components/Pantalla';
import { Precio } from '../../components/Precio';
import { Chip } from '../../components/Selectores';
import { usePreguntarIA } from '../../hooks/useIA';
import { esRespuestaIA } from '../../api/ia.contratos';
import type { MensajeChat } from '../../types/ia';
import type { Producto } from '../../types/domain';
import type { PropsStack } from '../../navigation/tipos';
import { colores, esp, radio, texto } from '../../theme';

const SUGERENCIAS = [
  'Que me pongo para la oficina',
  'Ideas para una fiesta de noche',
  'Que hay en promocion',
  'Combina algo con jean',
];

const BIENVENIDA: MensajeChat = {
  id: 'bienvenida',
  rol: 'asistente',
  texto:
    'Hola, soy tu asistente de estilo. Cuentame que ocasion tienes o que prenda buscas y te propongo opciones con stock disponible.',
  fecha: new Date().toISOString(),
};

export function PantallaAsistente({ navigation }: PropsStack<'Asistente'>) {
  const [mensajes, setMensajes] = useState<MensajeChat[]>([BIENVENIDA]);
  const [entrada, setEntrada] = useState('');
  const preguntar = usePreguntarIA();
  const lista = useRef<FlatList<MensajeChat>>(null);

  async function enviar(texto: string) {
    const consulta = texto.trim();
    if (!consulta || preguntar.isPending) return;

    const propio: MensajeChat = {
      id: `u-${Date.now()}`,
      rol: 'usuario',
      texto: consulta,
      fecha: new Date().toISOString(),
    };
    setMensajes((m) => [...m, propio]);
    setEntrada('');

    // El servicio envia solo los ultimos turnos reales para no crecer sin limite.
    const historial = mensajes;

    try {
      const respuesta = await preguntar.mutateAsync({ mensaje: consulta, historial });
      setMensajes((m) => [
        ...m,
        {
          id: `a-${Date.now()}`,
          rol: 'asistente',
          texto: respuesta.respuesta,
          productos: respuesta.productos_sugeridos,
          origen: respuesta.origen,
          fecha: new Date().toISOString(),
        },
      ]);
    } catch (error) {
      setMensajes((m) => [
        ...m,
        {
          id: `e-${Date.now()}`,
          rol: 'asistente',
          texto:
            error instanceof Error
              ? error.message
              : 'No pude responder en este momento. Intenta de nuevo en unos segundos.',
          fecha: new Date().toISOString(),
        },
      ]);
    }
  }

  return (
    <Pantalla bordes={['bottom']}>
      <KeyboardAvoidingView
        style={estilos.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <FlatList
          ref={lista}
          data={mensajes}
          keyExtractor={(m) => m.id}
          contentContainerStyle={estilos.lista}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => lista.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => (
            <Burbuja
              mensaje={item}
              onAbrirProducto={(p) =>
                navigation.navigate('Producto', { id: p.id_producto, nombre: p.nombre })
              }
            />
          )}
          ListFooterComponent={
            preguntar.isPending ? (
              <View style={estilos.escribiendo}>
                <ActivityIndicator size="small" color={colores.acento} />
                <Text style={estilos.escribiendoTexto}>Buscando opciones...</Text>
              </View>
            ) : null
          }
        />

        {mensajes.length <= 1 ? (
          <View style={estilos.sugerencias}>
            {SUGERENCIAS.map((s) => (
              <Chip key={s} texto={s} onPress={() => void enviar(s)} />
            ))}
          </View>
        ) : null}

        <View style={estilos.barra}>
          <TextInput
            value={entrada}
            onChangeText={setEntrada}
            placeholder="Escribe tu consulta..."
            placeholderTextColor={colores.tinta3}
            style={estilos.input}
            multiline
            maxLength={300}
            onSubmitEditing={() => void enviar(entrada)}
          />
          <Pressable
            onPress={() => void enviar(entrada)}
            disabled={!entrada.trim() || preguntar.isPending}
            accessibilityRole="button"
            accessibilityLabel="Enviar"
            style={[estilos.enviar, (!entrada.trim() || preguntar.isPending) && estilos.enviarInactivo]}
          >
            <Ionicons name="arrow-up" size={19} color={colores.blanco} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Pantalla>
  );
}

function Burbuja({
  mensaje,
  onAbrirProducto,
}: {
  mensaje: MensajeChat;
  onAbrirProducto: (p: Producto) => void;
}) {
  const propio = mensaje.rol === 'usuario';

  return (
    <View style={[estilos.fila, propio && estilos.filaPropia]}>
      <View style={[estilos.burbuja, propio ? estilos.burbujaPropia : estilos.burbujaAsistente]}>
        <Text style={[estilos.texto, propio && estilos.textoPropio]}>{mensaje.texto}</Text>
      </View>
      {mensaje.origen && !propio ? (
        <Text style={estilos.escribiendoTexto}>
          {esRespuestaIA(mensaje.origen) ? 'Respuesta generada con IA' : 'Asistente sin IA: coincidencias del catalogo'}
        </Text>
      ) : null}

      {mensaje.productos?.length ? (
        <View style={estilos.sugeridos}>
          {mensaje.productos.map((p) => (
            <Pressable
              key={p.id_producto}
              onPress={() => onAbrirProducto(p)}
              accessibilityRole="button"
              style={estilos.sugerido}
            >
              <ImagenProducto url={p.imagen_url} claveReciclado={p.id_producto} estilo={estilos.miniatura} />
              <View style={estilos.flex}>
                <Text style={estilos.sugeridoNombre} numberOfLines={2}>
                  {p.nombre}
                </Text>
                <Precio producto={p} />
              </View>
              <Ionicons name="chevron-forward" size={17} color={colores.tinta3} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  lista: { padding: esp.l, gap: esp.m },
  fila: { alignItems: 'flex-start', gap: esp.s },
  filaPropia: { alignItems: 'flex-end' },
  burbuja: { maxWidth: '88%', padding: esp.m, borderRadius: radio.m },
  burbujaAsistente: {
    backgroundColor: colores.blanco,
    borderWidth: 1,
    borderColor: colores.borde,
    borderTopLeftRadius: 2,
  },
  burbujaPropia: { backgroundColor: colores.tinta, borderTopRightRadius: 2 },
  texto: { ...texto.cuerpo, color: colores.tinta },
  textoPropio: { color: colores.blanco },
  sugeridos: { alignSelf: 'stretch', gap: esp.s },
  sugerido: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: esp.m,
    padding: esp.s,
    backgroundColor: colores.blanco,
    borderRadius: radio.m,
    borderWidth: 1,
    borderColor: colores.borde,
  },
  miniatura: { width: 44, height: 58 },
  sugeridoNombre: { ...texto.cuerpo, fontWeight: '600', color: colores.tinta },
  escribiendo: { flexDirection: 'row', alignItems: 'center', gap: esp.s, paddingVertical: esp.s },
  escribiendoTexto: { ...texto.menor },
  sugerencias: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: esp.s,
    paddingHorizontal: esp.l,
    paddingBottom: esp.s,
  },
  barra: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: esp.s,
    paddingHorizontal: esp.l,
    paddingVertical: esp.m,
    borderTopWidth: 1,
    borderTopColor: colores.borde,
    backgroundColor: colores.blanco,
  },
  input: {
    flex: 1,
    ...texto.cuerpo,
    color: colores.tinta,
    maxHeight: 110,
    minHeight: 44,
    paddingHorizontal: esp.m,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: colores.crema,
    borderRadius: radio.m,
    borderWidth: 1,
    borderColor: colores.borde,
  },
  enviar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colores.acento,
    alignItems: 'center',
    justifyContent: 'center',
  },
  enviarInactivo: { opacity: 0.4 },
});
