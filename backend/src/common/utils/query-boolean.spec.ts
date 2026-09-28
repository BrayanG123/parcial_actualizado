import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ListProductsQueryDto } from '../../modules/catalog/products/dto/list-products-query.dto.js';
import { ListBranchesQueryDto } from '../../modules/branches/dto/list-branches-query.dto.js';
import { ListUsersQueryDto } from '../../modules/users/dto/list-users-query.dto.js';

describe.each([ListProductsQueryDto, ListBranchesQueryDto, ListUsersQueryDto])(
  '%s active query',
  (Dto) => {
    // Preserve tsc's production metadata even when the test transpiler omits it.
    Reflect.defineMetadata('design:type', Boolean, Dto.prototype, 'active');
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    });
    const parse = (query: object) =>
      pipe.transform(query, { type: 'query', metatype: Dto });

    it.each([
      ['false', false],
      ['true', true],
      [false, false],
      [true, true],
    ])('parses %s as %s', async (input, expected) => {
      expect((await parse({ active: input })).active).toBe(expected);
    });
    it('preserves an omitted filter', async () =>
      expect((await parse({})).active).toBeUndefined());
    it.each(['yes', '0', '', ['false', 'true']])(
      'rejects malformed query %j',
      async (input) => {
        await expect(parse({ active: input })).rejects.toThrow(
          BadRequestException,
        );
      },
    );
  },
);
