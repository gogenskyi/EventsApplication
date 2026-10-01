import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.webmanifest'), 'utf8'));
assert.equal(manifest.display, 'standalone', 'PWA must open without browser chrome');
assert.ok(manifest.scope === '/', 'PWA scope must include the full site');
assert.ok(manifest.icons.length >= 2, 'PWA needs install icons');

for (const icon of manifest.icons) {
  const file = path.join(root, icon.src.replace(/^\//, ''));
  const data = await readFile(file);
  assert.deepEqual([...data.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${icon.src} must be a PNG`);
  const [width, height] = icon.sizes.split('x').map(Number);
  assert.equal(data.readUInt32BE(16), width, `${icon.src} width must match the manifest`);
  assert.equal(data.readUInt32BE(20), height, `${icon.src} height must match the manifest`);
}

console.log(`PWA manifest and ${manifest.icons.length} install icons are valid.`);
