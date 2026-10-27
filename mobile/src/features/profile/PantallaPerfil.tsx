import { AvisosPush } from '../notifications/AvisosPush';
/**
 * Perfil del cliente: sus datos, accesos a compras y reservas, y cierre de
 * sesion. Solo se muestran los campos que existen en el modelo de dominio
 * (Usuario + Cliente); no se inventan datos personales adicionales.
 */
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Boton } from '../../components/Boton';
import { Campo } from '../../components/Campo';
import { Pantalla } from '../../components/Pantalla';
import { RequiereSesion } from '../../components/RequiereSesion';
import { useAvisos } from '../../context/AvisosContext';
import { useSesion } from '../../context/SesionContext';
import { USAR_MOCKS } from '../../api/http';
import { fecha, iniciales } from '../../lib/format';
import type { PropsTab } from '../../navigation/tipos';
import { colores, esp, radio, texto } from '../../theme';

export function PantallaPerfil({ navigation }: PropsTab<'Perfil'>) {
  const { usuario, cliente, autenticado, cerrarSesion, actualizarPerfil } = useSesion();
  const { avisar, avisarError } = useAvisos();
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [borrador, setBorrador] = useState({ nombre: '', telefono: '', direccion: '' });

  function abrirEdicion() {
    setBorrador({
      nombre: usuario?.nombre ?? '',
      telefono: cliente?.telefono ?? '',
      direccion: cliente?.direccion ?? '',
    });
    setEditando(true);
  }

  async function guardar() {
    if (borrador.nombre.trim().length < 2) {
      avisar('El nombre debe tener al menos 2 caracteres.', 'info');
      return;
    }
    setGuardando(true);
    try {
      await actualizarPerfil(borrador);
      setEditando(false);
      avisar('Tus datos se actualizaron.');
    } catch (error) {
      avisarError(error);
    } finally {
      setGuardando(false);
    }
  }

  if (!autenticado || !usuario) {
    return (
      <Pantalla>
        <RequiereSesion
          titulo="Tu cuenta"
          detalle="Inicia sesion para ver tus datos, compras y reservas."
          onAcceder={() => navigation.navigate('Acceso')}
        />
      </Pantalla>
    );
  }

  function confirmarSalida() {
    Alert.alert('Cerrar sesion', 'Tendras que ingresar de nuevo para comprar o reservar.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar sesion',
        style: 'destructive',
        onPress: () => {
          cerrarSesion().catch(avisarError);
        },
      },
    ]);
  }

  return (
    <Pantalla>
      <ScrollView contentContainerStyle={estilos.contenido} showsVerticalScrollIndicator={false}>
        <View style={estilos.cabecera}>
          <View style={estilos.avatar}>
            <Text style={estilos.avatarTexto}>{iniciales(usuario.nombre)}</Text>
          </View>
          <View style={estilos.flex}>
            <Text style={estilos.nombre}>{usuario.nombre}</Text>
            <Text style={estilos.detalle}>{usuario.email}</Text>
            <Text style={estilos.detalle}>Cliente desde {fecha(usuario.fecha_registro)}</Text>
          </View>
        </View>

        {editando ? (
          <View style={estilos.tarjeta}>
            <Text style={estilos.tituloBloque}>Editar mis datos</Text>
            <Campo
              etiqueta="Nombre completo"
              value={borrador.nombre}
              maxLength={120}
              onChangeText={(nombre) => setBorrador((d) => ({ ...d, nombre }))}
            />
            {cliente ? (
              <>
                <Campo
                  etiqueta="Telefono"
                  keyboardType="phone-pad"
                  value={borrador.telefono}
                  maxLength={30}
                  onChangeText={(telefono) => setBorrador((d) => ({ ...d, telefono }))}
                />
                <Campo
                  etiqueta="Direccion"
                  value={borrador.direccion}
                  maxLength={250}
                  multiline
                  onChangeText={(direccion) => setBorrador((d) => ({ ...d, direccion }))}
                />
              </>
            ) : null}
            <Text style={estilos.detalle}>El correo y la contrasena los cambia la tienda.</Text>
            <View style={estilos.filaBotones}>
              <Boton titulo="Cancelar" variante="secundario" onPress={() => setEditando(false)} estilo={estilos.mitad} />
              <Boton titulo="Guardar" onPress={guardar} cargando={guardando} estilo={estilos.mitad} />
            </View>
          </View>
        ) : (
          <View style={estilos.tarjeta}>
            <Text style={estilos.tituloBloque}>Mis datos</Text>
            <Dato icono="call-outline" etiqueta="Telefono" valor={cliente?.telefono || 'Sin registrar'} />
            <Dato icono="location-outline" etiqueta="Direccion" valor={cliente?.direccion || 'Sin registrar'} />
            <Boton titulo="Editar mis datos" icono="create-outline" variante="secundario" onPress={abrirEdicion} />
          </View>
        )}

        <View style={estilos.tarjeta}>
          <Text style={estilos.tituloBloque}>Mi actividad</Text>
          <Acceso
            icono="receipt-outline"
            titulo="Mis compras"
            detalle="Historial de pedidos y pagos"
            onPress={() => navigation.navigate('Compras')}
          />
          <Acceso
            icono="calendar-outline"
            titulo="Mis reservas"
            detalle="Prendas apartadas para probar"
            onPress={() => navigation.navigate('Reservas')}
          />
          <Acceso
            icono="sparkles-outline"
            titulo="Asistente de estilo"
            detalle="Pide recomendaciones de prendas"
            onPress={() => navigation.navigate('Asistente')}
          />
          <Acceso
            icono="cloud-offline-outline"
            titulo="Tienda sin conexion"
            detalle="Descarga el catalogo y reserva aunque no tengas internet"
            onPress={() => navigation.navigate('TiendaOffline')}
          />
          <Acceso
            icono="sync-outline"
            titulo="Operaciones pendientes"
            detalle="Reservas offline y su sincronizacion"
            onPress={() => navigation.navigate('Pendientes')}
          />
          <Acceso
            icono="storefront-outline"
            titulo="Cambiar de tienda"
            detalle="Elige otra empresa de la plataforma"
            onPress={() => navigation.navigate('Tiendas')}
          />
        </View>

        <View style={estilos.tarjeta}>
          <Text style={estilos.tituloBloque}>Aplicacion</Text>
          <Dato icono="phone-portrait-outline" etiqueta="Version" valor="1.0.0 (MVP)" />
          <Dato
            icono="server-outline"
            etiqueta="Origen de datos"
            valor={USAR_MOCKS ? 'Datos de prueba locales' : 'Backend NestJS'}
          />
        </View>

        <AvisosPush />

        <Boton titulo="Cerrar sesion" variante="peligro" icono="log-out-outline" ancho onPress={confirmarSalida} />
      </ScrollView>
    </Pantalla>
  );
}

function Dato({
  icono,
  etiqueta,
  valor,
}: {
  icono: keyof typeof Ionicons.glyphMap;
  etiqueta: string;
  valor: string;
}) {
  return (
    <View style={estilos.dato}>
      <Ionicons name={icono} size={17} color={colores.tinta3} />
      <Text style={estilos.datoEtiqueta}>{etiqueta}</Text>
      <Text style={estilos.datoValor} numberOfLines={1}>
        {valor}
      </Text>
    </View>
  );
}

function Acceso({
  icono,
  titulo,
  detalle,
  onPress,
}: {
  icono: keyof typeof Ionicons.glyphMap;
  titulo: string;
  detalle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [estilos.acceso, pressed && estilos.presionado]}
    >
      <View style={estilos.accesoIcono}>
        <Ionicons name={icono} size={18} color={colores.acento} />
      </View>
      <View style={estilos.flex}>
        <Text style={estilos.accesoTitulo}>{titulo}</Text>
        <Text style={estilos.detalle}>{detalle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colores.tinta3} />
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  contenido: { padding: esp.l, gap: esp.m, paddingBottom: esp.xl },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: esp.m, paddingVertical: esp.s },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colores.tinta,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTexto: { color: colores.blanco, fontSize: 20, fontWeight: '600' },
  nombre: { ...texto.titulo, fontSize: 19 },
  detalle: { ...texto.menor },
  tarjeta: {
    padding: esp.m,
    borderRadius: radio.m,
    backgroundColor: colores.blanco,
    borderWidth: 1,
    borderColor: colores.borde,
    gap: esp.s,
  },
  tituloBloque: { ...texto.subtitulo },
  filaBotones: { flexDirection: 'row', gap: esp.m },
  mitad: { flex: 1 },
  dato: { flexDirection: 'row', alignItems: 'center', gap: esp.s },
  datoEtiqueta: { ...texto.menor, width: 78 },
  datoValor: { ...texto.cuerpo, flex: 1, color: colores.tinta, textAlign: 'right' },
  acceso: { flexDirection: 'row', alignItems: 'center', gap: esp.m, paddingVertical: esp.s },
  presionado: { opacity: 0.7 },
  accesoIcono: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colores.acentoSuave,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accesoTitulo: { ...texto.cuerpo, fontWeight: '600', color: colores.tinta },
});
