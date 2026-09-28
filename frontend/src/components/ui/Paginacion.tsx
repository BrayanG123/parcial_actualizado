interface Props {
  page: number;
  pageSize: number;
  total: number;
  onCambiar: (page: number) => void;
}

export function Paginacion({ page, pageSize, total, onCambiar }: Props) {
  const paginas = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;

  const desde = (page - 1) * pageSize + 1;
  const hasta = Math.min(total, page * pageSize);

  return (
    <nav className="fs-paginacion" aria-label="Paginacion">
      <span className="fs-nums">
        {desde}-{hasta} de {total}
      </span>
      <div className="fs-fila" style={{ gap: 8 }}>
        <button
          type="button"
          className="fs-btn fs-btn--contorno fs-btn--s"
          onClick={() => onCambiar(page - 1)}
          disabled={page <= 1}
        >
          Anterior
        </button>
        <span className="fs-nums">
          {page} / {paginas}
        </span>
        <button
          type="button"
          className="fs-btn fs-btn--contorno fs-btn--s"
          onClick={() => onCambiar(page + 1)}
          disabled={page >= paginas}
        >
          Siguiente
        </button>
      </div>
    </nav>
  );
}
