import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { plataformaService } from '../../services/plataforma.service';
import { ErrorApi } from '../../types/api';

/** Login del administrador de plataforma: sesion separada de la de las tiendas. */
export default function PaginaPlataformaLogin() {
  const navegar = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true);
    setError('');
    try {
      await plataformaService.login(email, password);
      navegar('/plataforma', { replace: true });
    } catch (err) {
      setError(err instanceof ErrorApi ? err.mensajes.join(' ') : 'No pudimos iniciar sesion.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fs-auth">
      <aside className="fs-auth__lado">
        <p className="fs-marca" style={{ color: '#fff' }}>
          Fashion<span style={{ color: 'var(--fs-oro)' }}>Store</span> SaaS
        </p>
        <h2>Administracion de la plataforma</h2>
        <p style={{ color: 'rgba(250,247,243,.8)', maxWidth: '38ch' }}>
          Empresas contratantes, planes y suscripciones.
        </p>
      </aside>
      <div className="fs-auth__form">
        <form className="fs-auth__caja" onSubmit={enviar} noValidate>
          <div>
            <p className="fs-eyebrow">Plataforma</p>
            <h1>Iniciar sesion</h1>
          </div>
          {error && <div className="fs-alerta fs-alerta--error">{error}</div>}
          <div className="fs-campo">
            <label htmlFor="pemail">Correo electronico</label>
            <input id="pemail" type="email" className="fs-input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="fs-campo">
            <label htmlFor="ppassword">Contrasena</label>
            <input
              id="ppassword"
              type="password"
              className="fs-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" className="fs-btn fs-btn--acento fs-btn--bloque" disabled={enviando || !email || !password}>
            {enviando ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}
