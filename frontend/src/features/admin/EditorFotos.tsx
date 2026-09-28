import { useRef, useState } from 'react';
import { subirImagen } from '../../services/imagenes.service';
import { ImagenProducto } from '../../components/ui/ImagenProducto';

interface Props {
  fotos: string[];
  disabled: boolean;
  onChange: (fotos: string[]) => void;
  onBusy: (busy: boolean) => void;
}

export function EditorFotos({ fotos, disabled, onChange, onBusy }: Props) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const lock = useRef(false);
  const ocupado = disabled || subiendo;

  function agregarUrl() {
    try {
      const nueva = url.trim();
      if (!['http:', 'https:'].includes(new URL(nueva).protocol)) throw new Error();
      if (fotos.includes(nueva)) {
        setError('Esa foto ya esta agregada.');
        return;
      }
      if (fotos.length >= 8) return;
      onChange([...fotos, nueva]);
      setUrl('');
      setError('');
    } catch {
      setError('Ingresa una URL http o https valida.');
    }
  }

  async function subir(files: FileList | null) {
    if (!files?.length || lock.current) return;
    if (fotos.length + files.length > 8) {
      setError('Puedes guardar hasta 8 fotos por producto.');
      return;
    }
    lock.current = true;
    setSubiendo(true);
    onBusy(true);
    setError('');
    const nuevas = [...fotos];
    try {
      for (const file of Array.from(files)) {
        const uploaded = await subirImagen(file);
        if (!nuevas.includes(uploaded)) nuevas.push(uploaded);
        onChange([...nuevas]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo subir la foto.');
    } finally {
      lock.current = false;
      setSubiendo(false);
      onBusy(false);
    }
  }

  return (
    <section className="fs-pila" aria-label="Fotos del producto">
      <p className="fs-eyebrow">Fotos del producto</p>
      <p className="fs-sub">Hasta 8 fotos. La primera es la principal del catalogo.</p>
      <div className="fs-fila-wrap">
        {fotos.map((foto, i) => (
          <div key={foto} className="fs-pila" style={{ width: 130, gap: 6 }}>
            <div style={{ height: 130, overflow: 'hidden' }}>
              <ImagenProducto src={foto} alt={`Foto ${i + 1}`} />
            </div>
            <button
              type="button"
              className="fs-btn fs-btn--contorno"
              disabled={ocupado || i === 0}
              onClick={() => onChange([foto, ...fotos.filter((_, index) => index !== i)])}
            >
              {i === 0 ? 'Principal' : 'Hacer principal'}
            </button>
            <button
              type="button"
              className="fs-btn fs-btn--fantasma"
              disabled={ocupado}
              aria-label={`Quitar foto ${i + 1}`}
              onClick={() => onChange(fotos.filter((_, index) => index !== i))}
            >
              Quitar
            </button>
          </div>
        ))}
      </div>
      <div className="fs-campo">
        <label htmlFor="archivos-producto">Subir fotos</label>
        <input
          id="archivos-producto"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={ocupado || fotos.length >= 8}
          onChange={(e) => {
            void subir(e.target.files);
            e.target.value = '';
          }}
        />
        <span className="fs-sub">JPG, PNG o WebP. Maximo 5 MB por foto.</span>
      </div>
      <div className="fs-campo">
        <label htmlFor="imagen">URL de imagen</label>
        <div className="fs-fila-wrap">
          <input
            id="imagen"
            type="url"
            className="fs-input fs-crecer"
            value={url}
            placeholder="https://..."
            disabled={ocupado || fotos.length >= 8}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button
            type="button"
            className="fs-btn fs-btn--contorno"
            disabled={ocupado || !url.trim() || fotos.length >= 8}
            onClick={agregarUrl}
          >
            Agregar URL
          </button>
        </div>
        {url.trim() && (
          <span className="fs-sub">Pulsa Agregar URL para incluir esta foto antes de guardar.</span>
        )}
      </div>
      {subiendo && <p role="status">Subiendo fotos...</p>}
      {error && (
        <p role="alert" className="fs-campo-error">
          {error}
        </p>
      )}
    </section>
  );
}
