/**
 * Acceso: inicio de sesion y registro en una sola pantalla.
 * Se abre como modal cuando una accion exige sesion (carrito, reserva, compra)
 * y se cierra sola al terminar, devolviendo al cliente donde estaba.
 */
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Boton } from '../../components/Boton';
import { Campo } from '../../components/Campo';
import { AvisoEnLinea } from '../../components/Estados';
import { Pantalla } from '../../components/Pantalla';
import { useAvisos } from '../../context/AvisosContext';
import { useSesion } from '../../context/SesionContext';
import { USAR_MOCKS } from '../../api/http';
import { hayErrores, validarLogin, validarRegistro, type Errores } from '../../lib/validacion';
import type { PropsStack } from '../../navigation/tipos';
import { colores, esp, radio, texto } from '../../theme';

const CUENTA_DEMO = { email: 'cliente@fashionstore.bo', password: 'cliente123' };

export function PantallaAcceso({ navigation, route }: PropsStack<'Acceso'>) {
  const [modo, setModo] = useState<'login' | 'registro'>(route.params?.modo ?? 'login');
  const motivo = route.params?.motivo;

  return (
    <Pantalla bordes={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={estilos.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
          <Text style={estilos.marca}>FashionStore</Text>
          <Text style={estilos.subtitulo}>
            {modo === 'login' ? 'Ingresa a tu cuenta' : 'Crea tu cuenta de clienta'}
          </Text>

          {motivo ? <AvisoEnLinea texto={motivo} tipo="info" /> : null}

          <View style={estilos.conmutador}>
            <Opcion texto="Iniciar sesion" activo={modo === 'login'} onPress={() => setModo('login')} />
            <Opcion texto="Registrarme" activo={modo === 'registro'} onPress={() => setModo('registro')} />
          </View>

          {modo === 'login' ? (
            <FormularioLogin onListo={() => navigation.goBack()} />
          ) : (
            <FormularioRegistro onListo={() => navigation.goBack()} />
          )}

          <Pressable onPress={() => navigation.goBack()} style={estilos.omitir} accessibilityRole="button">
            <Text style={estilos.omitirTexto}>Seguir viendo el catalogo</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Pantalla>
  );
}

function Opcion({ texto: contenido, activo, onPress }: { texto: string; activo: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: activo }}
      style={[estilos.opcion, activo && estilos.opcionActiva]}
    >
      <Text style={[estilos.opcionTexto, activo && estilos.opcionTextoActivo]}>{contenido}</Text>
    </Pressable>
  );
}

function FormularioLogin({ onListo }: { onListo: () => void }) {
  const { iniciarSesion } = useSesion();
  const { avisar, avisarError } = useAvisos();
  const [datos, setDatos] = useState({ email: '', password: '' });
  const [errores, setErrores] = useState<Errores<typeof datos>>({});
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    if (enviando) return;
    const validacion = validarLogin(datos);
    setErrores(validacion);
    if (hayErrores(validacion)) return;

    setEnviando(true);
    try {
      const usuario = await iniciarSesion(datos);
      avisar(`Hola, ${usuario.nombre.split(' ')[0]}`);
      onListo();
    } catch (error) {
      avisarError(error);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <View style={estilos.formulario}>
      <Campo
        etiqueta="Correo"
        value={datos.email}
        onChangeText={(email) => setDatos((d) => ({ ...d, email }))}
        placeholder="tucorreo@ejemplo.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        error={errores.email}
      />
      <Campo
        etiqueta="Contrasena"
        value={datos.password}
        onChangeText={(password) => setDatos((d) => ({ ...d, password }))}
        placeholder="Tu contrasena"
        secreto
        autoCapitalize="none"
        error={errores.password}
      />
      <Boton titulo="Entrar" onPress={enviar} cargando={enviando} ancho />

      {USAR_MOCKS ? (
        <Pressable onPress={() => setDatos(CUENTA_DEMO)} accessibilityRole="button">
          <Text style={estilos.demo}>Usar la cuenta de prueba ({CUENTA_DEMO.email})</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function FormularioRegistro({ onListo }: { onListo: () => void }) {
  const { registrar } = useSesion();
  const { avisar, avisarError } = useAvisos();
  const [datos, setDatos] = useState({
    nombre: '',
    email: '',
    password: '',
    confirmar: '',
    telefono: '',
    direccion: '',
  });
  const [errores, setErrores] = useState<Errores<typeof datos>>({});
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    if (enviando) return;
    const validacion = validarRegistro(datos);
    setErrores(validacion);
    if (hayErrores(validacion)) return;

    setEnviando(true);
    try {
      await registrar({
        nombre: datos.nombre,
        email: datos.email,
        password: datos.password,
        telefono: datos.telefono,
        direccion: datos.direccion,
      });
      avisar('Tu cuenta esta lista.');
      onListo();
    } catch (error) {
      avisarError(error);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <View style={estilos.formulario}>
      <Campo
        etiqueta="Nombre completo"
        value={datos.nombre}
        onChangeText={(nombre) => setDatos((d) => ({ ...d, nombre }))}
        placeholder="Tu nombre"
        error={errores.nombre}
      />
      <Campo
        etiqueta="Correo"
        value={datos.email}
        onChangeText={(email) => setDatos((d) => ({ ...d, email }))}
        placeholder="tucorreo@ejemplo.com"
        keyboardType="email-address"
        autoCapitalize="none"
        error={errores.email}
      />
      <Campo
        etiqueta="Telefono"
        value={datos.telefono}
        onChangeText={(telefono) => setDatos((d) => ({ ...d, telefono }))}
        placeholder="70000000"
        keyboardType="phone-pad"
        error={errores.telefono}
      />
      <Campo
        etiqueta="Direccion"
        value={datos.direccion}
        onChangeText={(direccion) => setDatos((d) => ({ ...d, direccion }))}
        placeholder="Para tus envios"
        ayuda="Opcional, puedes completarla despues."
      />
      <Campo
        etiqueta="Contrasena"
        value={datos.password}
        onChangeText={(password) => setDatos((d) => ({ ...d, password }))}
        placeholder="8+ caracteres, mayuscula, minuscula y numero"
        secreto
        autoCapitalize="none"
        error={errores.password}
      />
      <Campo
        etiqueta="Repetir contrasena"
        value={datos.confirmar}
        onChangeText={(confirmar) => setDatos((d) => ({ ...d, confirmar }))}
        placeholder="Vuelve a escribirla"
        secreto
        autoCapitalize="none"
        error={errores.confirmar}
      />
      <Boton titulo="Crear cuenta" onPress={enviar} cargando={enviando} ancho />
    </View>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  contenido: { padding: esp.l, gap: esp.l, paddingBottom: esp.xxl },
  marca: { ...texto.display, textAlign: 'center', marginTop: esp.l },
  subtitulo: { ...texto.cuerpo, textAlign: 'center', marginTop: -esp.s },
  conmutador: {
    flexDirection: 'row',
    backgroundColor: colores.crema2,
    borderRadius: radio.pill,
    padding: 4,
    gap: 4,
  },
  opcion: { flex: 1, paddingVertical: esp.s, borderRadius: radio.pill, alignItems: 'center' },
  opcionActiva: { backgroundColor: colores.blanco },
  opcionTexto: { ...texto.cuerpo, color: colores.tinta3, fontWeight: '500' },
  opcionTextoActivo: { color: colores.tinta, fontWeight: '600' },
  formulario: { gap: esp.m },
  demo: { ...texto.menor, textAlign: 'center', color: colores.acento },
  omitir: { alignItems: 'center', paddingVertical: esp.s },
  omitirTexto: { ...texto.cuerpo, color: colores.tinta3, textDecorationLine: 'underline' },
});
