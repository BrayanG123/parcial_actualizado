import { ProveedorPush } from './src/context/PushContext';
/**
 * FashionStore movil.
 *
 * Arranque:
 *   1. se restaura el estado del mock (solo mientras no exista el backend);
 *   2. se monta la cache de datos remotos;
 *   3. la sesion guardada se recupera dentro de ProveedorSesion.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { USAR_MOCKS } from './src/api/http';
import { hidratarEmpresa, obtenerEmpresa, suscribirEmpresa } from './src/api/empresa';
import { hidratarSucursales } from './src/lib/sucursal-tienda';
import { restaurarEstado } from './src/mocks';
import { ProveedorAvisos } from './src/context/AvisosContext';
import { ProveedorSesion } from './src/context/SesionContext';
import { ProveedorBorradorReserva } from './src/features/reservations/BorradorReserva';
import { Navegacion } from './src/navigation/Navegacion';
import { colores, texto } from './src/theme';

/**
 * Reintentar una sola vez: en un telefono con mala senal, tres reintentos con
 * espera exponencial solo alargan la pantalla de carga.
 */
const clienteQuery = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30 * 1000,
    },
    mutations: { retry: 0 },
  },
});

export default function App() {
  const [listo, setListo] = useState(false);

  useEffect(() => {
    // La tienda elegida se recupera antes de dibujar: sin ella la app abre el selector
    // de tiendas, nunca la tienda de otra empresa por defecto.
    Promise.all([USAR_MOCKS ? restaurarEstado() : null, hidratarEmpresa(), hidratarSucursales()]).finally(() => setListo(true));
  }, []);

  // Los datos en cache (sucursales, catalogo, tallas...) son de una tienda: al cambiar de
  // tienda se descartan para no mostrar las sucursales o prendas de la anterior.
  useEffect(() => {
    let slug = obtenerEmpresa()?.slug;
    return suscribirEmpresa(() => {
      const nuevo = obtenerEmpresa()?.slug;
      if (nuevo === slug) return;
      slug = nuevo;
      clienteQuery.removeQueries({ type: 'inactive' });
      void clienteQuery.resetQueries({ type: 'active' });
    });
  }, []);

  // Al volver a la app se refrescan reservas y compras: el personal pudo
  // cambiarlas mientras tanto aunque el aviso push no haya llegado.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado !== 'active') return;
      for (const clave of ['reservas', 'reserva', 'ventas', 'venta'])
        void clienteQuery.invalidateQueries({ queryKey: [clave] });
    });
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {listo ? (
        <QueryClientProvider client={clienteQuery}>
          <ProveedorSesion>
            <ProveedorPush>
              <ProveedorAvisos>
                <ProveedorBorradorReserva>
                  <Navegacion />
                </ProveedorBorradorReserva>
              </ProveedorAvisos>
            </ProveedorPush>
          </ProveedorSesion>
        </QueryClientProvider>
      ) : (
        <View style={estilos.splash}>
          <Text style={estilos.marca}>FashionStore</Text>
          <ActivityIndicator color={colores.acento} />
        </View>
      )}
    </SafeAreaProvider>
  );
}

const estilos = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    backgroundColor: colores.crema,
  },
  marca: { ...texto.display },
});
