import { forwardRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colores, esp, radio, texto } from '../theme';

interface Props extends TextInputProps {
  etiqueta: string;
  error?: string;
  ayuda?: string;
  /** Muestra el ojo para revelar la contrasena. */
  secreto?: boolean;
}

export const Campo = forwardRef<TextInput, Props>(function Campo(
  { etiqueta, error, ayuda, secreto = false, style, ...props },
  ref,
) {
  const [enfocado, setEnfocado] = useState(false);
  const [visible, setVisible] = useState(false);

  return (
    <View style={estilos.grupo}>
      <Text style={estilos.etiqueta}>{etiqueta}</Text>
      <View
        style={[
          estilos.caja,
          enfocado && estilos.cajaEnfocada,
          Boolean(error) && estilos.cajaError,
        ]}
      >
        <TextInput
          ref={ref}
          style={[estilos.input, style]}
          placeholderTextColor={colores.tinta3}
          secureTextEntry={secreto && !visible}
          onFocus={(e) => {
            setEnfocado(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setEnfocado(false);
            props.onBlur?.(e);
          }}
          {...props}
        />
        {secreto ? (
          <Pressable
            onPress={() => setVisible((v) => !v)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={visible ? 'Ocultar contrasena' : 'Mostrar contrasena'}
          >
            <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={19} color={colores.tinta3} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text style={estilos.error}>{error}</Text>
      ) : ayuda ? (
        <Text style={estilos.ayuda}>{ayuda}</Text>
      ) : null}
    </View>
  );
});

const estilos = StyleSheet.create({
  grupo: { gap: 6 },
  etiqueta: { ...texto.etiqueta, textTransform: 'uppercase' },
  caja: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: esp.s,
    backgroundColor: colores.blanco,
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: radio.m,
    paddingHorizontal: esp.m,
    minHeight: 48,
  },
  cajaEnfocada: { borderColor: colores.acento },
  cajaError: { borderColor: colores.error },
  input: { flex: 1, ...texto.cuerpo, color: colores.tinta, paddingVertical: 12 },
  error: { ...texto.menor, color: colores.error },
  ayuda: { ...texto.menor },
});
