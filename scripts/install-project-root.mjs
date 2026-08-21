#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.dirname(sourceRoot);
if (path.basename(sourceRoot) !== 'new') {
  console.log(`Upgrade Society source is not named new/; root integration skipped (${sourceRoot}).`);
  process.exit(0);
}

const copies = [
  [path.join(sourceRoot, 'README.md'), path.join(projectRoot, 'README.md')],
  [path.join(sourceRoot, 'deploy', 'root-package.json'), path.join(projectRoot, 'package.json')],
  [path.join(sourceRoot, 'deploy', 'github-root-hugo.yaml'), path.join(projectRoot, '.github', 'workflows', 'hugo.yaml')],
];
for (const [from, to] of copies) {
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.copyFile(from, to);
  console.log(`installed ${path.relative(projectRoot, to)}`);
}
console.log(`Upgrade Society repository-root integration is ready at ${projectRoot}`);
