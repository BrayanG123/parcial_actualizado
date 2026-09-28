/**
 * Identidad visual FashionStore para movil.
 * Los colores replican los tokens del frontend web (src/styles/tokens.css)
 * para que ambas aplicaciones se vean como el mismo producto.
 */
import { Platform } from 'react-native';

export const colores = {
  crema: '#faf7f3',
  crema2: '#f2ece5',
  blanco: '#ffffff',
  tinta: '#1c1b1a',
  tinta2: '#4a4644',
  tinta3: '#7d7671',
  borde: '#e4dcd3',
  bordeFuerte: '#d3c7ba',

  acento: '#8c2f39',
  acentoOscuro: '#6f2129',
  acentoSuave: '#f7ecec',
  oro: '#b08344',

  exito: '#2f6b4f',
  exitoSuave: '#e8f2ec',
  alerta: '#9a6a10',
  alertaSuave: '#fbf1dd',
  error: '#a32d2d',
  errorSuave: '#fbeaea',
  info: '#2d5b8c',
  infoSuave: '#e9f0f8',

  overlay: 'rgba(28, 27, 26, 0.55)',
} as const;

/**
 * Tipografia sin dependencias: se usan las familias del sistema.
 * Cargar una fuente de marca (expo-font) agregaria peso de descarga y un
 * estado de carga extra que no aporta al MVP.
 */
export const fuentes = {
  texto: Platform.select({ ios: 'System', default: 'sans-serif' }) as string,
  titulo: Platform.select({ ios: 'Georgia', default: 'serif' }) as string,
  tituloMedio: Platform.select({ ios: 'Georgia', default: 'serif-medium' }) as string,
} as const;

export const esp = {
  xs: 4,
  s: 8,
  m: 12,
  l: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radio = {
  s: 6,
  m: 10,
  l: 16,
  pill: 999,
} as const;

export const sombra = {
  s: {
    shadowColor: colores.tinta,
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  m: {
    shadowColor: colores.tinta,
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
} as const;

export const texto = {
  display: { fontFamily: fuentes.titulo, fontSize: 26, lineHeight: 32, color: colores.tinta },
  titulo: { fontFamily: fuentes.titulo, fontSize: 20, lineHeight: 26, color: colores.tinta },
  subtitulo: { fontFamily: fuentes.texto, fontSize: 16, fontWeight: '600' as const, color: colores.tinta },
  cuerpo: { fontFamily: fuentes.texto, fontSize: 14, lineHeight: 20, color: colores.tinta2 },
  menor: { fontFamily: fuentes.texto, fontSize: 12, lineHeight: 17, color: colores.tinta3 },
  etiqueta: {
    fontFamily: fuentes.texto,
    fontSize: 11,
    letterSpacing: 0.8,
    fontWeight: '600' as const,
    color: colores.tinta3,
  },
} as const;

export const tema = { colores, fuentes, esp, radio, sombra, texto } as const;
