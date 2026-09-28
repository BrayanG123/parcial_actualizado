/**
 * Visor del RecursoRA (modelo 3D) y puerta a la realidad aumentada nativa.
 *
 * Por que este camino:
 * - React Native no tiene un motor de RA propio. Las alternativas reales son
 *   ViroReact (requiere build nativo propio, no funciona en Expo Go y pesa
 *   mucho para equipos modestos) o delegar en el visor de RA del sistema.
 * - Android trae Scene Viewer (ARCore) e iOS trae AR Quick Look. La etiqueta
 *   <model-viewer> de Google los invoca con un solo boton y, cuando el equipo
 *   no soporta RA, sigue mostrando el modelo 3D girable.
 * - El resultado: 3D en cualquier telefono y RA real donde el sistema la
 *   soporta, sin agregar un motor de RA al proyecto ni convertirlo en otra
 *   entidad del dominio (el dominio solo conoce RecursoRA: tipo, url, formato).
 *
 * Limitacion honesta: esta vista coloca la prenda en el espacio, no sobre el
 * cuerpo. El probador sobre la persona es el modo Camara de esta pantalla.
 */
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { AvisoEnLinea } from '../../components/Estados';
import type { RecursoRA } from '../../types/domain';
import { colores, esp, texto } from '../../theme';

const MODEL_VIEWER = 'https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js';

function paginaModelo(recurso: RecursoRA): string {
  // La URL viene del backend: se escapan las comillas para no romper el HTML.
  const url = recurso.url_recurso.replace(/"/g, '&quot;');
  return `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <script type="module" src="${MODEL_VIEWER}"></script>
    <style>
      html, body { margin: 0; height: 100%; background: ${colores.crema2}; }
      model-viewer { width: 100%; height: 100%; --poster-color: transparent; }
      #ar-boton {
        position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%);
        background: ${colores.acento}; color: #fff; border: none; border-radius: 999px;
        padding: 12px 22px; font: 600 15px system-ui, sans-serif;
      }
      #error {
        position: absolute; inset: 0; display: none; align-items: center; justify-content: center;
        padding: 24px; text-align: center; color: ${colores.tinta2};
        font: 14px system-ui, sans-serif;
      }
    </style>
  </head>
  <body>
    <model-viewer
      src="${url}"
      ar
      ar-modes="scene-viewer quick-look webxr"
      camera-controls
      touch-action="pan-y"
      shadow-intensity="1"
      exposure="0.9"
      onerror="document.getElementById('error').style.display='flex'"
    >
      <button slot="ar-button" id="ar-boton">Ver en tu espacio</button>
    </model-viewer>
    <div id="error">No pudimos cargar el modelo 3D de esta prenda.</div>
  </body>
</html>`;
}

export function VisorModelo3D({ recurso }: { recurso: RecursoRA }) {
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState(false);

  return (
    <View style={estilos.contenedor}>
      <WebView
        originWhitelist={['*']}
        source={{ html: paginaModelo(recurso) }}
        style={estilos.web}
        onLoadEnd={() => setCargando(false)}
        onError={() => {
          setCargando(false);
          setFallo(true);
        }}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        // El visor no necesita historial ni zoom del navegador.
        setBuiltInZoomControls={false}
        scrollEnabled={false}
      />

      {cargando ? (
        <View style={estilos.capa}>
          <ActivityIndicator color={colores.acento} />
          <Text style={estilos.mensaje}>Cargando modelo 3D...</Text>
        </View>
      ) : null}

      {fallo ? (
        <View style={estilos.capaAviso}>
          <AvisoEnLinea texto="No pudimos cargar el modelo. Revisa tu conexion e intenta de nuevo." />
        </View>
      ) : null}

      <View style={estilos.pie}>
        <Text style={estilos.ayuda}>
          Gira la prenda con el dedo. Si tu telefono tiene soporte de realidad aumentada, el boton
          &quot;Ver en tu espacio&quot; la coloca en tu habitacion con la camara.
        </Text>
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: colores.crema2 },
  web: { flex: 1, backgroundColor: colores.crema2 },
  capa: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: esp.s,
    backgroundColor: colores.crema2,
  },
  capaAviso: { position: 'absolute', top: esp.l, left: esp.l, right: esp.l },
  mensaje: { ...texto.menor },
  pie: { padding: esp.l, backgroundColor: colores.blanco, borderTopWidth: 1, borderTopColor: colores.borde },
  ayuda: { ...texto.menor, textAlign: 'center' },
});
