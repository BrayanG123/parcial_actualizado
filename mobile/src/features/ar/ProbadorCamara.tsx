/**
 * Probador sobre la camara.
 *
 * Que hace de verdad: abre la camara, superpone la prenda y deja ajustarla con
 * los dedos (arrastrar y pellizcar para escalar). Al disparar, toma la foto y
 * arma la composicion final, que se puede guardar en la galeria.
 *
 * Que NO hace, y no se disimula: no detecta el cuerpo ni sigue el movimiento.
 * El seguimiento de pose exige modelos de vision por computadora que no
 * funcionan en Expo Go y que dejarian inutilizable un telefono modesto, que es
 * justamente el equipo que debe poder usar esta aplicacion.
 *
 * La captura se hace en dos tiempos a proposito: primero la foto de la camara
 * y despues la composicion foto + prenda sobre vistas normales. Capturar la
 * vista previa de la camara directamente devuelve un cuadro negro en varios
 * telefonos Android.
 */
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions, type CameraCapturedPicture } from 'expo-camera';
import ViewShot, { captureRef, type ViewShotRef } from 'react-native-view-shot';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Boton } from '../../components/Boton';
import { Chip } from '../../components/Selectores';
import { useAvisos } from '../../context/AvisosContext';
import { colores, esp, texto } from '../../theme';

const OPACIDADES = [
  { texto: 'Suave', valor: 0.6 },
  { texto: 'Media', valor: 0.8 },
  { texto: 'Solida', valor: 1 },
];

const ESCALA_MIN = 0.4;
const ESCALA_MAX = 2.6;

interface Props {
  urlPrenda: string;
  nombre: string;
}

export function ProbadorCamara({ urlPrenda, nombre }: Props) {
  const [permiso, pedirPermiso] = useCameraPermissions();
  const [frontal, setFrontal] = useState(true);
  const [opacidad, setOpacidad] = useState(0.8);
  const [foto, setFoto] = useState<CameraCapturedPicture | null>(null);
  const [capturando, setCapturando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const camara = useRef<CameraView>(null);
  const composicion = useRef<ViewShotRef>(null);
  const { avisar, avisarError } = useAvisos();

  /* --- gesto: arrastrar y pellizcar sin librerias de animacion --- */

  const posicion = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const escala = useRef(new Animated.Value(1)).current;
  /** Espejo numerico de los valores animados, para calcular desde el gesto. */
  const actual = useRef({ x: 0, y: 0, escala: 1 });
  const base = useRef({ x: 0, y: 0, escala: 1, distancia: 0, dedos: 0 });

  useEffect(() => {
    const idX = posicion.x.addListener(({ value }) => (actual.current.x = value));
    const idY = posicion.y.addListener(({ value }) => (actual.current.y = value));
    const idE = escala.addListener(({ value }) => (actual.current.escala = value));
    return () => {
      posicion.x.removeListener(idX);
      posicion.y.removeListener(idY);
      escala.removeListener(idE);
    };
  }, [posicion, escala]);

  const gestos = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        base.current = { ...actual.current, distancia: 0, dedos: 1 };
      },
      onPanResponderMove: (evento, estado) => {
        const toques = evento.nativeEvent.touches;

        if (toques.length >= 2) {
          const dx = toques[0].pageX - toques[1].pageX;
          const dy = toques[0].pageY - toques[1].pageY;
          const distancia = Math.hypot(dx, dy);

          // Al pasar de uno a dos dedos se recalcula la referencia para que la
          // prenda no salte de tamano.
          if (base.current.dedos < 2 || base.current.distancia === 0) {
            base.current = { ...actual.current, distancia, dedos: 2 };
            return;
          }
          const factor = distancia / base.current.distancia;
          const nueva = Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, base.current.escala * factor));
          escala.setValue(nueva);
          return;
        }

        if (base.current.dedos !== 1) {
          base.current = { ...actual.current, distancia: 0, dedos: 1 };
          return;
        }
        posicion.setValue({ x: base.current.x + estado.dx, y: base.current.y + estado.dy });
      },
      onPanResponderRelease: () => {
        base.current = { ...actual.current, distancia: 0, dedos: 0 };
      },
    }),
  ).current;

  function reiniciar() {
    posicion.setValue({ x: 0, y: 0 });
    escala.setValue(1);
  }

  /* --- permisos --- */

  if (!permiso) {
    return (
      <View style={estilos.centro}>
        <ActivityIndicator color={colores.acento} />
      </View>
    );
  }

  if (!permiso.granted) {
    return (
      <View style={estilos.centro}>
        <Ionicons name="camera-outline" size={34} color={colores.tinta3} />
        <Text style={estilos.titulo}>Necesitamos tu camara</Text>
        <Text style={estilos.detalle}>
          El probador virtual superpone la prenda sobre la imagen de tu camara. Las fotos solo salen de tu
          telefono si tu decides guardarlas.
        </Text>
        <Boton titulo="Permitir camara" onPress={() => void pedirPermiso()} />
      </View>
    );
  }

  /* --- captura --- */

  async function disparar() {
    if (capturando) return;
    setCapturando(true);
    try {
      const tomada = await camara.current?.takePictureAsync({ quality: 0.7, skipProcessing: true });
      if (tomada) setFoto(tomada);
    } catch (error) {
      avisarError(error);
    } finally {
      setCapturando(false);
    }
  }

  async function guardar() {
    if (guardando) return;
    if (Platform.OS === 'web') {
      avisar('Guardar en la galeria solo funciona en el telefono.', 'info');
      return;
    }
    setGuardando(true);
    try {
      const uri = await captureRef(composicion, { format: 'jpg', quality: 0.9 });
      // Carga diferida: el modulo nativo de galeria solo se necesita al guardar,
      // y no existe fuera del telefono (la vista previa web no lo tiene).
      const galeria = await import('expo-media-library');
      const permisoGaleria = await galeria.requestPermissionsAsync();
      if (!permisoGaleria.granted) {
        avisar('Necesitamos permiso para guardar en tu galeria.', 'info');
        return;
      }
      await galeria.saveToLibraryAsync(uri);
      avisar('Guardamos tu prueba en la galeria.');
    } catch (error) {
      avisarError(error);
    } finally {
      setGuardando(false);
    }
  }

  const prenda = (
    <Animated.View
      {...gestos.panHandlers}
      style={[
        estilos.prenda,
        { opacity: opacidad, transform: [...posicion.getTranslateTransform(), { scale: escala }] },
      ]}
    >
      <Image
        source={{ uri: urlPrenda }}
        style={estilos.imagenPrenda}
        contentFit="contain"
        cachePolicy="memory-disk"
        accessibilityLabel={nombre}
      />
    </Animated.View>
  );

  /* --- resultado --- */

  if (foto) {
    return (
      <View style={estilos.contenedor}>
        <ViewShot ref={composicion} style={estilos.escena}>
          <Image source={{ uri: foto.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
          {prenda}
        </ViewShot>

        <View style={estilos.controles}>
          <Text style={estilos.ayuda}>Puedes seguir ajustando la prenda antes de guardar.</Text>
          <View style={estilos.filaBotones}>
            <Boton
              titulo="Repetir"
              icono="camera-reverse-outline"
              variante="secundario"
              onPress={() => setFoto(null)}
              estilo={estilos.mitad}
            />
            <Boton
              titulo="Guardar"
              icono="download-outline"
              onPress={guardar}
              cargando={guardando}
              estilo={estilos.mitad}
            />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={estilos.contenedor}>
      <View style={estilos.escena}>
        <CameraView ref={camara} style={StyleSheet.absoluteFill} facing={frontal ? 'front' : 'back'} />
        {prenda}

        <Pressable
          onPress={() => setFrontal((f) => !f)}
          style={estilos.botonFlotante}
          accessibilityRole="button"
          accessibilityLabel="Cambiar camara"
        >
          <Ionicons name="camera-reverse-outline" size={20} color={colores.blanco} />
        </Pressable>
        <Pressable
          onPress={reiniciar}
          style={[estilos.botonFlotante, estilos.botonFlotanteSegundo]}
          accessibilityRole="button"
          accessibilityLabel="Centrar prenda"
        >
          <Ionicons name="refresh" size={20} color={colores.blanco} />
        </Pressable>
      </View>

      <View style={estilos.controles}>
        <Text style={estilos.ayuda}>Arrastra la prenda y pellizca para ajustar su tamano.</Text>
        <View style={estilos.filaOpacidad}>
          {OPACIDADES.map((o) => (
            <Chip
              key={o.texto}
              texto={o.texto}
              activo={opacidad === o.valor}
              onPress={() => setOpacidad(o.valor)}
            />
          ))}
        </View>
        <Boton
          titulo="Tomar foto"
          icono="camera-outline"
          ancho
          onPress={disparar}
          cargando={capturando}
        />
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: colores.tinta },
  escena: { flex: 1, overflow: 'hidden', backgroundColor: colores.tinta },
  prenda: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagenPrenda: { width: '70%', height: '70%' },
  botonFlotante: {
    position: 'absolute',
    top: esp.l,
    right: esp.l,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(28,27,26,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonFlotanteSegundo: { top: esp.l + 52 },
  controles: {
    padding: esp.l,
    gap: esp.m,
    backgroundColor: colores.blanco,
    borderTopWidth: 1,
    borderTopColor: colores.borde,
  },
  filaOpacidad: { flexDirection: 'row', gap: esp.s, justifyContent: 'center' },
  filaBotones: { flexDirection: 'row', gap: esp.m },
  mitad: { flex: 1 },
  ayuda: { ...texto.menor, textAlign: 'center' },
  centro: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: esp.m,
    padding: esp.xl,
    backgroundColor: colores.crema,
  },
  titulo: { ...texto.titulo, textAlign: 'center' },
  detalle: { ...texto.cuerpo, textAlign: 'center', color: colores.tinta3 },
});
