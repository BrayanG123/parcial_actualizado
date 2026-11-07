/** Tiendas (empresas) de la plataforma: directorio publico y verificacion de un codigo. */
import { api } from '../api/http';
import { endpoints } from '../api/endpoints';

export interface TiendaResumen {
  slug: string;
  nombre: string;
}

export const tiendaService = {
  async directorio(): Promise<TiendaResumen[]> {
    const lista = await api.get<Array<{ slug: string; name: string }>>(endpoints.tiendas.directorio);
    return lista.map((e) => ({ slug: e.slug, nombre: e.name }));
  },

  /** Empresa activa con ese codigo (el backend responde 404 si no existe o no esta activa). */
  async verificar(slug: string): Promise<TiendaResumen> {
    const e = await api.get<{ slug: string; name: string }>(endpoints.tiendas.publica, undefined, {
      headers: { 'X-Tenant': slug },
    });
    return { slug: e.slug, nombre: e.name };
  },
};
