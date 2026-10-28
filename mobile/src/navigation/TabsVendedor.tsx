import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Alert, ScrollView, Text } from 'react-native';
import { useEmpresaActiva } from '../hooks/useEmpresa';
import { Boton } from '../components/Boton';
import { Pantalla } from '../components/Pantalla';
import { useSesion } from '../context/SesionContext';
import { PantallaPendientes } from '../features/offline/PantallaPendientes';
import { PantallaVender } from '../features/offline/PantallaVender';
import { PantallaReportesIA } from '../features/reportes/PantallaReportesIA';
import { reportesService } from '../services/reportes.service';
import { RolNombre } from '../types/domain';
import { useAlcanceOffline, useDatosOffline } from '../hooks/useOffline';
import { colores, esp, fuentes, texto } from '../theme';
import type { TabsVendedorParamList } from './tipos';

const Tab = createBottomTabNavigator<TabsVendedorParamList>();

function PerfilVendedor() {
  const { usuario, sesionOffline, cerrarSesion } = useSesion();
  const alcance = useAlcanceOffline();
  const { pendientes } = useDatosOffline(alcance);
  const empresa = useEmpresaActiva();
  return (
    <Pantalla>
      <ScrollView contentContainerStyle={{ padding: esp.l, gap: esp.m }}>
        <Text style={texto.titulo}>{usuario?.nombre}</Text>
        <Text style={texto.cuerpo}>{usuario?.roles.map((r) => String(r.nombre).toLowerCase()).join(', ')}</Text>
        <Text style={texto.cuerpo}>Tienda: {empresa?.nombre ?? empresa?.slug ?? 'FashionStore'}</Text>
        {sesionOffline && <Text style={texto.cuerpo}>Sesion sin conexion: solo venta offline y pendientes.</Text>}
        <Boton
          titulo="Cerrar sesion"
          variante="peligro"
          icono="log-out-outline"
          ancho
          onPress={() =>
            pendientes.length
              ? Alert.alert(
                  'Hay operaciones pendientes',
                  'Quedan guardadas en el telefono y se enviaran al volver a iniciar sesion con esta cuenta.',
                  [
                    { text: 'Cancelar', style: 'cancel' },
                    { text: 'Cerrar sesion', style: 'destructive', onPress: () => void cerrarSesion() },
                  ],
                )
              : void cerrarSesion()
          }
        />
      </ScrollView>
    </Pantalla>
  );
}

/** Roles que consultan reportes en el backend (POST /ai/reports). */
const ROLES_REPORTES: string[] = [RolNombre.ADMINISTRADOR, RolNombre.ENCARGADO_SUCURSAL];

/**
 * Modo vendedor (F6.6): POS offline, pendientes y cuenta. Administrador y encargado ven
 * ademas "Reportes" (F8.6) si el plan de la empresa incluye reportes con IA.
 */
export function TabsVendedor() {
  const alcance = useAlcanceOffline();
  const { pendientes } = useDatosOffline(alcance);
  const { usuario, sesionOffline } = useSesion();
  const puedeReportes = Boolean(usuario?.roles.some((r) => ROLES_REPORTES.includes(String(r.nombre))));
  // El backend vuelve a verificar rol y plan; aqui solo se evita mostrar una pestana inutil.
  const plan = useQuery({
    queryKey: ['plan-reportes-ia', usuario?.id_usuario],
    queryFn: reportesService.incluyeReportesIA,
    enabled: puedeReportes && !sesionOffline,
    staleTime: 5 * 60_000,
  });
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colores.acento,
        tabBarInactiveTintColor: colores.tinta3,
        tabBarLabelStyle: { fontFamily: fuentes.texto, fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tab.Screen
        name="Vender"
        component={PantallaVender}
        options={{ tabBarIcon: ({ color, size }) => <Ionicons name="cash-outline" size={size - 2} color={color} /> }}
      />
      <Tab.Screen
        name="PendientesVendedor"
        component={PantallaPendientes}
        options={{
          title: 'Pendientes',
          tabBarBadge: pendientes.length || undefined,
          tabBarIcon: ({ color, size }) => <Ionicons name="sync-outline" size={size - 2} color={color} />,
        }}
      />
      {plan.data === true && (
        <Tab.Screen
          name="ReportesIA"
          component={PantallaReportesIA}
          options={{
            title: 'Reportes',
            tabBarIcon: ({ color, size }) => <Ionicons name="bar-chart-outline" size={size - 2} color={color} />,
          }}
        />
      )}
      <Tab.Screen
        name="PerfilVendedor"
        component={PerfilVendedor}
        options={{ title: 'Cuenta', tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size - 2} color={color} /> }}
      />
    </Tab.Navigator>
  );
}
