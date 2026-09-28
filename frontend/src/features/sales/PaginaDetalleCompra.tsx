import { Link, useParams } from "react-router-dom";
import { Cargando, ErrorEstado } from "../../components/ui/Estados";
import { useVenta } from "../../hooks/useComercio";
import { ComprobanteVenta } from "./ComprobanteVenta";
import { USAR_MOCKS } from "../../api/config";
import DetallePedido from "../checkout/DetallePedido";

export default function PaginaDetalleCompra() {
  const { id } = useParams();
  return USAR_MOCKS ? (
    <DetalleDemo />
  ) : (
    <div className="fs-contenedor fs-seccion fs-pila">
      <Link to="/mis-compras">Volver a mis compras</Link>
      <DetallePedido id={Number(id)} />
    </div>
  );
}

function DetalleDemo() {
  const { id } = useParams();
  const consulta = useVenta(Number(id));

  if (consulta.isPending) return <Cargando texto="Cargando comprobante..." />;
  if (consulta.isError)
    return (
      <ErrorEstado
        error={consulta.error}
        onReintentar={() => consulta.refetch()}
      />
    );

  return (
    <div className="fs-contenedor" style={{ paddingTop: 32 }}>
      <Link to="/mis-compras" className="fs-sub">
        &larr; Volver a mis compras
      </Link>
      <div className="fs-panel" style={{ marginTop: 16 }}>
        <ComprobanteVenta venta={consulta.data!} />
      </div>
    </div>
  );
}
