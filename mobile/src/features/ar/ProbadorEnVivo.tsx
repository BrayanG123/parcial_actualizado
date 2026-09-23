/**
 * Probador en vivo: realidad aumentada sobre la persona.
 *
 * La pagina del WebView (paginaProbadorVivo) detecta el cuerpo con MediaPipe y
 * mantiene la prenda sobre hombros o cadera mientras la persona se mueve. Esta
 * vista controla la camara, el tipo de prenda y la captura.
 *
 * En la PC (expo start --web) la misma pagina corre en un iframe con la webcam.
 *
 * Con la foto tomada se puede pedir una version realista a la IA del backend
 * (POST /virtual-fitting/try-on). Es opcional: si el servidor no tiene cuota de
 * imagenes, la RA en vivo sigue funcionando igual.
 */
import { createElement, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useCameraPermissions } from 'expo-camera';
import ViewShot, { captureRef, type ViewShotRef } from 'react-native-view-shot';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Boton } from '../../components/Boton';
import { AvisoEnLinea } from '../../components/Estados';
import { Chip } from '../../components/Selectores';
import { useAvisos } from '../../context/AvisosContext';
import { useSesion } from '../../context/SesionContext';
import { probadorService } from '../../services/probador.service';
import { colores, esp, texto } from '../../theme';
import { ORIGEN_PROBADOR, paginaProbadorVivo } from './paginaProbadorVivo';

export type TipoPrenda = 'superior' | 'inferior' | 'vestido';

const TIPOS: { valor: TipoPrenda; texto: string }[] = [
  { valor: 'superior', texto: 'Superior' },
  { valor: 'inferior', texto: 'Inferior' },
  { valor: 'vestido', texto: 'Vestido' },
];

const AYUDA: Record<string, string> = {
  cargando: 'Preparando la camara y el detector de cuerpo...',
  sin_persona: 'Alejate un poco: necesitamos ver tu cabeza y tus hombros.',
  sin_cadera: 'Alejate un poco mas: para esta prenda necesitamos ver tu cadera.',
  ok: 'Muevete con libertad. Arrastra o pellizca la prenda para ajustarla.',
  cerca: 'Estas muy cerca: alejate hasta que se vean tu cabeza y tu cintura.',
  parcial: 'Alejate un poco mas para que la prenda llegue hasta tu cintura.',
};

/** Estados en los que la prenda ya se dibuja y se puede tomar la foto. */
const DIBUJANDO = ['ok', 'cerca', 'parcial'];

const ERRORES: Record<string, string> = {
  camara: 'No pudimos abrir la camara dentro del probador. Revisa el permiso de camara de la app.',
  modelo: 'No pudimos cargar el detector de cuerpo. Revisa tu conexion a internet.',
  prenda: 'No pudimos cargar la foto de la prenda.',
  captura: 'No pudimos tomar la foto. Intenta de nuevo.',
};

/** Deduce el tipo de prenda desde la categoria para anclarla bien. */
function tipoPorCategoria(categoria = ''): TipoPrenda {
  const n = categoria
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (/pantal|jean|short|falda|bermuda|jogger|legging|calza/.test(n)) return 'inferior';
  if (/vestido|enterizo|overol|jumpsuit/.test(n)) return 'vestido';
  return 'superior';
}

/** Descarga la foto en React Native (sin CORS) para entregarla como data URI. */
async function comoDataUri(url: string): Promise<string> {
  const respuesta = await fetch(url);
  if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
  const blob = await respuesta.blob();
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result));
    lector.onerror = () => reject(lector.error ?? new Error('lectura'));
    lector.readAsDataURL(blob);
  });
}

interface Props {
  idProducto: number;
  urlPrenda: string;
  nombre: string;
  categoria?: string;
}

interface Captura {
  compuesta: string;
  original: string;
}

export function ProbadorEnVivo({ idProducto, urlPrenda, nombre, categoria }: Props) {
  const [permiso, pedirPermiso] = useCameraPermissions();
  const [tipo, setTipo] = useState<TipoPrenda>(() => tipoPorCategoria(categoria));
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const [captura, setCaptura] = useState<Captura | null>(null);
  const [fotoIA, setFotoIA] = useState<string | null>(null);
  const [verIA, setVerIA] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const web = useRef<WebView>(null);
  const marco = useRef<HTMLIFrameElement | null>(null);
  const composicion = useRef<ViewShotRef>(null);
  const { avisar, avisarError } = useAvisos();
  const { usuario } = useSesion();

  function ordenar(codigo: string) {
    const js = `window.probador && window.probador.${codigo}; true;`;
    if (Platform.OS !== 'web') {
      web.current?.injectJavaScript(js);
      return;
    }
    // El iframe srcdoc comparte origen con la app web: se puede ejecutar directo.
    const ventana = marco.current?.contentWindow as (Window & { eval(codigo: string): unknown }) | null;
    ventana?.eval(js);
  }

  // La prenda se entrega cuando la pagina avisa que esta lista.
  useEffect(() => {
    if (!listo || !urlPrenda) return;
    let vigente = true;
    comoDataUri(urlPrenda)
      .catch(() => urlPrenda)
      .then((fuente) => {
        if (vigente) ordenar(`fijarPrenda(${JSON.stringify(fuente)})`);
      });
    return () => {
      vigente = false;
    };
  }, [listo, urlPrenda]);

  useEffect(() => {
    if (listo) ordenar(`fijarTipo(${JSON.stringify(tipo)})`);
  }, [listo, tipo]);

  function alMensaje(evento: WebViewMessageEvent) {
    procesarMensaje(evento.nativeEvent.data);
  }

  function procesarMensaje(datos: string) {
    let msg: {
      type?: string;
      estado?: string;
      codigo?: string;
    } & Partial<Captura>;
    try {
      msg = JSON.parse(datos);
    } catch {
      return;
    }
    if (msg.type === 'listo') setListo(true);
    else if (msg.type === 'estado' && msg.estado) setEstado(msg.estado);
    else if (msg.type === 'error') setError(ERRORES[msg.codigo ?? ''] ?? 'El probador tuvo un problema.');
    else if (msg.type === 'captura' && msg.compuesta && msg.original) {
      setCaptura({ compuesta: msg.compuesta, original: msg.original });
      setFotoIA(null);
      setVerIA(false);
    }
  }

  // En la web la pagina responde con postMessage a la ventana padre.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const escuchar = (e: MessageEvent) => {
      if (marco.current && e.source === marco.current.contentWindow && typeof e.data === 'string')
        procesarMensaje(e.data);
    };
    window.addEventListener('message', escuchar);
    return () => window.removeEventListener('message', escuchar);
  }, []);

  function repetir() {
    setCaptura(null);
    setFotoIA(null);
    setVerIA(false);
    setListo(false);
    setError(null);
    setEstado('cargando');
  }

  async function probarConIA() {
    if (!captura || generando) return;
    setGenerando(true);
    try {
      const resultado = await probadorService.probarConIA(idProducto, captura.original);
      setFotoIA(resultado.uri);
      setVerIA(true);
    } catch (e) {
      avisarError(e);
    } finally {
      setGenerando(false);
    }
  }

  async function guardar() {
    if (guardando) return;
    if (Platform.OS === 'web') {
      // En la PC se descarga la imagen en lugar de ir a la galeria.
      const enlace = document.createElement('a');
      enlace.href = verIA && fotoIA ? fotoIA : (captura?.compuesta ?? '');
      enlace.download = `probador-${idProducto}.jpg`;
      enlace.click();
      return;
    }
    setGuardando(true);
    try {
      const uri = await captureRef(composicion, {
        format: 'jpg',
        quality: 0.92,
      });
      const galeria = await import('expo-media-library');
      const permisoGaleria = await galeria.requestPermissionsAsync();
      if (!permisoGaleria.granted) {
        avisar('Necesitamos permiso para guardar en tu galeria.', 'info');
        return;
      }
      await galeria.saveToLibraryAsync(uri);
      avisar('Guardamos tu prueba en la galeria.');
    } catch (e) {
      avisarError(e);
    } finally {
      setGuardando(false);
    }
  }

  /* --- permisos --- */

  // En la web el navegador pide la camara al abrir el iframe.
  const esWeb = Platform.OS === 'web';

  if (!esWeb && !permiso) {
    return (
      <View style={estilos.centro}>
        <ActivityIndicator color={colores.acento} />
      </View>
    );
  }

  if (!esWeb && permiso && !permiso.granted) {
    return (
      <View style={estilos.centro}>
        <Ionicons name="body-outline" size={34} color={colores.tinta3} />
        <Text style={estilos.titulo}>Necesitamos tu camara</Text>
        <Text style={estilos.detalle}>
          El probador detecta tu cuerpo en el telefono y coloca la prenda encima mientras te mueves. El video
          no sale de tu telefono.
        </Text>
        <Boton titulo="Permitir camara" onPress={() => void pedirPermiso()} />
      </View>
    );
  }

  /* --- resultado --- */

  if (captura) {
    const mostrada = verIA && fotoIA ? fotoIA : captura.compuesta;
    return (
      <View style={estilos.contenedor}>
        <ViewShot ref={composicion} style={estilos.escena}>
          <Image source={{ uri: mostrada }} style={StyleSheet.absoluteFill} contentFit="contain" />
        </ViewShot>
        {generando ? (
          <View style={estilos.capaCarga}>
            <ActivityIndicator color={colores.blanco} size="large" />
            <Text style={estilos.textoCarga}>
              La IA esta vistiendo tu foto... puede tardar hasta un minuto.
            </Text>
          </View>
        ) : null}

        <View style={estilos.controles}>
          {fotoIA ? (
            <View style={estilos.fila}>
              <Chip texto="Realidad aumentada" activo={!verIA} onPress={() => setVerIA(false)} />
              <Chip texto="Foto con IA" activo={verIA} onPress={() => setVerIA(true)} />
            </View>
          ) : usuario ? (
            <Boton
              titulo="Foto realista con IA"
              icono="sparkles-outline"
              variante="secundario"
              ancho
              cargando={generando}
              onPress={probarConIA}
            />
          ) : (
            <Text style={estilos.ayuda}>Inicia sesion para generar una foto realista con IA.</Text>
          )}
          <View style={estilos.fila}>
            <Boton
              titulo="Repetir"
              icono="camera-reverse-outline"
              variante="secundario"
              onPress={repetir}
              estilo={estilos.mitad}
            />
            <Boton
              titulo="Guardar"
              icono="download-outline"
              onPress={guardar}
              cargando={guardando}
              deshabilitado={generando}
              estilo={estilos.mitad}
            />
          </View>
        </View>
      </View>
    );
  }

  /* --- camara en vivo --- */

  return (
    <View style={estilos.contenedor}>
      <View style={estilos.escena}>
        {esWeb ? (
          createElement('iframe', {
            ref: (el: HTMLIFrameElement | null) => {
              marco.current = el;
            },
            srcDoc: paginaProbadorVivo(),
            allow: 'camera; autoplay',
            title: 'Probador en vivo',
            style: {
              border: 0,
              width: '100%',
              height: '100%',
              backgroundColor: colores.tinta,
            },
          })
        ) : (
          <WebView
            ref={web}
            source={{ html: paginaProbadorVivo(), baseUrl: ORIGEN_PROBADOR }}
            originWhitelist={['*']}
            onMessage={alMensaje}
            javaScriptEnabled
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            mediaCapturePermissionGrantType="grant"
            scrollEnabled={false}
            bounces={false}
            overScrollMode="never"
            setBuiltInZoomControls={false}
            style={estilos.web}
            onError={() => setError(ERRORES.modelo)}
          />
        )}
        {estado === 'cargando' && !error ? (
          <View style={estilos.capaCarga} pointerEvents="none">
            <ActivityIndicator color={colores.blanco} />
            <Text style={estilos.textoCarga}>{AYUDA.cargando}</Text>
          </View>
        ) : null}
        {error ? (
          <View style={estilos.capaAviso}>
            <AvisoEnLinea texto={error} />
          </View>
        ) : null}

        <Pressable
          onPress={() => ordenar('cambiarCamara()')}
          style={estilos.botonFlotante}
          accessibilityRole="button"
          accessibilityLabel="Cambiar camara"
        >
          <Ionicons name="camera-reverse-outline" size={20} color={colores.blanco} />
        </Pressable>
        <Pressable
          onPress={() => ordenar('reiniciar()')}
          style={[estilos.botonFlotante, estilos.botonFlotanteSegundo]}
          accessibilityRole="button"
          accessibilityLabel="Reiniciar ajuste de la prenda"
        >
          <Ionicons name="refresh" size={20} color={colores.blanco} />
        </Pressable>
      </View>

      <View style={estilos.controles}>
        <Text
          style={[
            estilos.ayuda,
            estado === 'ok' && estilos.ayudaOk,
            (estado === 'cerca' || estado === 'parcial') && estilos.ayudaAviso,
          ]}
          numberOfLines={2}
        >
          {AYUDA[estado] ?? AYUDA.cargando}
        </Text>
        <View style={estilos.fila}>
          {TIPOS.map((t) => (
            <Chip key={t.valor} texto={t.texto} activo={tipo === t.valor} onPress={() => setTipo(t.valor)} />
          ))}
        </View>
        <Boton
          titulo="Tomar foto"
          icono="camera-outline"
          ancho
          deshabilitado={!DIBUJANDO.includes(estado)}
          onPress={() => ordenar('capturar()')}
        />
        <Text style={estilos.nota} numberOfLines={1}>
          {nombre}
        </Text>
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: colores.tinta },
  escena: { flex: 1, overflow: 'hidden', backgroundColor: colores.tinta },
  web: { flex: 1, backgroundColor: colores.tinta },
  capaCarga: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: esp.m,
    padding: esp.xl,
    backgroundColor: colores.overlay,
  },
  textoCarga: { ...texto.cuerpo, color: colores.blanco, textAlign: 'center' },
  capaAviso: { position: 'absolute', top: esp.l, left: esp.l, right: 70 },
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
  fila: { flexDirection: 'row', gap: esp.s, justifyContent: 'center' },
  mitad: { flex: 1 },
  ayuda: { ...texto.menor, textAlign: 'center' },
  ayudaOk: { color: colores.exito },
  ayudaAviso: { color: colores.alerta, fontWeight: '600' },
  nota: { ...texto.menor, textAlign: 'center', color: colores.tinta3 },
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
