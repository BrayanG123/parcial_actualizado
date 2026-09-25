import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, BASE_URL, USAR_MOCKS } from '../api/http';
import { endpoints } from '../api/endpoints';
import { RegistroPush } from '../lib/registro-push';

export const PUSH_ANDROID = Platform.OS === 'android'
  && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient && !USAR_MOCKS;
const clave = 'fashionstore.push:' + BASE_URL;
export const registroPush = new RegistroPush({
  leer: () => AsyncStorage.getItem(clave),
  guardar: (token) => token ? AsyncStorage.setItem(clave, token) : AsyncStorage.removeItem(clave),
  alta: (token, jwt) => api.post(endpoints.push.tokens, { token, platform: 'ANDROID' },
    { headers: { Authorization: 'Bearer ' + jwt }, timeout: 10000 }),
  baja: (token, jwt) => api.delete(endpoints.push.tokens, { token },
    { headers: { Authorization: 'Bearer ' + jwt }, timeout: 10000 }),
});

/** Importacion diferida: web, iOS y Expo Go no inicializan el modulo nativo. */
export async function notificacionesAndroid() {
  if (!PUSH_ANDROID) return null;
  return import('expo-notifications');
}

export const pushService = {
  estado: () => api.get<{ enabled: boolean }>(endpoints.push.estado),
  async retirar() {
    if (!PUSH_ANDROID) return;
    try { await registroPush.retirar(); }
    finally {
      const n = await notificacionesAndroid();
      await n?.dismissAllNotificationsAsync();
      await n?.clearLastNotificationResponseAsync();
    }
  },
};
