import { cp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist);
for (const entry of ['index.html', 'styles.css', 'manifest.webmanifest', 'js', 'icons', 'audio']) await cp(join(root, entry), join(dist, entry), { recursive: true });
const paths = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else paths.push(path.slice(dist.length + 1));
  }
}
await walk(dist);
paths.sort();
const template = await readFile(join(root, 'sw.js'), 'utf8');
const hash = createHash('sha256').update(template);
for (const path of paths) hash.update(path).update(await readFile(join(dist, path)));
const version = hash.digest('hex').slice(0, 14);
const core = ['./', ...paths.filter(path => !path.endsWith('.mp3')).map(path => `./${path}`)];
await writeFile(join(dist, 'sw.js'), template.replace('__BUILD__', version).replace('__CORE__', JSON.stringify(core)));
await writeFile(join(dist, 'version.json'), JSON.stringify({ version }) + '\n');
await writeFile(join(dist, '_headers'), `/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: same-origin\n  Permissions-Policy: microphone=(), camera=(), midi=(self)\n  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'\n/sw.js\n  Cache-Control: no-cache\n/index.html\n  Cache-Control: no-cache\n/version.json\n  Cache-Control: no-cache\n`);
console.log(`Built ${paths.length + 3} files to ${resolve(dist)}\nRelease ${version}`);
