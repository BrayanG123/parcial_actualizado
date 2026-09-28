import { ErrorEstado } from '../../components/ui/Estados';
import { BadgeActivo } from '../../components/ui/Badges';
import { catalogoService } from '../../services/catalogo.service';
import { claves } from '../../hooks/claves';
import { useTemporadas } from '../../hooks/useCatalogo';
import type { Coleccion } from '../../types/domain';
import { CrudSimple } from './CrudSimple';

export default function PaginaColecciones() {
  const temporadas = useTemporadas();

  return (
    <CrudSimple<Coleccion>
      titulo="Colecciones"
      descripcion="Agrupaciones comerciales dentro de una temporada."
      nombreSingular="Coleccion"
      claveCache={claves.colecciones}
      cargar={catalogoService.listarColecciones}
      crear={(datos) => catalogoService.crearColeccion(datos as Omit<Coleccion, 'id_coleccion'>)}
      actualizar={(id, datos) => catalogoService.actualizarColeccion(id, datos)}
      eliminar={(id) => catalogoService.eliminarColeccion(id)}
      idDe={(c) => c.id_coleccion}
      bajaLogica={(item) => item.activa}
      bloquearFormulario={temporadas.isPending || temporadas.isError}
      estadoDependencias={
        temporadas.isError ? (
          <ErrorEstado error={temporadas.error} onReintentar={() => temporadas.refetch()} />
        ) : temporadas.isPending ? (
          <p>Cargando temporadas...</p>
        ) : null
      }
      validar={(d) =>
        d.activa !== false &&
        !temporadas.data?.some((t) => t.id_temporada === d.id_temporada && t.activa)
          ? { id_temporada: 'Selecciona una temporada activa' }
          : {}
      }
      nuevo={{ nombre: '', descripcion: '', activa: true, id_temporada: null }}
      columnas={[
        { titulo: 'Nombre', render: (c) => c.nombre },
        {
          titulo: 'Temporada',
          render: (c) =>
            temporadas.data?.find((t) => t.id_temporada === c.id_temporada)?.nombre ?? (
              <span className="fs-sub">Sin temporada</span>
            ),
        },
        { titulo: 'Estado', render: (c) => <BadgeActivo activo={c.activa} /> },
      ]}
      campos={[
        { clave: 'nombre', etiqueta: 'Nombre', requerido: true, minLength: 2, maxLength: 120 },
        { clave: 'descripcion', etiqueta: 'Descripcion', tipo: 'textarea' },
        {
          clave: 'id_temporada',
          etiqueta: 'Temporada',
          tipo: 'select',
          requerido: true,
          opciones:
            temporadas.data?.map((t) => ({
              valor: t.id_temporada,
              texto: t.nombre + (t.activa ? '' : ' (inactiva)'),
            })) ?? [],
        },
        { clave: 'activa', etiqueta: 'Coleccion activa', tipo: 'checkbox', soloEdicion: true },
      ]}
    />
  );
}
