import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { FiltrosProducto } from '../services/catalogo.service';

export type TabsParamList = {
  Inicio: undefined;
  Catalogo: { filtros?: FiltrosProducto } | undefined;
  Carrito: undefined;
  Reservas: undefined;
  Perfil: undefined;
};

export type RootStackParamList = {
  Tabs: undefined;
  Producto: { id: number; nombre?: string };
  Probador: { idProducto: number; nombre: string };
  Checkout: undefined;
  NuevaReserva: undefined;
  DetalleReserva: { id: number };
  Compras: undefined;
  DetalleCompra: { id: number };
  Asistente: undefined;
  Acceso: { modo?: 'login' | 'registro'; motivo?: string } | undefined;
};

export type PropsStack<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;

export type PropsTab<T extends keyof TabsParamList> = CompositeScreenProps<
  BottomTabScreenProps<TabsParamList, T>,
  NativeStackScreenProps<RootStackParamList>
>;
