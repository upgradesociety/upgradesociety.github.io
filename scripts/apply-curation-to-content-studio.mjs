import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const manifestPath = path.join(root, 'content-manager.project.json');

function die(message) {
  console.error(`[citizen-upgrade-change-set] ERROR: ${message}`);
  process.exit(1);
}

function findContentManager() {
  const candidates = [
    process.env.CONTENT_MANAGER_ROOT,
    path.join(process.env.HOME || '', 'AI-System/Projects/content-manager'),
    path.join(process.env.HOME || '', 'Documents/AI-System/Projects/content-manager'),
    path.join(process.env.HOME || '', 'Documents/projects/AI-System/Projects/content-manager'),
  ].filter(Boolean);
  return candidates.find(candidate => fs.existsSync(path.join(candidate, 'package.json')) && fs.existsSync(path.join(candidate, 'scripts/project-change-set.js')));
}

if (!fs.existsSync(manifestPath)) die(`Manifest not found: ${manifestPath}`);
const summary = process.argv.slice(2).join(' ').trim() || process.env.CONTENT_CHANGE_SUMMARY || '';
if (!summary) {
  die('A change summary is required. Example: npm run content:write -- "Reduce Start Here to the selected articles"');
}

const cmRoot = findContentManager();
if (!cmRoot) die('Content Manager V9 change-set runtime was not found. Set CONTENT_MANAGER_ROOT to the Content Manager project directory.');

const nodeWrapper = path.join(root, 'scripts/content-manager-node.sh');
if (!fs.existsSync(nodeWrapper)) die(`Content Manager Node wrapper not found: ${nodeWrapper}`);

const result = spawnSync(
  'bash',
  [nodeWrapper, path.join(cmRoot, 'scripts/project-change-set.js'), 'curation', manifestPath, '--summary', summary, '--actor', process.env.CONTENT_STUDIO_ACTOR || 'ai-system'],
  { cwd: root, env: { ...process.env, CONTENT_MANAGER_ROOT: cmRoot }, stdio: 'inherit' },
);
if (result.error) die(`Could not start Content Manager change set: ${result.error.message}`);
process.exit(result.status ?? 1);
