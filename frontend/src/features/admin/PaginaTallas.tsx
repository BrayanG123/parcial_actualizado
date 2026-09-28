import { catalogoService } from '../../services/catalogo.service';
import { claves } from '../../hooks/claves';
import type { Talla } from '../../types/domain';
import { CrudSimple } from './CrudSimple';

export default function PaginaTallas() {
  return (
    <CrudSimple<Talla>
      titulo="Tallas"
      descripcion="Tallas disponibles para asignar a los productos y al inventario."
      nombreSingular="Talla"
      claveCache={claves.tallas}
      cargar={catalogoService.listarTallas}
      crear={(datos) => catalogoService.crearTalla(datos as Omit<Talla, 'id_talla'>)}
      actualizar={(id, datos) => catalogoService.actualizarTalla(id, datos)}
      eliminar={(id) => catalogoService.eliminarTalla(id)}
      idDe={(t) => t.id_talla}
      nuevo={{ nombre: '' }}
      columnas={[{ titulo: 'Nombre', render: (t) => t.nombre }]}
      campos={[
        {
          clave: 'nombre',
          etiqueta: 'Nombre',
          requerido: true,
          minLength: 1,
          maxLength: 30,
          ayuda: 'Por ejemplo: XS, S, M, L.',
        },
      ]}
    />
  );
}
