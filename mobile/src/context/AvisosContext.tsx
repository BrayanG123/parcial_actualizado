/**
 * Avisos breves (confirmaciones y errores) sobre el contenido.
 * Usa la API Animated de React Native: no se agrega ninguna libreria de
 * animacion para un fundido de 180 ms.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colores, esp, radio, sombra, texto } from '../theme';

type TipoAviso = 'exito' | 'error' | 'info';

interface Aviso {
  texto: string;
  tipo: TipoAviso;
}

interface ValorAvisos {
  avisar: (texto: string, tipo?: TipoAviso) => void;
  avisarError: (error: unknown) => void;
}

const Contexto = createContext<ValorAvisos | null>(null);

const FONDOS: Record<TipoAviso, string> = {
  exito: colores.exito,
  error: colores.error,
  info: colores.tinta,
};

export function ProveedorAvisos({ children }: { children: ReactNode }) {
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const opacidad = useRef(new Animated.Value(0)).current;
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const ocultar = useCallback(() => {
    Animated.timing(opacidad, { toValue: 0, duration: 180, useNativeDriver: true }).start(() =>
      setAviso(null),
    );
  }, [opacidad]);

  const avisar = useCallback(
    (textoAviso: string, tipo: TipoAviso = 'exito') => {
      if (temporizador.current) clearTimeout(temporizador.current);
      setAviso({ texto: textoAviso, tipo });
      Animated.timing(opacidad, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      temporizador.current = setTimeout(ocultar, 2600);
    },
    [ocultar, opacidad],
  );

  const avisarError = useCallback(
    (error: unknown) => {
      const mensaje =
        error instanceof Error && error.message
          ? error.message
          : 'No pudimos completar la operacion.';
      avisar(mensaje, 'error');
    },
    [avisar],
  );

  useEffect(
    () => () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    },
    [],
  );

  const valor = useMemo(() => ({ avisar, avisarError }), [avisar, avisarError]);

  return (
    <Contexto.Provider value={valor}>
      {children}
      {aviso ? (
        <Animated.View
          pointerEvents="none"
          style={[
            estilos.contenedor,
            sombra.m,
            { opacity: opacidad, backgroundColor: FONDOS[aviso.tipo], bottom: insets.bottom + 78 },
          ]}
        >
          <Text style={estilos.texto}>{aviso.texto}</Text>
        </Animated.View>
      ) : null}
    </Contexto.Provider>
  );
}

export function useAvisos(): ValorAvisos {
  const valor = useContext(Contexto);
  if (!valor) throw new Error('useAvisos debe usarse dentro de ProveedorAvisos.');
  return valor;
}

const estilos = StyleSheet.create({
  contenedor: {
    position: 'absolute',
    left: esp.l,
    right: esp.l,
    paddingVertical: esp.m,
    paddingHorizontal: esp.l,
    borderRadius: radio.m,
  },
  texto: { ...texto.cuerpo, color: colores.blanco, fontWeight: '500' },
});
