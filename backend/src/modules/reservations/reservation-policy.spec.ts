import { reservationDeadline } from './reservation-policy.js';

describe('reservationDeadline', () => {
  it.each([
    ['2030-09-11T10:00:00-04:00', '2030-09-12T04:00:00.000Z'],
    ['2030-09-12T02:30:00Z', '2030-09-12T04:00:00.000Z'],
    ['2030-09-12T04:00:00Z', '2030-09-13T04:00:00.000Z'],
    ['2030-12-31T23:59:59-04:00', '2031-01-01T04:00:00.000Z'],
  ])('expires %s at the following Bolivian midnight', (input, expected) => {
    expect(
      reservationDeadline(new Date(input), 'America/La_Paz').toISOString(),
    ).toBe(expected);
  });
});
