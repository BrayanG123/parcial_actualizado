import { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { ResponseInterceptor } from './response.interceptor.js';

describe('ResponseInterceptor', () => {
  it('wraps successful responses in the API envelope', async () => {
    const interceptor = new ResponseInterceptor<{ id: number }>();
    const handler: CallHandler<{ id: number }> = {
      handle: () => of({ id: 1 }),
    };

    const result = await firstValueFrom(
      interceptor.intercept({} as ExecutionContext, handler),
    );

    expect(result).toMatchObject({
      success: true,
      data: { id: 1 },
    });
    expect(new Date(result.timestamp).toString()).not.toBe('Invalid Date');
  });
});
