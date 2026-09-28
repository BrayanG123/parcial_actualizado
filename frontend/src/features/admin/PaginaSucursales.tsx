import { BadgeActivo } from '../../components/ui/Badges';
import { sucursalesService } from '../../services/organizacion.service';
import { claves } from '../../hooks/claves';
import type { Sucursal } from '../../types/domain';
import { CrudSimple } from './CrudSimple';

export default function PaginaSucursales() {
  return (
    <CrudSimple<Sucursal>
      titulo="Sucursales"
      descripcion="Cada sucursal dispone de un almacen para su inventario y atiende reservas."
      nombreSingular="Sucursal"
      claveCache={[...claves.sucursales, 'admin']}
      cargar={sucursalesService.listarTodas}
      crear={(datos) => sucursalesService.crear(datos as Omit<Sucursal, 'id_sucursal'>)}
      actualizar={(id, datos) => sucursalesService.actualizar(id, datos)}
      eliminar={(id) => sucursalesService.eliminar(id)}
      idDe={(s) => s.id_sucursal}
      bajaLogica={(item) => item.activa}
      nuevo={{
        nombre_almacen: 'Almacen principal',
        nombre: '',
        ciudad: '',
        direccion: '',
        telefono: '',
        activa: true,
      }}
      columnas={[
        { titulo: 'Nombre', render: (s) => s.nombre },
        { titulo: 'Almacen', render: (s) => s.nombre_almacen ?? 'Almacen principal' },
        { titulo: 'Ciudad', render: (s) => s.ciudad },
        { titulo: 'Direccion', render: (s) => <span className="fs-sub">{s.direccion}</span> },
        { titulo: 'Telefono', render: (s) => s.telefono },
        { titulo: 'Estado', render: (s) => <BadgeActivo activo={s.activa} /> },
      ]}
      campos={[
        { clave: 'nombre', etiqueta: 'Nombre', requerido: true, minLength: 2, maxLength: 120 },
        {
          clave: 'nombre_almacen',
          etiqueta: 'Nombre del almacen',
          requerido: true,
          minLength: 2,
          maxLength: 120,
        },
        { clave: 'ciudad', etiqueta: 'Ciudad', requerido: true, minLength: 2, maxLength: 100 },
        {
          clave: 'direccion',
          etiqueta: 'Direccion',
          requerido: true,
          minLength: 5,
          maxLength: 250,
        },
        { clave: 'telefono', etiqueta: 'Telefono', maxLength: 30 },
        { clave: 'activa', etiqueta: 'Sucursal activa', tipo: 'checkbox', soloEdicion: true },
      ]}
    />
  );
}
