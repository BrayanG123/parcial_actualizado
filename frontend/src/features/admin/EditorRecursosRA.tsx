import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { USAR_MOCKS } from '../../api/config';
import { invalidarCatalogo } from '../../hooks/invalidarCatalogo';
import { FORMATOS_RA, recursosRAService, type FormatoRA } from '../../services/recursosRA.service';

/** Modelos 3D que la app movil abre en el probador virtual y en "Ver en tu espacio". */
export function EditorRecursosRA({ idProducto }: { idProducto?: number }) {
  const qc = useQueryClient();
  const [url, setUrl] = useState('');
  const [formato, setFormato] = useState<FormatoRA>('GLB');
  const [error, setError] = useState<string | null>(null);
  const clave = ['recursos-ra', idProducto ?? 0];

  const recursos = useQuery({
    queryKey: clave,
    queryFn: () => recursosRAService.listar(idProducto!),
    enabled: Boolean(idProducto) && !USAR_MOCKS,
  });
  const alCambiar = () => {
    void qc.invalidateQueries({ queryKey: clave });
    void invalidarCatalogo(qc);
  };
  const crear = useMutation({
    mutationFn: () => recursosRAService.crear(idProducto!, url, formato),
    onSuccess: () => {
      setUrl('');
      setError(null);
      alCambiar();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'No pudimos registrar el modelo.'),
  });
  const quitar = useMutation({
    mutationFn: (id: number) => recursosRAService.desactivar(idProducto!, id),
    onSuccess: alCambiar,
    onError: (e) => setError(e instanceof Error ? e.message : 'No pudimos quitar el modelo.'),
  });

  return (
    <div className="fs-pila">
      <p className="fs-eyebrow">Probador virtual (RA)</p>
      <p className="fs-sub">
        URL publica de un modelo 3D de la prenda. La app movil lo muestra en 3D y lo coloca en el espacio con la
        camara (ARCore o AR Quick Look). El servidor que lo aloja debe permitir CORS.
      </p>

      {!idProducto ? (
        <p className="fs-campo-ayuda">Guarda el producto para poder agregar sus modelos 3D.</p>
      ) : USAR_MOCKS ? (
        <p className="fs-campo-ayuda">Los modelos 3D se gestionan con la API real.</p>
      ) : (
        <>
          {recursos.data && recursos.data.length > 0 && (
            <ul className="fs-pila" style={{ gap: 6, listStyle: 'none', margin: 0, padding: 0 }}>
              {recursos.data.map((r) => (
                <li key={r.id_recurso_ra} className="fs-fila-entre" style={{ gap: 8 }}>
                  <span className="fs-sub" style={{ overflowWrap: 'anywhere' }}>
                    <strong>{r.formato}</strong> - {r.url_recurso}
                  </span>
                  <button
                    type="button"
                    className="fs-btn fs-btn--fantasma fs-btn--s"
                    disabled={quitar.isPending}
                    onClick={() => quitar.mutate(r.id_recurso_ra)}
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          )}
          {recursos.data?.length === 0 && <p className="fs-sub">Esta prenda todavia no tiene modelo 3D.</p>}

          <div className="fs-fila-wrap">
            <div className="fs-campo" style={{ flex: '1 1 280px' }}>
              <label htmlFor="url-modelo-ra">URL del modelo</label>
              <input
                id="url-modelo-ra"
                className="fs-input"
                placeholder="https://.../prenda.glb"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <div className="fs-campo" style={{ maxWidth: 120 }}>
              <label htmlFor="formato-modelo-ra">Formato</label>
              <select
                id="formato-modelo-ra"
                className="fs-select"
                value={formato}
                onChange={(e) => setFormato(e.target.value as FormatoRA)}
              >
                {FORMATOS_RA.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="fs-btn fs-btn--contorno fs-btn--s"
              style={{ alignSelf: 'flex-end' }}
              disabled={!url.trim() || crear.isPending}
              onClick={() => crear.mutate()}
            >
              Agregar modelo
            </button>
          </div>
          {error && <span className="fs-campo-error">{error}</span>}
        </>
      )}
    </div>
  );
}
