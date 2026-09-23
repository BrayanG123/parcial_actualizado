/**
 * Pagina HTML del probador en vivo. Corre dentro de un WebView porque:
 * - MediaPipe Pose Landmarker (Google) detecta 33 puntos del cuerpo en tiempo
 *   real con WebAssembly/WebGL, y en React Native solo existe como modulo
 *   nativo que no funciona en Expo Go.
 * - El WebView del sistema ya trae camara (getUserMedia) y aceleracion grafica.
 *
 * Flujo: camara -> pose por cuadro -> la foto de la prenda se deforma con una
 * malla entre dos lineas del cuerpo (hombros-cadera, o cadera-rodillas), asi se
 * estira con el torso y sigue inclinaciones. El frente envuelve un cilindro
 * eliptico (el torso) que gira con los hombros en 3D, asi funciona de lado. La
 * silueta de la persona ajusta el ancho fila por fila al cuerpo de quien posa.
 * Las mangas siguen hombro, codo y muneca; cara, cuello y manos se vuelven a
 * pintar encima; en la PC la prenda toma los pliegues y sombras de la ropa real. El fondo de la foto de
 * producto se quita en el propio telefono respetando el contorno de la prenda.
 *
 * Mensajes hacia React Native (JSON por postMessage):
 *   { type: 'listo' } | { type: 'estado', estado } | { type: 'error', codigo, detalle }
 *   { type: 'captura', compuesta, original }
 * Ordenes desde React Native (injectJavaScript): window.probador.<metodo>(...)
 */
import { colores } from '../../theme';

const MEDIAPIPE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1';
const MODELOS = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker';
/** Telefono: modelo liviano. PC (version web): modelo completo, mas preciso. */
const MODELO_LITE = `${MODELOS}/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`;
const MODELO_FULL = `${MODELOS}/pose_landmarker_full/float16/1/pose_landmarker_full.task`;

/** Origen seguro para que el WebView permita la camara (getUserMedia). */
export const ORIGEN_PROBADOR = 'https://probador.fashionstore.local/';

export function paginaProbadorVivo(): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; background: ${colores.tinta}; touch-action: none; }
  canvas { position: fixed; inset: 0; width: 100%; height: 100%; }
  video { display: none; }
</style>
</head>
<body>
<video id="video" playsinline muted autoplay></video>
<canvas id="lienzo"></canvas>
<script type="module">
const MEDIAPIPE = '${MEDIAPIPE}';
const MODELO_POSE = window.ReactNativeWebView ? '${MODELO_LITE}' : '${MODELO_FULL}';
// Indices de MediaPipe Pose: nariz 0, orejas 7/8, hombros 11/12, codos 13/14, munecas 15/16,
// menique 17/18, indice 19/20, pulgar 21/22, cadera 23/24, rodillas 25/26, tobillos 27/28.
const PUNTOS = [0, 7, 8, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28];
/*
 * Filtro One Euro (Casiez et al.): quieto suaviza mucho (sin temblor) y en
 * movimiento casi no retrasa. Coordenadas normalizadas 0..1, tiempo en segundos.
 */
const FILTRO = { corteMin: 1.4, beta: 7, corteDerivada: 1 };
const CUADROS_SIN_POSE = 8;
/*
 * Cada prenda se ancla con dos lineas del cuerpo. v = altura dentro de la foto
 * recortada (0 arriba, 1 abajo). "cuerpo" = cuanto mas ancha que las
 * articulaciones es la persona (los puntos de MediaPipe son centros de hueso).
 * "banda" = filas de la foto donde se mide el ancho de hombros o cintura.
 * "ancho" = respaldo cuando no se pudo medir la prenda (fondo no quitado).
 * "subir" = la superficie del hombro (o la cintura) esta por encima de la
 * articulacion; se sube la primera linea esa fraccion de su largo.
 */
const AJUSTE = {
  superior: { linea1: 'hombros', v1: 0.1, linea2: 'cadera', v2: 0.92, cuerpo: 1.5, banda: [0.1, 0.18], ancho: 2.0, subir: 0.2 },
  vestido: { linea1: 'hombros', v1: 0.03, linea2: 'cadera', v2: 0.42, cuerpo: 1.1, banda: [0.1, 0.16], ancho: 1.9, subir: 0.15 },
  inferior: { linea1: 'cadera', v1: 0.07, linea2: 'rodillas', v2: 0.5, cuerpo: 1.7, banda: [0.01, 0.06], ancho: 2.6, subir: 0.15 },
};

const video = document.getElementById('video');
const lienzo = document.getElementById('lienzo');
const ctx = lienzo.getContext('2d');

const est = {
  frontal: true, tipo: 'superior', prenda: null,
  escala: 1, dx: 0, dy: 0,
  pose: null, perdidos: CUADROS_SIN_POSE, estado: '',
  stream: null, detector: null, ultimoTiempo: -1, ultimoTs: 0,
  // Brillo de la escena: la prenda se oscurece en cuartos poco iluminados.
  brillo: 1, cuadro: 0, luzTorso: 128, vista: null, tinte: null, filtros: null, ultimoFiltro: 0,
  giro: 0, mascara: null, filasAjuste: null,
  // Ancho de referencia actual (px), para que el arrastre siga a la persona.
  ref: 1,
};

// WebView en el telefono; iframe (ventana padre) en la version web de la app.
const enviar = (type, datos = {}) => {
  const texto = JSON.stringify({ type, ...datos });
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(texto);
  else if (window.parent !== window) window.parent.postMessage(texto, '*');
};

function fijarEstado(estado) {
  if (est.estado === estado) return;
  est.estado = estado;
  enviar('estado', { estado });
}

/* ---------- prenda: quitar fondo y recortar ---------- */

/** Engrosa una mascara 1 px por vuelta (vecinos en cruz). */
function dilatar(m, w, h, vueltas) {
  let a = m;
  for (let k = 0; k < vueltas; k++) {
    const b = a.slice();
    for (let p = 0; p < a.length; p++) {
      if (!a[p]) continue;
      const x = p % w;
      if (x > 0) b[p - 1] = 1;
      if (x < w - 1) b[p + 1] = 1;
      if (p >= w) b[p - w] = 1;
      if (p < a.length - w) b[p + w] = 1;
    }
    a = b;
  }
  return a;
}

/** Relleno desde los bordes de la imagen por los pixeles donde puede(p) es true. */
function rellenarDesdeBordes(w, h, puede) {
  const n = w * h, m = new Uint8Array(n), pila = new Int32Array(n);
  let t = 0;
  const entrar = (p) => { if (!m[p] && puede(p)) { m[p] = 1; pila[t++] = p; } };
  for (let x = 0; x < w; x++) { entrar(x); entrar((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { entrar(y * w); entrar(y * w + w - 1); }
  while (t) {
    const p = pila[--t], x = p % w;
    if (x > 0) entrar(p - 1);
    if (x < w - 1) entrar(p + 1);
    if (p >= w) entrar(p - w);
    if (p < n - w) entrar(p + w);
  }
  return m;
}

/*
 * Quita el fondo de estudio sin comerse prendas del mismo color (camisa blanca
 * sobre blanco): el relleno se detiene en el contorno (bordes de luminancia),
 * y un cierre morfologico sella los huecos del contorno y rellena el interior.
 */
function quitarFondo(g, w, h) {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data, n = w * h;
  const borde = [];
  for (let x = 0; x < w; x++) borde.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) borde.push(y * w, y * w + w - 1);
  let alfa = 0;
  for (const p of borde) alfa += d[p * 4 + 3];
  if (alfa / borde.length < 20) return; // PNG ya transparente
  const mediana = (c) => { const v = borde.map((p) => d[p * 4 + c]).sort((a, b) => a - b); return v[v.length >> 1]; };
  const r = mediana(0), gg = mediana(1), b = mediana(2);
  const dist = new Uint16Array(n), lum = new Int16Array(n);
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    dist[p] = Math.abs(d[i] - r) + Math.abs(d[i + 1] - gg) + Math.abs(d[i + 2] - b);
    lum[p] = (d[i] * 3 + d[i + 1] * 6 + d[i + 2]) / 10;
  }
  const TOL = 40;
  // Fondo no uniforme (foto con escena): se deja la imagen como esta.
  if (borde.filter((p) => dist[p] <= TOL).length < borde.length * 0.8) return;

  let barrera = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    if (p % w < w - 1 && Math.abs(lum[p] - lum[p + 1]) > 6) barrera[p] = barrera[p + 1] = 1;
    if (p < n - w && Math.abs(lum[p] - lum[p + w]) > 6) barrera[p] = barrera[p + w] = 1;
  }
  barrera = dilatar(barrera, w, h, 1);
  const fondo = rellenarDesdeBordes(w, h, (p) => !barrera[p] && dist[p] <= TOL);

  const R = 9;
  let prenda = new Uint8Array(n);
  for (let p = 0; p < n; p++) prenda[p] = fondo[p] ? 0 : 1;
  prenda = dilatar(prenda, w, h, R);
  const exterior = dilatar(rellenarDesdeBordes(w, h, (p) => !prenda[p]), w, h, R);

  const quitar = new Uint8Array(n);
  for (let p = 0; p < n; p++) if (fondo[p] && exterior[p]) { quitar[p] = 1; d[p * 4 + 3] = 0; }
  // Borde suave: pixeles de la prenda pegados al fondo y parecidos a el.
  for (let p = 0; p < n; p++) {
    if (quitar[p] || dist[p] > TOL) continue;
    const x = p % w;
    if ((x > 0 && quitar[p - 1]) || (x < w - 1 && quitar[p + 1]) || (p >= w && quitar[p - w]) || (p < n - w && quitar[p + w]))
      d[p * 4 + 3] = 40;
  }
  // Antialias: promedio 3x3 del alfa solo en el contorno, para que no se vea escalonado.
  const alfaOriginal = new Uint8Array(n);
  for (let p = 0; p < n; p++) alfaOriginal[p] = d[p * 4 + 3];
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      let suma = 0, min = 255, max = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const a = alfaOriginal[p + dy * w + dx];
          suma += a;
          if (a < min) min = a;
          if (a > max) max = a;
        }
      if (max - min > 30) d[p * 4 + 3] = suma / 9;
    }
  g.putImageData(img, 0, 0);
}

/** Ancho opaco (fraccion de la foto) en una banda de filas: hombros o cintura. */
function medirAncho(c, banda) {
  const { width: w, height: h } = c;
  const d = c.getContext('2d').getImageData(0, 0, w, h).data;
  const anchos = [];
  for (let y = Math.floor(banda[0] * h); y <= Math.min(h - 1, Math.ceil(banda[1] * h)); y++) {
    let x0 = -1, x1 = -1;
    for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 12) { if (x0 < 0) x0 = x; x1 = x; }
    if (x0 >= 0) anchos.push((x1 - x0 + 1) / w);
  }
  if (!anchos.length) return null;
  anchos.sort((a, b) => a - b);
  return anchos[anchos.length >> 1];
}

function recortar(c) {
  const g = c.getContext('2d');
  const { width: w, height: h } = c;
  const d = g.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (d[(y * w + x) * 4 + 3] > 12) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
  if (x1 < 0) return c;
  const salida = document.createElement('canvas');
  salida.width = x1 - x0 + 1;
  salida.height = y1 - y0 + 1;
  salida.getContext('2d').drawImage(c, x0, y0, salida.width, salida.height, 0, 0, salida.width, salida.height);
  return salida;
}

function cargarImagen(src, cors) {
  const img = new Image();
  if (cors) img.crossOrigin = 'anonymous';
  img.src = src;
  return img.decode().then(() => img);
}

async function prepararPrenda(src) {
  // Con CORS se puede quitar el fondo y capturar; si el servidor no lo permite, se usa tal cual.
  const remota = /^https?:/i.test(src);
  const img = await cargarImagen(src, remota).catch(() => (remota ? cargarImagen(src, false) : Promise.reject()));
  const k = Math.min(1, 900 / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round((img.naturalWidth || 400) * k));
  c.height = Math.max(1, Math.round((img.naturalHeight || 500) * k));
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, c.width, c.height);
  let lista = c, transparente = false;
  try {
    quitarFondo(g, c.width, c.height);
    lista = recortar(c);
    transparente = lista !== c;
  } catch (e) {
    // imagen de otro origen: se usa tal cual
  }
  // Con fondo quitado se mide la prenda real; si no, se usan proporciones fijas.
  const medidas = {};
  if (transparente) for (const t of Object.keys(AJUSTE)) medidas[t] = medirAncho(lista, AJUSTE[t].banda);
  return { imagen: lista, medidas };
}

/* ---------- camara y detector ---------- */

async function iniciarCamara() {
  if (est.stream) est.stream.getTracks().forEach((t) => t.stop());
  est.stream = null;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    enviar('error', { codigo: 'camara', detalle: 'getUserMedia no disponible' });
    return;
  }
  try {
    est.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: est.frontal ? 'user' : 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    video.srcObject = est.stream;
    await video.play();
  } catch (e) {
    enviar('error', { codigo: 'camara', detalle: String((e && e.name) || e) });
  }
}

async function iniciarDetector() {
  try {
    const { FilesetResolver, PoseLandmarker } = await import(MEDIAPIPE + '/vision_bundle.mjs');
    const archivos = await FilesetResolver.forVisionTasks(MEDIAPIPE + '/wasm');
    const crear = (delegate) => PoseLandmarker.createFromOptions(archivos, {
      baseOptions: { modelAssetPath: MODELO_POSE, delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
      // Silueta de la persona: permite ajustar la prenda al cuerpo real de quien posa.
      outputSegmentationMasks: true,
    });
    // GPU es mucho mas rapido; algunos WebView no lo permiten y se usa CPU.
    est.detector = await crear('GPU').catch(() => crear('CPU'));
  } catch (e) {
    enviar('error', { codigo: 'modelo', detalle: String((e && e.message) || e) });
  }
}

/* ---------- pose ---------- */

const alfaFiltro = (corte, dt) => 1 / (1 + 1 / (2 * Math.PI * corte * dt));

function filtrar(previo, valor, dt) {
  if (!previo) return { x: valor, d: 0 };
  const derivada = (valor - previo.x) / dt;
  const d = previo.d + (derivada - previo.d) * alfaFiltro(FILTRO.corteDerivada, dt);
  const corte = FILTRO.corteMin + FILTRO.beta * Math.abs(d);
  return { x: previo.x + (valor - previo.x) * alfaFiltro(corte, dt), d };
}

function actualizarPose(puntos) {
  const hombros = puntos && puntos[11] && puntos[12] && puntos[11].visibility > 0.5 && puntos[12].visibility > 0.5;
  if (!hombros) {
    est.perdidos++;
    if (est.perdidos >= CUADROS_SIN_POSE) { est.pose = null; est.filtros = null; }
    return;
  }
  est.perdidos = 0;
  const ahora = performance.now() / 1000;
  const dt = Math.min(0.25, Math.max(1 / 120, ahora - (est.ultimoFiltro || ahora - 1 / 30)));
  est.ultimoFiltro = ahora;
  const filtros = est.filtros || (est.filtros = {});
  const nueva = {};
  for (const i of PUNTOS) {
    const p = puntos[i];
    const f = filtros[i] || (filtros[i] = {});
    f.x = filtrar(f.x, p.x, dt);
    f.y = filtrar(f.y, p.y, dt);
    // La visibilidad tambien se suaviza para que manos y mangas no parpadeen.
    f.v = f.v === undefined ? p.visibility : f.v + (p.visibility - f.v) * 0.35;
    nueva[i] = { x: f.x.x, y: f.y.x, v: f.v };
  }
  est.pose = nueva;
}

/* ---------- dibujo ---------- */

const EN_PC = !window.ReactNativeWebView;
/** Malla mas fina en la PC; en el telefono se cuida el rendimiento. */
const MALLA = EN_PC ? { C: 10, F: 14 } : { C: 8, F: 10 };

const mini = document.createElement('canvas');
mini.width = 32; mini.height = 18;
/**
 * Luz de la escena (para oscurecer la prenda en cuartos poco iluminados) y luz
 * del torso (para normalizar los pliegues que se copian de la ropa real).
 */
function medirBrillo() {
  try {
    const g = mini.getContext('2d', { willReadFrequently: true });
    const promedio = () => {
      const d = g.getImageData(0, 0, 32, 18).data;
      let suma = 0;
      for (let i = 0; i < d.length; i += 4) suma += d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
      return suma / (d.length / 4);
    };
    g.drawImage(video, 0, 0, 32, 18);
    est.brillo = Math.min(1.05, Math.max(0.68, promedio() / 140));
    // Tono de la luz (calida o fria): color medio de la escena llevado a su canal maximo.
    const d = g.getImageData(0, 0, 32, 18).data;
    let r = 0, gr = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; gr += d[i + 1]; b += d[i + 2]; }
    const max = Math.max(r, gr, b) || 1;
    // Se limita para no tenir de mas con paredes de color.
    est.tinte = [r, gr, b].map((c) => Math.round(255 * Math.max(0.8, c / max)));
    const pose = est.pose;
    if (pose) {
      const vw = video.videoWidth, vh = video.videoHeight;
      const xs = [pose[11].x, pose[12].x], y0 = Math.min(pose[11].y, pose[12].y);
      const y1 = pose[23].v > 0.5 ? Math.max(pose[23].y, pose[24].y) : y0 + 0.3;
      const x0 = Math.max(0, Math.min(...xs)), ancho = Math.max(0.02, Math.max(...xs) - x0);
      const alto = Math.max(0.02, Math.min(1, y1) - y0);
      g.drawImage(video, x0 * vw, Math.max(0, y0) * vh, ancho * vw, alto * vh, 0, 0, 32, 18);
      est.luzTorso = Math.max(20, promedio());
    }
  } catch (e) { /* sin lectura del video: valores normales */ }
}

/** Video en modo "cover", espejado con la camara frontal (se reusa para destapar la cabeza). */
function pintarVideo(g) {
  const v = est.vista;
  g.save();
  if (est.frontal) { g.translate(v.cw, 0); g.scale(-1, 1); }
  g.drawImage(video, v.ox, v.oy, v.vw * v.s, v.vh * v.s);
  g.restore();
}

const entrada = document.createElement('canvas');

/** Copia la silueta (0..1 por pixel) antes del siguiente cuadro y libera la del detector. */
function leerSilueta(r) {
  const masks = r.segmentationMasks;
  if (!masks || !masks.length) return;
  try {
    const m = masks[0];
    est.mascara = { ancho: m.width, alto: m.height, datos: new Float32Array(m.getAsFloat32Array()) };
  } catch (e) {
    est.mascara = null;
  } finally {
    masks.forEach((m) => m.close && m.close());
  }
}

/**
 * Giro del cuerpo con la profundidad 3D de los hombros (metros). Positivo cuando
 * el hombro del lado derecho de la pantalla esta mas lejos de la camara.
 */
function actualizarGiro(mundo) {
  if (!mundo || !est.pose || !mundo[11] || !mundo[12]) return;
  const enPantalla = (i) => (est.frontal ? 1 - est.pose[i].x : est.pose[i].x);
  const [izq, der] = enPantalla(11) < enPantalla(12) ? [11, 12] : [12, 11];
  const ancho = Math.abs(mundo[der].x - mundo[izq].x) + 0.001;
  const bruto = Math.atan2(mundo[der].z - mundo[izq].z, ancho);
  const limite = 1.3;
  est.giro += (Math.max(-limite, Math.min(limite, bruto)) - est.giro) * 0.25;
}

function dibujar() {
  requestAnimationFrame(dibujar);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = Math.round(innerWidth * dpr), ch = Math.round(innerHeight * dpr);
  if (lienzo.width !== cw || lienzo.height !== ch) { lienzo.width = cw; lienzo.height = ch; }
  const vw = video.videoWidth, vh = video.videoHeight;
  if (video.readyState < 2 || !vw) return;

  const s = Math.max(cw / vw, ch / vh);
  est.vista = { s, vw, vh, cw, ch, ox: (cw - vw * s) / 2, oy: (ch - vh * s) / 2 };
  pintarVideo(ctx);

  if (est.detector && video.currentTime !== est.ultimoTiempo) {
    est.ultimoTiempo = video.currentTime;
    const ts = Math.max(performance.now(), est.ultimoTs + 1);
    est.ultimoTs = ts;
    try {
      // Se detecta sobre una copia chica del video: la silueta sale del mismo tamano
      // y leerla es barato (el modelo trabaja internamente a baja resolucion).
      const ew = 384, eh = Math.max(1, Math.round((384 * vh) / vw));
      if (entrada.width !== ew || entrada.height !== eh) { entrada.width = ew; entrada.height = eh; }
      entrada.getContext('2d').drawImage(video, 0, 0, ew, eh);
      const r = est.detector.detectForVideo(entrada, ts);
      actualizarPose(r.landmarks && r.landmarks[0]);
      leerSilueta(r);
      actualizarGiro(r.worldLandmarks && r.worldLandmarks[0]);
    } catch (e) { /* cuadro invalido: se ignora */ }
  }

  if (++est.cuadro % 15 === 0) medirBrillo();
  if (!est.detector) { fijarEstado('cargando'); return; }
  const { ox, oy } = est.vista;
  const aPantalla = (p) => ({ x: ox + (est.frontal ? 1 - p.x : p.x) * vw * s, y: oy + p.y * vh * s });
  dibujarPrenda(aPantalla);
}

const PARES = { hombros: [11, 12], cadera: [23, 24], rodillas: [25, 26], tobillos: [27, 28] };
const visible = (p) => p && p.v > 0.5;
const distancia2 = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const mezclar = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const suave = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Linea del cuerpo en pantalla (izquierda -> derecha), o null si no se ve. */
function linea(pose, nombre, aPantalla) {
  const [i, j] = PARES[nombre];
  if (!(visible(pose[i]) && visible(pose[j]))) return null;
  let a = aPantalla(pose[i]), b = aPantalla(pose[j]);
  if (a.x > b.x) [a, b] = [b, a];
  const largo = distancia2(a, b);
  if (largo < 6) return null;
  return { c: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dir: { x: (b.x - a.x) / largo, y: (b.y - a.y) / largo }, largo };
}

/** Brazos en pantalla (hombro, codo, muneca), separados por lado de la pantalla. */
function brazos(pose, aPantalla) {
  const lista = [[11, 13, 15], [12, 14, 16]]
    .filter((ids) => ids.every((i) => visible(pose[i])))
    .map(([h, c, m]) => {
      const b = { h: aPantalla(pose[h]), c: aPantalla(pose[c]), m: aPantalla(pose[m]) };
      // Angulo del codo: con el brazo muy doblado la manga de la foto no puede seguirlo bien.
      const ax = b.h.x - b.c.x, ay = b.h.y - b.c.y, bx = b.m.x - b.c.x, by = b.m.y - b.c.y;
      const coseno = (ax * bx + ay * by) / ((Math.hypot(ax, ay) * Math.hypot(bx, by)) || 1);
      b.recto = coseno < Math.cos((115 * Math.PI) / 180);
      return b;
    });
  const r = { izq: null, der: null };
  const hx = (pose[11].x + pose[12].x) / 2;
  for (const b of lista) {
    const centro = aPantalla({ x: hx, y: 0 }).x;
    if (b.h.x < centro) r.izq = b; else r.der = b;
  }
  return r;
}

/** Punto a una fraccion del recorrido hombro -> codo -> muneca, con su direccion. */
function sobreBrazo(inicio, brazo, fraccion) {
  const l1 = distancia2(inicio, brazo.c), l2 = distancia2(brazo.c, brazo.m);
  const d = fraccion * (l1 + l2);
  const [a, b, t] = d <= l1 ? [inicio, brazo.c, d / (l1 || 1)] : [brazo.c, brazo.m, (d - l1) / (l2 || 1)];
  const largo = distancia2(a, b) || 1;
  return { p: mezclar(a, b, t), dir: { x: (b.x - a.x) / largo, y: (b.y - a.y) / largo } };
}

/** Dibuja un triangulo de la foto con una transformacion afin (textura en canvas 2D). */
function triangulo(g, img, s0, s1, s2, d0, d1, d2) {
  const den = (s1.x - s0.x) * (s2.y - s0.y) - (s2.x - s0.x) * (s1.y - s0.y);
  if (!den) return;
  const a = ((d1.x - d0.x) * (s2.y - s0.y) - (d2.x - d0.x) * (s1.y - s0.y)) / den;
  const b = ((d1.y - d0.y) * (s2.y - s0.y) - (d2.y - d0.y) * (s1.y - s0.y)) / den;
  const c = ((d2.x - d0.x) * (s1.x - s0.x) - (d1.x - d0.x) * (s2.x - s0.x)) / den;
  const dd = ((d2.y - d0.y) * (s1.x - s0.x) - (d1.y - d0.y) * (s2.x - s0.x)) / den;
  const e = d0.x - a * s0.x - c * s0.y, f = d0.y - b * s0.x - dd * s0.y;
  // Recorte levemente agrandado para que no se vean las uniones entre triangulos.
  const cx = (d0.x + d1.x + d2.x) / 3, cy = (d0.y + d1.y + d2.y) / 3;
  const crecer = (p) => { const dx = p.x - cx, dy = p.y - cy, l = Math.hypot(dx, dy) || 1; return { x: p.x + (dx / l) * 2, y: p.y + (dy / l) * 2 }; };
  const p0 = crecer(d0), p1 = crecer(d1), p2 = crecer(d2);
  g.save();
  g.beginPath(); g.moveTo(p0.x, p0.y); g.lineTo(p1.x, p1.y); g.lineTo(p2.x, p2.y); g.closePath();
  g.clip();
  g.transform(a, b, c, dd, e, f);
  g.drawImage(img, 0, 0);
  g.restore();
}

/* Capas de la PC: la prenda se arma aparte para copiarle los pliegues del video. */
const capa = document.createElement('canvas');
const sombreado = document.createElement('canvas');
const mascara = document.createElement('canvas');
function limpiarCapas() {
  for (const c of [capa, mascara]) {
    if (c.width !== lienzo.width || c.height !== lienzo.height) { c.width = lienzo.width; c.height = lienzo.height; }
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
  }
}

/**
 * Pliegues y sombras reales: el video del torso en grises, normalizado a gris
 * medio, se mezcla con "luz suave" solo dentro de la prenda. Un gris medio no
 * cambia nada; las sombras de la ropa real oscurecen y los brillos aclaran.
 */
/** Rectangulo entero dentro del lienzo, o null si queda fuera. */
function recuadro(caja, margen) {
  const x = Math.max(0, Math.floor(caja.x0 - margen)), y = Math.max(0, Math.floor(caja.y0 - margen));
  const x1 = Math.min(lienzo.width, Math.ceil(caja.x1 + margen)), y1 = Math.min(lienzo.height, Math.ceil(caja.y1 + margen));
  return x1 > x && y1 > y ? { x, y, w: x1 - x, h: y1 - y } : null;
}

function efectosLuz(r) {
  const g = capa.getContext('2d');
  const norma = Math.min(4, Math.max(0.5, 128 / (est.luzTorso || 128)));
  g.save();
  g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
  g.globalCompositeOperation = 'soft-light';
  g.globalAlpha = 0.35;
  // Desenfocado: se copian las sombras y pliegues grandes, no los estampados de la ropa real.
  const desenfoque = Math.max(2, (est.ref || 100) * 0.03);
  g.filter = 'grayscale(1) blur(' + desenfoque.toFixed(1) + 'px) brightness(' + norma.toFixed(2) + ') contrast(1.3)';
  pintarVideo(g);
  g.restore();
  if (est.tinte) {
    g.save();
    g.globalCompositeOperation = 'multiply';
    g.globalAlpha = 0.45;
    g.fillStyle = 'rgb(' + est.tinte.join(',') + ')';
    g.fillRect(r.x, r.y, r.w, r.h);
    g.restore();
  }
}

/**
 * La foto de producto trae el interior del cuello (maniqui) y tapa la barbilla:
 * se vuelve a pintar el video real sobre la cara y el cuello.
 */
const cabeza = document.createElement('canvas');
/**
 * Vuelve a pintar el video real dentro de una forma (cara, cuello, manos), con
 * el borde difuminado, sobre la prenda ya dibujada. Solo trabaja en el recuadro r.
 */
function repintarVideo(r, desenfoque, trazar) {
  if (!r) return;
  if (cabeza.width !== lienzo.width || cabeza.height !== lienzo.height) {
    cabeza.width = lienzo.width; cabeza.height = lienzo.height;
  }
  const g = cabeza.getContext('2d');
  g.clearRect(r.x, r.y, r.w, r.h);
  g.save();
  g.filter = 'blur(' + Math.max(1.5, desenfoque).toFixed(1) + 'px)';
  g.fillStyle = '#000';
  trazar(g);
  g.restore();
  g.save();
  g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
  g.globalCompositeOperation = 'source-in';
  pintarVideo(g);
  g.restore();
  ctx.drawImage(cabeza, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
}

function destaparCabeza(pose, aPantalla, hombros) {
  if (!visible(pose[0])) return;
  const nariz = aPantalla(pose[0]);
  const ancho = visible(pose[7]) && visible(pose[8])
    ? distancia2(aPantalla(pose[7]), aPantalla(pose[8]))
    : hombros.largo * 0.45;
  const eje = { x: hombros.c.x - nariz.x, y: hombros.c.y - nariz.y };
  const largoEje = Math.hypot(eje.x, eje.y) || 1;
  const abajo = { x: eje.x / largoEje, y: eje.y / largoEje };
  const lado = { x: -abajo.y, y: abajo.x };
  const en = (p, a, l) => ({ x: p.x + abajo.x * a + lado.x * l, y: p.y + abajo.y * a + lado.y * l });
  // Cuello: desde la barbilla hasta el escote (un poco por encima de los hombros).
  const barbilla = en(nariz, ancho * 0.45, 0);
  const escote = en(hombros.c, -largoEje * 0.3, 0);
  const giro = Math.atan2(abajo.y, abajo.x) - Math.PI / 2;
  const cara = en(nariz, -ancho * 0.12, 0);
  const radio = Math.max(ancho * 1.1, largoEje * 0.4);
  const r = recuadro({
    x0: Math.min(cara.x, escote.x) - radio, y0: Math.min(cara.y, escote.y) - radio,
    x1: Math.max(cara.x, escote.x) + radio, y1: Math.max(cara.y, escote.y) + radio,
  }, 0);
  repintarVideo(r, ancho * 0.06, (g) => {
    g.beginPath();
    const a1 = en(barbilla, 0, ancho * 0.3), a2 = en(escote, 0, ancho * 0.24);
    const a3 = en(escote, 0, -ancho * 0.24), a4 = en(barbilla, 0, -ancho * 0.3);
    g.moveTo(a1.x, a1.y); g.lineTo(a2.x, a2.y);
    // El borde inferior del cuello es curvo, como un escote redondo.
    const curva = en(escote, ancho * 0.12, 0);
    g.quadraticCurveTo(curva.x, curva.y, a3.x, a3.y);
    g.lineTo(a4.x, a4.y); g.closePath(); g.fill();
    g.beginPath();
    g.ellipse(cara.x, cara.y, ancho * 0.6, ancho * 0.88, giro, 0, Math.PI * 2);
    g.fill();
  });
}

/**
 * Manos por delante de la prenda: elipse desde la muneca hacia los dedos
 * (indice y menique), repintada con el video real.
 */
function destaparManos(pose, aPantalla) {
  for (const [muneca, menique, indice, pulgar] of [[15, 17, 19, 21], [16, 18, 20, 22]]) {
    if (!(visible(pose[muneca]) && visible(pose[indice]))) continue;
    const m = aPantalla(pose[muneca]), i = aPantalla(pose[indice]);
    const me = visible(pose[menique]) ? aPantalla(pose[menique]) : i;
    const pu = visible(pose[pulgar]) ? aPantalla(pose[pulgar]) : i;
    const punta = mezclar(i, me, 0.5);
    const largo = distancia2(m, punta);
    if (largo < 4) continue;
    // Los puntos de MediaPipe quedan en los nudillos: la mano sigue un poco mas alla.
    const centro = mezclar(m, punta, 0.6);
    const ancho = Math.max(largo * 0.55, distancia2(i, me) * 0.8, distancia2(pu, me) * 0.55);
    const radio = Math.max(largo, ancho) * 1.3;
    const r = recuadro({ x0: centro.x - radio, y0: centro.y - radio, x1: centro.x + radio, y1: centro.y + radio }, 0);
    const giro = Math.atan2(punta.y - m.y, punta.x - m.x);
    repintarVideo(r, largo * 0.12, (g) => {
      g.beginPath();
      g.ellipse(centro.x, centro.y, largo * 0.95, ancho, giro, 0, Math.PI * 2);
      g.fill();
    });
  }
}

/** Silueta de la persona (segmentacion de MediaPipe) consultada en coordenadas de pantalla. */
function enPersona(x, y) {
  const m = est.mascara, v = est.vista;
  if (!m || !v) return true;
  let xn = (x - v.ox) / (v.vw * v.s);
  const yn = (y - v.oy) / (v.vh * v.s);
  if (est.frontal) xn = 1 - xn;
  if (xn < 0 || xn >= 1 || yn < 0 || yn >= 1) return false;
  return m.datos[Math.floor(yn * m.alto) * m.ancho + Math.floor(xn * m.ancho)] > 0.5;
}

function distanciaASegmento(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
  const t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}

/**
 * Cuanto se extiende el cuerpo a cada lado de c sobre la direccion dir, sin
 * contar los brazos (capsulas alrededor de brazo y antebrazo).
 */
function medirCuerpo(c, dir, maximo, capsulas) {
  const paso = Math.max(2, maximo / 40);
  const lado = (signo) => {
    let d = 0, fuera = 0, ultimo = 0;
    while (d < maximo) {
      d += paso;
      const p = { x: c.x + dir.x * d * signo, y: c.y + dir.y * d * signo };
      if (capsulas.some((k) => distanciaASegmento(p, k.a, k.b) < k.r)) break;
      if (enPersona(p.x, p.y)) { ultimo = d; fuera = 0; } else if (++fuera > 2) break;
    }
    return ultimo;
  };
  return { izq: lado(-1), der: lado(1) };
}

/* Profundidad del torso respecto de su ancho (seccion eliptica del cuerpo). */
const PROFUNDIDAD = 0.62;
/* Cuanto del contorno del cilindro cubre el frente de la prenda (radianes, hasta las costuras). */
const ARCO = (Math.PI / 2) * 0.95;

function dibujarPrenda(aPantalla) {
  const ajuste = AJUSTE[est.tipo] || AJUSTE.superior;
  const pose = est.pose;
  const l1 = pose && linea(pose, ajuste.linea1, aPantalla);
  if (!pose || !l1) {
    fijarEstado(pose ? 'sin_cadera' : 'sin_persona');
    return;
  }
  const nariz = pose[0];
  const cerca = ajuste.linea1 === 'hombros' &&
    (!(nariz.v > 0.5 && nariz.y > 0.03) || l1.largo > lienzo.width * 0.55);
  const segunda = linea(pose, ajuste.linea2, aPantalla) ||
    (ajuste.linea2 === 'rodillas' && linea(pose, 'tobillos', aPantalla));
  fijarEstado(cerca ? 'cerca' : segunda ? 'ok' : 'parcial');
  if (!est.prenda) return;
  const hombrosReales = { c: { ...l1.c }, largo: l1.largo };

  /*
   * Giro del cuerpo (psi > 0: el lado derecho de la pantalla se aleja). Sale de
   * la profundidad 3D de los hombros; con el giro, el ancho 2D de los hombros se
   * achica por cos(psi), asi que se recupera el ancho frontal dividiendo.
   */
  const psi = est.giro || 0;
  const cosG = Math.cos(psi), sinG = Math.sin(psi), cosSeguro = Math.max(0.35, cosG);

  // Perpendicular hacia abajo de la linea: (-dir.y, dir.x).
  l1.c = { x: l1.c.x + l1.dir.y * ajuste.subir * l1.largo, y: l1.c.y - l1.dir.x * ajuste.subir * l1.largo };

  const img = est.prenda.imagen, gw = img.width, gh = img.height;
  const medida = est.prenda.medidas[est.tipo];
  // Ancho frontal de la foto en pantalla: su franja de hombros o cintura = ancho del cuerpo.
  const w1 = ((medida ? (l1.largo * ajuste.cuerpo) / medida : l1.largo * ajuste.ancho) * est.escala) / cosSeguro;
  const v1 = ajuste.v1;
  let v2 = ajuste.v2;
  // Short o falda (foto ancha): las rodillas quedan por debajo de la prenda.
  if (est.tipo === 'inferior' && gh / gw < 1.3) v2 = 1.15;

  let l2 = linea(pose, ajuste.linea2, aPantalla);
  if (!l2 && ajuste.linea2 === 'rodillas') {
    const tobillos = linea(pose, 'tobillos', aPantalla);
    if (tobillos) { l2 = tobillos; v2 = v1 + (v2 - v1) * 2; }
  }
  let w2 = w1;
  if (l2 && ajuste.linea2 === 'cadera') {
    // Si la persona gira, cadera y hombros se angostan juntos: se conserva la forma.
    w2 = w1 * Math.min(1.15, Math.max(0.85, l2.largo / l1.largo / 0.72));
  } else if (!l2) {
    // Sin la segunda linea visible: el torso conserva la proporcion de la foto.
    const alto = w1 * (gh / gw) * (v2 - v1);
    l2 = { c: { x: l1.c.x - l1.dir.y * alto, y: l1.c.y + l1.dir.x * alto }, dir: l1.dir };
  }

  const ref = l1.largo;
  est.ref = ref;
  const desp = { x: est.dx * ref, y: est.dy * ref };
  /** Centro, direccion lateral y ancho frontal de la prenda a la altura v. */
  const fila = (v) => {
    const t = (v - v1) / (v2 - v1);
    let dx = l1.dir.x + (l2.dir.x - l1.dir.x) * t, dy = l1.dir.y + (l2.dir.y - l1.dir.y) * t;
    const l = Math.hypot(dx, dy) || 1;
    dx /= l; dy /= l;
    return {
      c: { x: l1.c.x + (l2.c.x - l1.c.x) * t, y: l1.c.y + (l2.c.y - l1.c.y) * t },
      dir: { x: dx, y: dy },
      w: w1 + (w2 - w1) * t,
    };
  };

  const brazosVisibles = brazos(pose, aPantalla);
  const mangas = est.tipo === 'superior' && !cerca
    ? { izq: brazosVisibles.izq && brazosVisibles.izq.recto ? brazosVisibles.izq : null,
        der: brazosVisibles.der && brazosVisibles.der.recto ? brazosVisibles.der : null }
    : null;
  /*
   * De frente la prenda queda plana, como la foto; la envoltura en cilindro solo
   * entra cuando la persona realmente gira (desde ~15 grados, completa a ~45).
   */
  const giroEfectivo = suave(0.26, 0.8, Math.abs(psi));
  // Mitad del ancho entre hombros (en fraccion de la foto) y mitad del torso de la prenda.
  const hombroU = 0.5 * Math.min(0.9, l1.largo / (w1 * cosSeguro));
  const torsoU = hombroU * 1.08;
  // En prendas superiores el cilindro es el torso; mangas y resto cuelgan de sus costados.
  const mitadCilindro = est.tipo === 'superior' ? torsoU : 0.5;
  const escalaPx = (w1 * Math.max(cosSeguro, 0.75)) / gw;
  const { C, F } = MALLA;

  /*
   * Talla segun quien posa: se mide el ancho real del pecho y la cintura con la
   * silueta (sin brazos) y se aplica UN factor para toda la prenda, limitado a
   * +-10%. Asi se adapta a personas delgadas o robustas sin deformar la prenda.
   */
  if (!est.filasAjuste || est.filasAjuste.length !== F + 1)
    est.filasAjuste = Array.from({ length: F + 1 }, () => ({ k: 1, desvio: 0 }));
  const filasAjuste = est.filasAjuste;
  if (est.mascara) {
    const capsulas = [];
    for (const b of [brazosVisibles.izq, brazosVisibles.der]) {
      if (!b) continue;
      capsulas.push({ a: mezclar(b.h, b.c, 0.35), b: b.c, r: l1.largo * 0.14 });
      // El antebrazo se prolonga hasta la mano, que suele estar pegada a la cadera.
      capsulas.push({ a: b.c, b: { x: b.m.x + (b.m.x - b.c.x) * 0.45, y: b.m.y + (b.m.y - b.c.y) * 0.45 }, r: l1.largo * 0.13 });
    }
    const vMin = v1 + 0.12;
    const vMax = est.tipo === 'inferior' ? v1 + 0.18 : Math.min(v2, v1 + 0.45);
    const elipse = Math.sqrt(cosG * cosG + PROFUNDIDAD * PROFUNDIDAD * sinG * sinG);
    const medidas = [];
    for (let j = 0; j <= F; j++) {
      const v = j / F;
      medidas.push(null);
      if (v < vMin || v > vMax) continue;
      const f = fila(v);
      const esperado = mitadCilindro * f.w * elipse;
      if (!enPersona(f.c.x, f.c.y)) continue;
      const m = medirCuerpo(f.c, f.dir, esperado * 1.8, capsulas);
      const mitad = (m.izq + m.der) / 2;
      if (mitad < esperado * 0.4) continue;
      medidas[j] = {
        k: Math.min(1.4, Math.max(0.75, (mitad * 1.06) / esperado)),
        desvio: Math.max(-0.3, Math.min(0.3, (m.der - m.izq) / 2 / (esperado || 1))),
      };
    }
    const validas = medidas.filter(Boolean).map((m) => m.k).sort((a, b) => a - b);
    if (validas.length) {
      const talla = Math.min(1.1, Math.max(0.9, validas[validas.length >> 1]));
      for (const fa of filasAjuste) {
        fa.k += (talla - fa.k) * 0.08;
        fa.desvio = 0;
      }
    }
  }

  /*
   * Envoltura cilindrica: el frente de la prenda rodea una seccion eliptica del
   * torso (ancho A, profundidad B). Un punto en el angulo t se ve en
   * x = A sin t cos psi + B cos t sin psi. Lo que queda detras se pliega en el
   * borde de la silueta. Lo que esta fuera del cilindro (mangas colgando) sigue
   * al costado, comprimido por el giro.
   */
  const lateral = (uc, A, anchoFila) => {
    const plana = uc * (A / mitadCilindro) * cosSeguro;
    if (giroEfectivo <= 0) return plana;
    const B = A * PROFUNDIDAD;
    const enCilindro = (t) => A * Math.sin(t) * cosG + B * Math.cos(t) * sinG;
    let cilindro;
    if (Math.abs(uc) <= mitadCilindro) cilindro = enCilindro((uc / mitadCilindro) * ARCO);
    else {
      const signo = Math.sign(uc);
      cilindro = enCilindro(signo * ARCO) + signo * (Math.abs(uc) - mitadCilindro) * anchoFila * cosSeguro;
    }
    return plana + (cilindro - plana) * giroEfectivo;
  };
  /** Luz segun la normal de la superficie: frente iluminado, costados en sombra. */
  const luz = (uc) => {
    // Fuera del cilindro (mangas colgando) se mantiene la luz del borde: sin saltos.
    const t = (Math.max(-mitadCilindro, Math.min(mitadCilindro, uc)) / mitadCilindro) * ARCO;
    const nx = Math.sin(t), nz = Math.cos(t) / PROFUNDIDAD;
    const hacia = (-nx * sinG + nz * cosG) / Math.hypot(nx, nz);
    const base = 0.74 + 0.26 * Math.pow(Math.max(0, hacia), 0.5);
    // De frente el volumen es sutil; al girar se marca mas el lado en sombra.
    return 1 - (1 - base) * (0.45 + 0.55 * giroEfectivo);
  };

  /** Fila completa de la malla: posiciones en pantalla ya plegadas. */
  const filaMalla = (us, v, j) => {
    const f = fila(v);
    const a = filasAjuste[Math.min(F, Math.max(0, j))];
    const k = a.k;
    const A = mitadCilindro * f.w * k;
    const centro = { x: f.c.x + f.dir.x * a.desvio * A + desp.x, y: f.c.y + f.dir.y * a.desvio * A + desp.y };
    const xs = us.map((u) => lateral(u - 0.5, A, f.w));
    // Lo que gira hacia atras queda oculto: se pliega en el borde visible.
    let iMin = 0, iMax = 0;
    xs.forEach((x, i) => { if (x < xs[iMin]) iMin = i; if (x > xs[iMax]) iMax = i; });
    for (let i = 0; i < iMin; i++) xs[i] = xs[iMin];
    for (let i = iMax + 1; i < xs.length; i++) xs[i] = xs[iMax];
    return xs.map((x) => ({ x: centro.x + f.dir.x * x, y: centro.y + f.dir.y * x }));
  };

  /*
   * Mangas (solo prendas superiores): en la foto cuelgan rectas desde el hombro.
   * Cada vertice de la manga se expresa sobre ese "hueso en reposo" (avance y
   * distancia lateral) y se recoloca sobre el brazo real hombro -> codo -> muneca.
   */
  const enManga = (u, v, base, brazo) => {
    const peso = suave(v1 - 0.02, v1 + 0.14, v);
    if (peso <= 0) return base;
    const signo = u < 0.5 ? -1 : 1;
    const hombroFoto = { x: (0.5 + signo * hombroU) * gw, y: v1 * gh };
    const punoFoto = { x: (0.5 + signo * (0.5 + torsoU) / 2) * gw, y: 0.97 * gh };
    const bx = punoFoto.x - hombroFoto.x, by = punoFoto.y - hombroFoto.y;
    const bl = Math.hypot(bx, by) || 1;
    const qx = u * gw - hombroFoto.x, qy = v * gh - hombroFoto.y;
    const avance = Math.min(1, Math.max(0, (qx * bx + qy * by) / (bl * bl)));
    const lateralManga = (bx * qy - by * qx) / bl;
    const sobre = sobreBrazo(brazo.h, brazo, avance);
    const enBrazo = {
      x: sobre.p.x - sobre.dir.y * lateralManga * escalaPx,
      y: sobre.p.y + sobre.dir.x * lateralManga * escalaPx,
    };
    return mezclar(base, enBrazo, peso);
  };

  limpiarCapas();
  const g = capa.getContext('2d');
  const caja = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const franjas = [];
  /** Dibuja la parte de la foto entre u0 y u1 como una malla propia. */
  const malla = (u0, u1, brazo, columnas, vMax = 1) => {
    const destino = [], origen = [];
    const us = Array.from({ length: columnas + 1 }, (_, i) => u0 + ((u1 - u0) * i) / columnas);
    for (let j = 0; j <= F; j++) {
      const v = (j / F) * vMax;
      const filaPts = filaMalla(us, v, Math.round(v * F));
      filaPts.forEach((p, i) => {
        const d = brazo ? enManga(us[i], v, p, brazo) : p;
        caja.x0 = Math.min(caja.x0, d.x); caja.y0 = Math.min(caja.y0, d.y);
        caja.x1 = Math.max(caja.x1, d.x); caja.y1 = Math.max(caja.y1, d.y);
        destino.push(d);
        origen.push({ x: us[i] * gw, y: v * gh });
      });
    }
    for (let j = 0; j < F; j++)
      for (let i = 0; i < columnas; i++) {
        const k = j * (columnas + 1) + i, k2 = k + columnas + 1;
        triangulo(g, img, origen[k], origen[k + 1], origen[k2], destino[k], destino[k + 1], destino[k2]);
        triangulo(g, img, origen[k + 1], origen[k2 + 1], origen[k2], destino[k + 1], destino[k2 + 1], destino[k2]);
      }
    // Bandas horizontales para el sombreado de volumen (solo partes que siguen al torso).
    if (!brazo && vMax === 1) {
      const luces = us.map((u) => luz(u - 0.5));
      for (let j = 0; j < F; j++) {
        const arriba = destino.slice(j * (columnas + 1), (j + 1) * (columnas + 1));
        const abajo = destino.slice((j + 1) * (columnas + 1), (j + 2) * (columnas + 1));
        franjas.push({ arriba, abajo, luces });
      }
    }
  };
  const corte = 0.5 - torsoU;
  const izq = mangas && mangas.izq, der = mangas && mangas.der;
  if (!izq && !der) {
    malla(0, 1, null, C);
  } else {
    // Torso y cada manga por separado; una manga sin brazo visible queda con el torso.
    malla(izq ? corte : 0, der ? 1 - corte : 1, null, C);
    // Relleno de axila: un poco de manga pegada al torso, solo en la parte alta.
    const solape = 0.07, axila = v1 + 0.5;
    if (izq) malla(Math.max(0, corte - solape), corte, null, 2, axila);
    if (der) malla(1 - corte, Math.min(1, 1 - corte + solape), null, 2, axila);
    if (izq) malla(0, corte, izq, 3);
    if (der) malla(1 - corte, 1, der, 3);
  }

  const r = recuadro(caja, 4);
  if (!r) return;
  // Copia de la forma de la prenda: todos los efectos se recortan a ella al final.
  mascara.getContext('2d').drawImage(capa, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
  /*
   * Volumen: los costados del cilindro reciben menos luz que el frente. Cada
   * banda lleva un degradado continuo a lo ancho; se pintan en una capa aparte
   * (sin mezclar entre si) y esa capa se multiplica una sola vez sobre la prenda.
   */
  const gs = sombreado.getContext('2d');
  if (sombreado.width !== lienzo.width || sombreado.height !== lienzo.height) {
    sombreado.width = lienzo.width; sombreado.height = lienzo.height;
  }
  gs.save();
  gs.fillStyle = '#fff';
  gs.fillRect(r.x, r.y, r.w, r.h);
  for (const { arriba, abajo, luces } of franjas) {
    const medio = arriba.map((p, i) => mezclar(p, abajo[i], 0.5));
    const a = medio[0], b = medio[medio.length - 1];
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    if (l2 < 1) continue;
    const grad = gs.createLinearGradient(a.x, a.y, b.x, b.y);
    let ultimo = 0;
    medio.forEach((p, i) => {
      const t = Math.min(1, Math.max(ultimo, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
      ultimo = t;
      const n = Math.round(255 * luces[i]);
      grad.addColorStop(t, 'rgb(' + n + ',' + n + ',' + n + ')');
    });
    gs.fillStyle = grad;
    gs.strokeStyle = grad;
    gs.lineWidth = 2;
    gs.beginPath();
    arriba.forEach((p, i) => (i ? gs.lineTo(p.x, p.y) : gs.moveTo(p.x, p.y)));
    for (let i = abajo.length - 1; i >= 0; i--) gs.lineTo(abajo[i].x, abajo[i].y);
    gs.closePath();
    gs.fill();
    gs.stroke();
  }
  gs.restore();
  g.save();
  g.globalCompositeOperation = 'multiply';
  g.drawImage(sombreado, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
  g.restore();
  if (EN_PC) {
    try { efectosLuz(r); } catch (e) { /* navegador sin mezclas: sin pliegues */ }
  }
  g.save();
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(mascara, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
  g.restore();

  ctx.save();
  const brillo = est.brillo < 0.98 || est.brillo > 1.02 ? 'brightness(' + est.brillo.toFixed(2) + ') ' : '';
  // Un poco mas de contraste y color: la foto de estudio suele verse lavada en la camara.
  ctx.filter = brillo + 'contrast(1.1) saturate(1.12)';
  if (EN_PC) {
    // Sombra suave sobre el cuerpo: la prenda deja de verse "pegada" encima.
    ctx.shadowColor = 'rgba(0,0,0,0.22)';
    ctx.shadowBlur = Math.max(3, ref * 0.035);
    ctx.shadowOffsetY = Math.max(1, ref * 0.015);
  }
  ctx.drawImage(capa, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
  ctx.restore();

  if (ajuste.linea1 === 'hombros') destaparCabeza(pose, aPantalla, hombrosReales);
  destaparManos(pose, aPantalla);
}

/* ---------- gestos: arrastrar y pellizcar ---------- */

let toque = null;
const dist2 = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
lienzo.addEventListener('touchstart', (e) => {
  const t = e.touches;
  toque = t.length >= 2
    ? { modo: 'pellizco', d: dist2(t), escala: est.escala }
    : { modo: 'mover', x: t[0].clientX, y: t[0].clientY, dx: est.dx, dy: est.dy };
}, { passive: true });
lienzo.addEventListener('touchmove', (e) => {
  const t = e.touches;
  if (!toque) return;
  if (t.length >= 2) {
    if (toque.modo !== 'pellizco') toque = { modo: 'pellizco', d: dist2(t), escala: est.escala };
    est.escala = Math.min(2.5, Math.max(0.4, toque.escala * (dist2(t) / toque.d)));
  } else if (toque.modo === 'mover') {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const ref = est.ref / dpr;
    est.dx = toque.dx + (t[0].clientX - toque.x) / ref;
    est.dy = toque.dy + (t[0].clientY - toque.y) / ref;
  }
}, { passive: true });
lienzo.addEventListener('touchend', (e) => { if (e.touches.length === 0) toque = null; }, { passive: true });
// En la PC: arrastrar con el mouse y la rueda para el tamano.
let raton = null;
lienzo.addEventListener('mousedown', (e) => { raton = { x: e.clientX, y: e.clientY, dx: est.dx, dy: est.dy }; });
window.addEventListener('mouseup', () => { raton = null; });
lienzo.addEventListener('mousemove', (e) => {
  if (!raton) return;
  const ref = est.ref / Math.min(window.devicePixelRatio || 1, 2);
  est.dx = raton.dx + (e.clientX - raton.x) / ref;
  est.dy = raton.dy + (e.clientY - raton.y) / ref;
});
lienzo.addEventListener('wheel', (e) => {
  e.preventDefault();
  est.escala = Math.min(2.5, Math.max(0.4, est.escala * (e.deltaY < 0 ? 1.05 : 0.95)));
}, { passive: false });

/* ---------- API para React Native ---------- */

window.probador = {
  async fijarPrenda(src) {
    try {
      est.prenda = await prepararPrenda(src);
    } catch (e) {
      enviar('error', { codigo: 'prenda', detalle: String((e && e.message) || e) });
    }
  },
  fijarTipo(tipo) { est.tipo = tipo; },
  cambiarCamara() {
    est.frontal = !est.frontal; est.pose = null; est.filtros = null; est.giro = 0; est.filasAjuste = null;
    iniciarCamara();
  },
  reiniciar() { est.escala = 1; est.dx = 0; est.dy = 0; },
  capturar() {
    try {
      const compuesta = lienzo.toDataURL('image/jpeg', 0.88);
      // Foto sin la prenda, tal como se ve, para el probador con IA.
      const vw = video.videoWidth, vh = video.videoHeight;
      const k = Math.min(1, 1024 / Math.max(vw, vh));
      const c = document.createElement('canvas');
      c.width = Math.round(vw * k); c.height = Math.round(vh * k);
      const g = c.getContext('2d');
      if (est.frontal) { g.translate(c.width, 0); g.scale(-1, 1); }
      g.drawImage(video, 0, 0, c.width, c.height);
      enviar('captura', { compuesta, original: c.toDataURL('image/jpeg', 0.85) });
    } catch (e) {
      enviar('error', { codigo: 'captura', detalle: String((e && e.message) || e) });
    }
  },
  detener() { if (est.stream) est.stream.getTracks().forEach((t) => t.stop()); },
};

fijarEstado('cargando');
requestAnimationFrame(dibujar);
enviar('listo');
iniciarCamara();
iniciarDetector();
</script>
</body>
</html>`;
}
