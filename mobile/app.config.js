const fs = require('node:fs');
const path = require('node:path');

// GOOGLE_SERVICES_JSON puede ser una variable de archivo en EAS.
// El JSON de la cuenta de servicio NO pertenece a la app.
module.exports = ({ config }) => {
  const archivo = process.env.GOOGLE_SERVICES_JSON || path.join(__dirname, 'google-services.json');
  const disponible = fs.existsSync(archivo);
  if (process.env.EAS_BUILD_PLATFORM === 'android' && !disponible) {
    throw new Error('Falta google-services.json de bo.fashionstore.movil. Ver docs/notificaciones-android.md.');
  }
  if (disponible) {
    const google = JSON.parse(fs.readFileSync(archivo, 'utf8'));
    const coincide = google.client?.some((c) => c.client_info?.android_client_info?.package_name === config.android.package);
    if (!coincide) throw new Error('google-services.json no corresponde al package Android de FashionStore.');
  }
  return {
    ...config,
    android: { ...config.android, ...(disponible ? { googleServicesFile: archivo } : {}) },
    plugins: [...(config.plugins || []), ['expo-notifications', { defaultChannel: 'customer-updates', color: '#9e3d36' }]],
  };
};
