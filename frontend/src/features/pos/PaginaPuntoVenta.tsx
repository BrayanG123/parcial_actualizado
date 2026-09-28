import { USAR_MOCKS } from '../../api/config';
import PaginaPuntoVentaDemo from './PaginaPuntoVentaDemo';
import PuntoVentaReal from './PuntoVentaReal';
export default function PaginaPuntoVenta() {
  return USAR_MOCKS ? <PaginaPuntoVentaDemo /> : <PuntoVentaReal />;
}
