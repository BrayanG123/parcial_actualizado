import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { fecha } from '../../lib/format';
import { perfilService } from '../../services/perfil.service';

/** Datos propios: nombre para cualquier cuenta; telefono y direccion para clientes. */
export default function PaginaPerfil() {
  const { usuario, esCliente, actualizarUsuario } = useAuth();
  const toast = useToast();
  const [datos, setDatos] = useState(() => ({
    nombre: usuario?.nombre ?? '',
    telefono: usuario?.telefono ?? '',
    direccion: usuario?.direccion ?? '',
  }));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!usuario) return null;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      actualizarUsuario(await perfilService.actualizar(datos, esCliente));
      toast.exito('Tus datos se actualizaron.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos guardar tus datos.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fs-contenedor fs-seccion" style={{ maxWidth: 640 }}>
      <p className="fs-eyebrow">Mi cuenta</p>
      <h1>Mi perfil</h1>
      <p className="fs-sub">
        {usuario.email} - cuenta creada el {fecha(usuario.fecha_registro)}
        {usuario.mayorista ? ' - cliente mayorista' : ''}
      </p>

      <form className="fs-tarjeta fs-tarjeta--pad fs-pila" onSubmit={guardar} style={{ marginTop: 16 }}>
        <div className="fs-campo">
          <label htmlFor="perfil-nombre">Nombre completo</label>
          <input
            id="perfil-nombre"
            className="fs-input"
            maxLength={120}
            value={datos.nombre}
            onChange={(e) => setDatos((d) => ({ ...d, nombre: e.target.value }))}
          />
        </div>
        {esCliente && (
          <>
            <div className="fs-campo">
              <label htmlFor="perfil-telefono">Telefono</label>
              <input
                id="perfil-telefono"
                className="fs-input"
                inputMode="tel"
                maxLength={30}
                value={datos.telefono}
                onChange={(e) => setDatos((d) => ({ ...d, telefono: e.target.value }))}
              />
            </div>
            <div className="fs-campo">
              <label htmlFor="perfil-direccion">Direccion</label>
              <textarea
                id="perfil-direccion"
                className="fs-input"
                rows={3}
                maxLength={250}
                value={datos.direccion}
                onChange={(e) => setDatos((d) => ({ ...d, direccion: e.target.value }))}
              />
              <span className="fs-campo-ayuda">Se usa como sugerencia para las compras con entrega.</span>
            </div>
          </>
        )}
        <p className="fs-campo-ayuda">
          Para cambiar tu correo o contrasena, comunicate con la tienda.
        </p>
        {error && <span className="fs-campo-error">{error}</span>}
        <div className="fs-fila-wrap">
          <button type="submit" className="fs-btn fs-btn--acento" disabled={guardando}>
            {guardando ? 'Guardando...' : 'Guardar cambios'}
          </button>
          {esCliente && (
            <>
              <Link to="/mis-compras" className="fs-btn fs-btn--contorno">
                Mis compras
              </Link>
              <Link to="/mis-reservas" className="fs-btn fs-btn--contorno">
                Mis reservas
              </Link>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
