#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataRoot = path.join(root, 'data');
const allowedExtensions = new Set(['.json', '.yaml', '.yml', '.toml']);

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(error => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });

  const files = [];

  for (const entry of entries) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory())
      files.push(...await walk(full));
    else if (entry.isFile())
      files.push(full);
  }

  return files;
}

const files = await walk(dataRoot);

const unsupported = files.filter(
  file => !allowedExtensions.has(path.extname(file).toLowerCase())
);

if (unsupported.length) {
  console.error('ERROR: unsupported file(s) found under Hugo data/.');
  console.error(
    'Hugo parses files in data/ as structured data; move non-data manifests outside this directory.'
  );

  for (const file of unsupported)
    console.error(`  ${path.relative(root, file)}`);

  process.exit(2);
}

console.log(
  `OK: Hugo data/ contains ${files.length} supported structured data file(s).`
);
