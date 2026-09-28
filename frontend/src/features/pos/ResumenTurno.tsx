import { fechaHora, moneda } from '../../lib/format';
import type { Turno } from '../../services/turnos.service';

export function ResumenTurno({ turno: t }: { turno: Turno }) {
  const importe = (n: number) => moneda(n, t.currency);
  return (
    <div className="fs-pila">
      <p>
        <strong>
          {t.branchName} · {t.registerName} · Turno #{t.id}
        </strong>
      </p>
      <p>
        {t.cashier} · Apertura: {fechaHora(t.openedAt)}
        {t.closedAt && ` · Cierre: ${fechaHora(t.closedAt)}`}
      </p>
      <dl className="fs-rejilla-form">
        {Object.entries({
          'Saldo inicial': t.openingCash,
          'Ventas en efectivo': t.cashTotal,
          Tarjeta: t.cardTotal,
          QR: t.qrTotal,
          Transferencia: t.transferTotal,
          'Total de ventas': t.totalSales,
          'Efectivo esperado': t.expectedCash,
        }).map(([label, value]) => (
          <div key={label}>
            <dt className="fs-sub">{label}</dt>
            <dd className="fs-nums" style={{ margin: 0 }}>
              {importe(value)}
            </dd>
          </div>
        ))}
      </dl>
      <p>
        {t.saleCount} ventas registradas. El efectivo esperado incluye el saldo inicial y las ventas
        en efectivo.
      </p>
      {t.countedCash !== null && (
        <>
          <p>
            Efectivo contado: <strong>{importe(t.countedCash)}</strong>
          </p>
          <p>
            Diferencia: <strong>{importe(t.difference ?? 0)}</strong> (
            {!t.difference ? 'Cuadrado' : t.difference < 0 ? 'Faltante' : 'Sobrante'})
          </p>
          {t.closingNote && <p>Observacion: {t.closingNote}</p>}
        </>
      )}
    </div>
  );
}
