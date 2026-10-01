// Validate every JavaScript module that actually exists in the current refactor.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const rootFiles = ['server.js'];
const dirs = ['src', 'middleware', 'lib', 'db', 'netlify'];

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

const files = [...rootFiles.filter(file => existsSync(path.join(root, file))), ...dirs.flatMap(dir => walk(path.join(root, dir)))];
for (const file of files) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
console.log(`Syntax OK (${files.length} files)`);
