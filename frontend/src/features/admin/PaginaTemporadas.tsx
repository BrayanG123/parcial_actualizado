import { BadgeActivo } from '../../components/ui/Badges';
import { catalogoService } from '../../services/catalogo.service';
import { claves } from '../../hooks/claves';
import { fecha } from '../../lib/format';
import type { Temporada } from '../../types/domain';
import { CrudSimple } from './CrudSimple';

export default function PaginaTemporadas() {
  return (
    <CrudSimple<Temporada>
      titulo="Temporadas"
      descripcion="Periodos comerciales que agrupan colecciones y productos."
      nombreSingular="Temporada"
      claveCache={claves.temporadas}
      cargar={catalogoService.listarTemporadas}
      crear={(datos) => catalogoService.crearTemporada(datos as Omit<Temporada, 'id_temporada'>)}
      actualizar={(id, datos) => catalogoService.actualizarTemporada(id, datos)}
      eliminar={(id) => catalogoService.eliminarTemporada(id)}
      idDe={(t) => t.id_temporada}
      bajaLogica={(item) => item.activa}
      validar={(d) =>
        d.fecha_inicio && d.fecha_fin && d.fecha_fin < d.fecha_inicio
          ? { fecha_fin: 'El fin debe ser igual o posterior al inicio' }
          : {}
      }
      nuevo={{ nombre: '', fecha_inicio: '', fecha_fin: '', activa: true }}
      columnas={[
        { titulo: 'Nombre', render: (t) => t.nombre },
        { titulo: 'Inicio', render: (t) => fecha(t.fecha_inicio) },
        { titulo: 'Fin', render: (t) => fecha(t.fecha_fin) },
        { titulo: 'Estado', render: (t) => <BadgeActivo activo={t.activa} /> },
      ]}
      campos={[
        { clave: 'nombre', etiqueta: 'Nombre', requerido: true, minLength: 2, maxLength: 120 },
        { clave: 'fecha_inicio', etiqueta: 'Fecha de inicio', tipo: 'fecha', requerido: true },
        { clave: 'fecha_fin', etiqueta: 'Fecha de fin', tipo: 'fecha', requerido: true },
        { clave: 'activa', etiqueta: 'Temporada activa', tipo: 'checkbox', soloEdicion: true },
      ]}
    />
  );
}
