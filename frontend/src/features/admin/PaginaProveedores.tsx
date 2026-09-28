import { email } from '../../lib/validacion';
import { BadgeActivo } from '../../components/ui/Badges';
import { proveedoresService } from '../../services/organizacion.service';
import { claves } from '../../hooks/claves';
import type { Proveedor } from '../../types/domain';
import { CrudSimple } from './CrudSimple';

export default function PaginaProveedores() {
  return (
    <CrudSimple<Proveedor>
      titulo="Proveedores"
      descripcion="Empresas que suministran las prendas del catalogo."
      nombreSingular="Proveedor"
      claveCache={claves.proveedores}
      cargar={proveedoresService.listar}
      crear={(datos) => proveedoresService.crear(datos as Omit<Proveedor, 'id_proveedor'>)}
      actualizar={(id, datos) => proveedoresService.actualizar(id, datos)}
      eliminar={(id) => proveedoresService.eliminar(id)}
      idDe={(p) => p.id_proveedor}
      bajaLogica={(item) => item.activo}
      validar={(d) => (d.email?.trim() ? { email: email(d.email) } : {})}
      nuevo={{ nombre: '', contacto: '', telefono: '', email: '', activo: true }}
      columnas={[
        { titulo: 'Proveedor', render: (p) => p.nombre },
        { titulo: 'Contacto', render: (p) => p.contacto },
        { titulo: 'Telefono', render: (p) => p.telefono },
        { titulo: 'Email', render: (p) => <span className="fs-sub">{p.email}</span> },
        { titulo: 'Estado', render: (p) => <BadgeActivo activo={p.activo} /> },
      ]}
      campos={[
        { clave: 'nombre', etiqueta: 'Nombre', requerido: true, minLength: 2, maxLength: 150 },
        { clave: 'contacto', etiqueta: 'Persona de contacto', maxLength: 120 },
        { clave: 'telefono', etiqueta: 'Telefono', maxLength: 30 },
        { clave: 'email', etiqueta: 'Correo electronico', maxLength: 180 },
        { clave: 'activo', etiqueta: 'Proveedor activo', tipo: 'checkbox', soloEdicion: true },
      ]}
    />
  );
}
