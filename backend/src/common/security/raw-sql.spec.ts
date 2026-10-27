import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Las consultas SQL crudas no pasan por la extension de aislamiento de Prisma (F2.5): cada
 * una debe filtrar `id_empresa` con la empresa del contexto. Esta prueba revisa el codigo.
 */
const root = join(__dirname, '../..');
const sources = readdirSync(root, { recursive: true })
  .map(String)
  .filter(
    (f) =>
      f.endsWith('.ts') &&
      !f.endsWith('.spec.ts') &&
      !f.startsWith('generated'),
  )
  .map((file) => ({ file, text: readFileSync(join(root, file), 'utf8') }));
const TENANT_FILTER = /id_empresa = \$\{tenantContext\.requireTenantId\(\)\}/;
// Fragmentos reutilizables que ya incluyen el filtro de empresa (se verifica abajo).
const FILTERED_FRAGMENTS = [
  '${base}',
  '${this.salesBase(',
  '${this.salesLines(',
];

function rawQueries(text: string) {
  // Cada consulta va desde su llamada hasta la siguiente (o hasta 3000 caracteres).
  const starts = [
    ...text.matchAll(/\.\$(queryRaw|executeRaw)(<[\s\S]*?>)?`/g),
  ].map((m) => m.index + m[0].length);
  return starts.map((start, i) =>
    text.slice(start, Math.min(starts[i + 1] ?? Infinity, start + 3000)),
  );
}

describe('SQL crudo', () => {
  it('no se usan las variantes Unsafe ni Prisma.raw', () => {
    const unsafe = sources
      .filter(({ text }) =>
        /\$(query|execute)RawUnsafe|Prisma\.raw\(/.test(text),
      )
      .map((s) => s.file);
    expect(unsafe).toEqual([]);
  });

  it('cada consulta filtra la empresa directamente o mediante un fragmento filtrado', () => {
    const files = sources.filter(({ text }) => rawQueries(text).length);
    expect(files.map((f) => f.file).sort()).toEqual([
      'modules/ml/ml.repository.ts',
      'modules/reports/reports.repository.ts',
    ]);
    const unfiltered: string[] = [];
    for (const { file, text } of files)
      rawQueries(text).forEach((query, i) => {
        if (
          !TENANT_FILTER.test(query) &&
          !FILTERED_FRAGMENTS.some((f) => query.trimStart().startsWith(f))
        )
          unfiltered.push(`${file} #${i + 1}`);
      });
    expect(unfiltered).toEqual([]);
  });

  it('los fragmentos reutilizables incluyen el filtro de empresa', () => {
    const reports = sources.find(
      (s) => s.file === 'modules/reports/reports.repository.ts',
    )!.text;
    for (const builder of [
      'private salesBase(',
      'private salesLines(',
      'async cashShifts(',
      'async inventory(',
    ]) {
      const body = reports.slice(
        reports.indexOf(builder),
        reports.indexOf(builder) + 2500,
      );
      expect(TENANT_FILTER.test(body), builder).toBe(true);
    }
  });
});
