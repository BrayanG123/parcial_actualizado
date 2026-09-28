import { ReservationStatus } from '../../generated/prisma/client.js';

export const expirableStatuses: ReservationStatus[] = [
  'PENDING',
  'PREPARING',
  'READY',
];
export const terminalStatuses: ReservationStatus[] = [
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
];
export const transitions: Record<ReservationStatus, ReservationStatus[]> = {
  PENDING: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['CUSTOMER_PRESENT', 'CANCELLED'],
  CUSTOMER_PRESENT: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  EXPIRED: [],
};

// Exclusive deadline: midnight immediately after the appointment's local day.
export function reservationDeadline(appointment: Date, timeZone: string): Date {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = (date: Date) =>
    Object.fromEntries(
      formatter.formatToParts(date).map(({ type, value }) => [type, value]),
    );
  const local = parts(appointment);
  const midnight = Date.UTC(
    Number(local.year),
    Number(local.month) - 1,
    Number(local.day) + 1,
  );
  let timestamp = midnight;
  for (let attempt = 0; attempt < 3; attempt++) {
    const wall = parts(new Date(timestamp));
    const wallTimestamp = Date.UTC(
      Number(wall.year),
      Number(wall.month) - 1,
      Number(wall.day),
      Number(wall.hour),
      Number(wall.minute),
      Number(wall.second),
    );
    timestamp += midnight - wallTimestamp;
  }
  return new Date(timestamp);
}
