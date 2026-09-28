import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../dist/', import.meta.url));
async function files(dir) {
  return (
    await Promise.all(
      (await readdir(dir, { withFileTypes: true })).map((e) =>
        e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)],
      ),
    )
  ).flat();
}
const urls = (await files(root))
  .filter((p) => !p.endsWith('sw.js'))
  .map((p) => '/' + path.relative(root, p).replaceAll('\\', '/'))
  .sort();
const version = createHash('sha256').update(JSON.stringify(urls)).digest('hex').slice(0, 16);
const code = (await readFile(new URL('./sw-template.js', import.meta.url), 'utf8'))
  .replace('__CACHE__', `fashionstore-${version}`)
  .replace('__ASSETS__', JSON.stringify(urls));
await writeFile(path.join(root, 'sw.js'), code);
process.stdout.write(`PWA: ${urls.length} archivos precargados, version ${version}\n`);
