#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const contentRoot = path.join(root, 'content');
const apiBase = (process.env.CONTENT_MANAGER_API || 'http://192.168.1.247:45173/api').replace(/\/$/, '');
const command = process.argv[2] || 'check';
// CITIZEN-UPGRADE-WORKTREE-PUSH-GUARD
const worktreeRole = (await fs.readFile(path.join(root, '.citizen-upgrade-role'), 'utf8').catch(() => 'new')).trim();
if (command === 'push' && worktreeRole !== 'dev') {
  console.error(`Refusing Content Manager push from Upgrade Society worktree role: ${worktreeRole}. Only DEV may push.`);
  process.exit(3);
}

const dryRun = process.argv.includes('--dry-run');
const managedTypes = new Set(['Canonical page','Guide','Project page','Essay','Scenario','Research note','Manifesto','Field report','Legacy source','Article','Wiki Page','Post','Script','Video','Note']);

function parseScalar(raw) {
  const value = raw.trim();
  if (value === '') return '';
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null' || value === '~') return null;
  if (value === '[]') return [];
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    if (value.startsWith('"')) { try { return JSON.parse(value); } catch {} }
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value;
}
function parseYamlLite(text) {
  const data = {};
  let listKey = null;
  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith('#')) continue;
    const listMatch = rawLine.match(/^\s+-\s+(.*)$/);
    if (listMatch && listKey) { data[listKey].push(parseScalar(listMatch[1])); continue; }
    const match = rawLine.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!match) throw new Error(`Unsupported front matter line: ${rawLine}`);
    const [, key, rest = ''] = match;
    if (rest.trim() === '') { data[key] = []; listKey = key; }
    else { data[key] = parseScalar(rest); listKey = null; }
  }
  return data;
}
function quote(value) { return JSON.stringify(String(value)); }
function serializeYamlLite(data) {
  const lines = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      if (!value.length) lines.push(`${key}: []`);
      else { lines.push(`${key}:`); for (const item of value) lines.push(`  - ${quote(item)}`); }
    } else if (value === null) lines.push(`${key}: null`);
    else if (typeof value === 'boolean' || typeof value === 'number') lines.push(`${key}: ${value}`);
    else lines.push(`${key}: ${quote(value)}`);
  }
  return lines.join('\n');
}
function parseDocument(raw) {
  if (!raw.startsWith('---')) throw new Error('Managed Markdown must use YAML front matter (---).');
  const match = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/);
  if (!match) throw new Error('Invalid YAML front matter block.');
  return { data: parseYamlLite(match[1]), body: raw.slice(match[0].length) };
}
function renderDocument(data, body) { return `---\n${serializeYamlLite(data)}\n---\n\n${String(body || '').replace(/^\s+/, '')}`; }
function normalizeStatus(value, draft = false) { return (value ? String(value) : (draft ? 'draft' : 'published')).toLowerCase(); }
function publicationStatus(data) {
  if (data.publication_status) return String(data.publication_status).toLowerCase();
  return normalizeStatus(data.content_status || data.status, data.draft).toLowerCase() === 'published' ? 'published' : 'draft';
}
function workflowStage(data) {
  const explicit = String(data.workflow_stage || '').toLowerCase();
  if (['idea','drafting','editing','final'].includes(explicit)) return explicit;
  const status = publicationStatus(data);
  if (status === 'idea') return 'idea';
  if (['scheduled','published','archived'].includes(status)) return 'final';
  return 'drafting';
}
function listText(value) { return Array.isArray(value) ? value.join(', ') : (value == null ? null : String(value)); }
function sha256(text) { return crypto.createHash('sha256').update(String(text || '')).digest('hex'); }
function pageUrl(relativePath, data) {
  const base = process.env.CITIZEN_UPGRADE_BASE_URL || 'https://upgradesociety.org';
  if (data.url) return new URL(String(data.url).replace(/^\//,''), `${base}/`).toString();
  const clean = relativePath.replace(/^content\//,'').replace(/\.md$/,'').replace(/\/index$/,'').replace(/\/_index$/,'');
  return `${base}/${clean ? `${clean}/` : ''}`;
}
async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}
async function readPages() {
  const files = await walk(contentRoot);
  const pages = [];
  for (const file of files) {
    const raw = await fs.readFile(file, 'utf8');
    const parsed = parseDocument(raw);
    const rel = path.relative(root, file).split(path.sep).join('/');
    const isSection = path.basename(file) === '_index.md';
    const isManaged = Boolean(parsed.data.content_id || (!isSection && managedTypes.has(parsed.data.content_type)));
    pages.push({ file, rel, raw, data: parsed.data, body: parsed.body.replace(/^\s+/,''), isSection, isManaged });
  }
  return pages;
}
function relationParts(value) {
  const [type, ...rest] = String(value).split('|');
  return { type: type || 'related', to: rest.join('|') };
}
function validate(pages) {
  const errors = [];
  const ids = new Map();
  for (const page of pages.filter(p => p.isManaged)) {
    const d = page.data;
    if (!d.content_id) errors.push(`${page.rel}: managed page has no content_id`);
    if (!d.title) errors.push(`${page.rel}: managed page has no title`);
    if (!d.content_type) errors.push(`${page.rel}: managed page has no content_type`);
    if (d.content_id) {
      if (ids.has(d.content_id)) errors.push(`${page.rel}: duplicate content_id ${d.content_id} (also ${ids.get(d.content_id)})`);
      ids.set(d.content_id, page.rel);
    }
  }
  for (const page of pages.filter(p => p.isManaged)) {
    for (const rawRelation of page.data.relationships || []) {
      const relation = relationParts(rawRelation);
      if (!relation.to) errors.push(`${page.rel}: relationship must be type|content_id`);
      else if (!ids.has(relation.to)) errors.push(`${page.rel}: relationship target not found: ${relation.to}`);
    }
  }
  return errors;
}
async function api(method, endpoint, body) {
  const response = await fetch(`${apiBase}${endpoint}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`${method} ${endpoint}: ${response.status} ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}
async function findOne(resource, filter) {
  const query = new URLSearchParams({ filter: JSON.stringify(filter), range: JSON.stringify([0, 9]) });
  const rows = await api('GET', `/${resource}?${query}`);
  if (rows.length > 1) throw new Error(`${resource}: expected one record for ${JSON.stringify(filter)}, found ${rows.length}`);
  return rows[0] || null;
}
function itemPayload(page) {
  const d = page.data;
  return {
    content_id: String(d.content_id), title: String(d.title),
    content_status: normalizeStatus(d.content_status || d.status, d.draft),
    publication_status: publicationStatus(d),
    workflow_stage: workflowStage(d),
    canonical_md: page.body, body_md: page.body,
    content_type: String(d.content_type), primary_topic: d.primary_topic ? String(d.primary_topic) : null,
    language: d.language ? String(d.language) : 'en', series: listText(d.series),
    summary: d.description ? String(d.description) : null,
    privacy: d.privacy ? String(d.privacy) : 'public',
    cloud_allowed: ['private','secret'].includes(String(d.privacy || 'public')) ? 0 : 1,
    is_canonical: d.is_canonical ? 1 : 0,
    last_reviewed_at: d.last_reviewed ? String(d.last_reviewed) : null,
  };
}
function differs(current, payload) { return Object.entries(payload).some(([key, value]) => String(current?.[key] ?? '') !== String(value ?? '')); }
async function ensurePublication(item, page) {
  if (publicationStatus(page.data) !== 'published' || !page.data.published_at) return;
  const existing = await findOne('publications', { content_item_id: item.id, platform: 'Upgrade Society' });
  const now = new Date().toISOString();
  const payload = {
    content_item_id: item.id, external_url: pageUrl(page.rel, page.data), publication_status: 'published',
    title_used: page.data.title, content_snapshot: page.body, content_hash: sha256(page.body), format: 'web',
    source_type: 'hugo', visibility: 'public', last_synced_at: now,
    notes: `Upgrade Society source: ${page.rel}`, 
    published_at: new Date(`${page.data.published_at}T00:00:00Z`).toISOString(),
  };
  if (dryRun) return console.log(`[dry] publication ${existing ? 'update' : 'create'} ${page.data.content_id}`);
  if (existing) await api('PATCH', `/publications/${existing.id}`, payload); else await api('POST', '/publications', payload);
}
async function push(pages) {
  await api('GET', '/health');
  const ids = new Map();
  for (const page of pages.filter(p => p.isManaged)) {
    const payload = itemPayload(page);
    const existing = await findOne('content-items', { content_id: payload.content_id });
    let item = existing;
    if (!existing) {
      if (dryRun) { console.log(`[dry] create ${payload.content_id} ← ${page.rel}`); item = { id: -1, ...payload }; }
      else { item = await api('POST', '/content-items', { ...payload, version_change_note: `Imported from Upgrade Society: ${page.rel}` }); console.log(`created ${payload.content_id}`); }
    } else if (differs(existing, payload)) {
      if (dryRun) console.log(`[dry] update ${payload.content_id} ← ${page.rel}`);
      else { item = await api('PATCH', `/content-items/${existing.id}`, { ...payload, version_change_note: `Upgrade Society sync from ${page.rel}` }); console.log(`updated ${payload.content_id}`); }
    } else console.log(`unchanged ${payload.content_id}`);
    ids.set(payload.content_id, item);
    if (!dryRun || item.id !== -1) await ensurePublication(item, page);
  }
  if (dryRun) return;
  for (const page of pages.filter(p => p.isManaged)) {
    const from = ids.get(page.data.content_id);
    for (const rawRelation of page.data.relationships || []) {
      const relation = relationParts(rawRelation), to = ids.get(relation.to);
      if (!from || !to) continue;
      const existing = await findOne('content-relationships', { from_content_item_id: from.id, to_content_item_id: to.id, relationship_type: relation.type });
      if (!existing) { await api('POST', '/content-relationships', { from_content_item_id: from.id, to_content_item_id: to.id, relationship_type: relation.type, confidence: 1, notes: null }); console.log(`linked ${page.data.content_id} --${relation.type}--> ${relation.to}`); }
    }
  }
}
async function pull(pages) {
  await api('GET', '/health');
  for (const page of pages.filter(p => p.isManaged)) {
    const item = await findOne('content-items', { content_id: page.data.content_id });
    if (!item) { console.warn(`missing in Content Manager: ${page.data.content_id}`); continue; }
    const data = { ...page.data, title: item.title, content_status: item.content_status, publication_status: item.publication_status,
      content_type: item.content_type, primary_topic: item.primary_topic || page.data.primary_topic,
      description: item.summary || page.data.description, last_reviewed: item.last_reviewed_at || page.data.last_reviewed };
    const output = renderDocument(data, String(item.canonical_md || ''));
    if (dryRun) console.log(`[dry] pull ${page.data.content_id} → ${page.rel}`);
    else { await fs.writeFile(page.file, output, 'utf8'); console.log(`pulled ${page.data.content_id}`); }
  }
}

const pages = await readPages();
const errors = validate(pages);
if (errors.length) { console.error(errors.map(e => `ERROR ${e}`).join('\n')); process.exit(1); }
if (command === 'check') console.log(`OK: ${pages.filter(p => p.isManaged).length} managed Upgrade Society content pages; IDs and relationships are valid.`);
else if (command === 'push') await push(pages);
else if (command === 'pull') await pull(pages);
else { console.error('Usage: content-manager-sync.mjs check|push|pull [--dry-run]'); process.exit(2); }
