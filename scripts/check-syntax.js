// Runs `node --check` on every server-side and front-end script, including new modules.
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';

const rootFiles = ['server.js', 'script.js', 'notifications.js', 'profile-enhancements.js', 'sw.js'];
const dirs = ['src', 'middleware', 'lib', 'db', 'netlify'];

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

const files = [...rootFiles, ...dirs.flatMap(walk)];
for (const file of files) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
console.log(`Syntax OK (${files.length} files)`);
