import { useState } from 'react';

const RESPALDO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400">
      <rect width="300" height="400" fill="#f2ece5"/>
      <path d="M110 120h80l20 40-30 10v120h-60V170l-30-10z" fill="#d3c7ba"/>
    </svg>`,
  );

interface Props {
  src: string;
  alt: string;
  /** Las imagenes fuera del primer pliegue se cargan de forma diferida. */
  prioritaria?: boolean;
}

export function ImagenProducto({ src, alt, prioritaria }: Props) {
  const [fallida, setFallida] = useState<string | null>(null);

  return (
    <img
      src={!src || fallida === src ? RESPALDO : src}
      alt={alt}
      loading={prioritaria ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setFallida(src)}
    />
  );
}
