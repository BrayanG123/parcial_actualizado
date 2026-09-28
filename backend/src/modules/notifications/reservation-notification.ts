import type { Prisma } from '../../generated/prisma/client.js';

export interface ReservationNoticeSource {
  id: number;
  branchId: number;
  approximateTime: Date;
  reservedAt: Date;
  items: Array<{ quantity: number }>;
}

// Call with the reservation's transaction so stock, reservation and notice commit
// together. A branch event survives periods with no assigned staff members.
export async function createReservationNotification(
  tx: Prisma.TransactionClient,
  reservation: ReservationNoticeSource,
) {
  const unitCount = reservation.items.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );
  if (!Number.isInteger(unitCount) || unitCount <= 0)
    throw new Error(
      'A reservation notification requires a positive unit count',
    );
  return tx.notification.createMany({
    data: [
      {
        branchId: reservation.branchId,
        reservationId: reservation.id,
        unitCount,
        approximateTime: reservation.approximateTime,
        createdAt: reservation.reservedAt,
      },
    ],
    skipDuplicates: true,
  });
}
