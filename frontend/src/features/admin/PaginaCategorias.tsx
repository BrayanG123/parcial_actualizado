import { catalogoService } from '../../services/catalogo.service';
import { claves } from '../../hooks/claves';
import type { Categoria } from '../../types/domain';
import { CrudSimple } from './CrudSimple';

export default function PaginaCategorias() {
  return (
    <CrudSimple<Categoria>
      titulo="Categorias"
      descripcion="Clasificacion principal de las prendas del catalogo."
      nombreSingular="Categoria"
      claveCache={claves.categorias}
      cargar={catalogoService.listarCategorias}
      crear={(datos) => catalogoService.crearCategoria(datos as Omit<Categoria, 'id_categoria'>)}
      actualizar={(id, datos) => catalogoService.actualizarCategoria(id, datos)}
      eliminar={(id) => catalogoService.eliminarCategoria(id)}
      idDe={(c) => c.id_categoria}
      nuevo={{ nombre: '', descripcion: '' }}
      columnas={[
        { titulo: 'Nombre', render: (c) => c.nombre },
        { titulo: 'Descripcion', render: (c) => <span className="fs-sub">{c.descripcion}</span> },
      ]}
      campos={[
        { clave: 'nombre', etiqueta: 'Nombre', requerido: true, minLength: 2, maxLength: 100 },
        { clave: 'descripcion', etiqueta: 'Descripcion', tipo: 'textarea' },
      ]}
    />
  );
}
