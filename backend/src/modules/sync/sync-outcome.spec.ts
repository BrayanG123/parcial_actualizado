import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { classify, conflict } from './sync-outcome.js';
import { canonical, payloadHash } from './sync.service.js';

describe('sync outcome classification', () => {
  it('keeps explicit sync outcomes', () => {
    expect(classify(conflict('PRICE_CHANGED', 'cambio', { a: 1 }))).toEqual({
      status: 'CONFLICT',
      code: 'PRICE_CHANGED',
      message: 'cambio',
      detail: { a: 1 },
    });
  });

  it('maps errors of the reused sales and reservation services to codes', () => {
    expect(
      classify(
        new ConflictException(
          'Insufficient stock or invalid variant: product 1',
        ),
      ),
    ).toMatchObject({ status: 'CONFLICT', code: 'STOCK_INSUFFICIENT' });
    expect(
      classify(
        new BadRequestException('approximateTime must be in the future'),
      ),
    ).toMatchObject({ status: 'CONFLICT', code: 'RESERVATION_TIME_PASSED' });
    expect(
      classify(new ForbiddenException('A customer role is required')),
    ).toMatchObject({ status: 'REJECTED', code: 'ROLE_NOT_ALLOWED' });
    expect(
      classify(new BadRequestException(['x must be a number'])),
    ).toMatchObject({
      status: 'REJECTED',
      code: 'INVALID_DATA',
    });
  });

  it('never treats server failures as final', () => {
    expect(classify(new Error('db down')).status).toBe('ERROR');
    expect(classify(new InternalServerErrorException()).status).toBe('ERROR');
  });
});

describe('canonical payload hash', () => {
  it('does not depend on key order and ignores undefined values', () => {
    expect(canonical({ b: 1, a: [{ d: 2, c: 'x' }], z: undefined })).toBe(
      '{"a":[{"c":"x","d":2}],"b":1}',
    );
    expect(payloadHash({ b: 1, a: 2 })).toBe(payloadHash({ a: 2, b: 1 }));
    expect(payloadHash({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });
});
