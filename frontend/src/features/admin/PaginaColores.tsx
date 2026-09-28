import { catalogoService } from '../../services/catalogo.service';
import { claves } from '../../hooks/claves';
import type { Color } from '../../types/domain';
import { CrudSimple } from './CrudSimple';

export default function PaginaColores() {
  return (
    <CrudSimple<Color>
      titulo="Colores"
      descripcion="Paleta usada por productos e inventario."
      nombreSingular="Color"
      claveCache={claves.colores}
      cargar={catalogoService.listarColores}
      crear={(datos) => catalogoService.crearColor(datos as Omit<Color, 'id_color'>)}
      actualizar={(id, datos) => catalogoService.actualizarColor(id, datos)}
      eliminar={(id) => catalogoService.eliminarColor(id)}
      idDe={(c) => c.id_color}
      nuevo={{ nombre: '', codigo_hex: '#000000' }}
      columnas={[
        {
          titulo: 'Color',
          render: (c) => (
            <span className="fs-fila" style={{ gap: 8 }}>
              <span className="fs-punto-color" style={{ background: c.codigo_hex }} />
              {c.nombre}
            </span>
          ),
        },
        { titulo: 'Codigo', render: (c) => <span className="fs-sub">{c.codigo_hex}</span> },
      ]}
      campos={[
        { clave: 'nombre', etiqueta: 'Nombre', requerido: true, minLength: 2, maxLength: 60 },
        { clave: 'codigo_hex', etiqueta: 'Codigo de color', tipo: 'color', requerido: true },
      ]}
    />
  );
}
