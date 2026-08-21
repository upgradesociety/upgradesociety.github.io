#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contentRoot = path.join(root, 'content');
const projectionPath = path.join(root, '.content', 'content.json');
const mode = process.argv[2] || 'check';
if (!['check', 'apply'].includes(mode)) {
  console.error('Usage: apply-content-projection.mjs check|apply');
  process.exit(2);
}

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
  const match = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/);
  if (!match) throw new Error('Managed Markdown must use YAML front matter.');
  return { data: parseYamlLite(match[1]), body: raw.slice(match[0].length) };
}
function renderDocument(data, body) {
  return `---\n${serializeYamlLite(data)}\n---\n\n${String(body || '').replace(/^\s+/, '')}`;
}
async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(full);
  }
  return files;
}
function normalizeSlug(value, fallback) {
  let slug = String(value || fallback || '').trim().replace(/^\/+|\/+$/g, '').replace(/\.md$/i, '');
  if (!slug) throw new Error(`Missing project slug for ${fallback || 'content item'}`);
  if (slug.includes('..')) throw new Error(`Unsafe project slug: ${slug}`);
  return slug;
}
function projectStatus(item) {
  return String(item.project_publication_status || item.publication_status || 'draft').toLowerCase();
}
function isPublic(item) {
  const privacy = String(item.privacy || 'public').toLowerCase();
  return !['private', 'secret'].includes(privacy);
}
function siteRole(item) {
  const raw = (item.tags || []).find(tag => String(tag).startsWith('site-role:'));
  return raw ? String(raw).slice('site-role:'.length) : null;
}
function siteTitle(item) {
  const raw = (item.tags || []).find(tag => String(tag).startsWith('site-title:'));
  return raw ? String(raw).slice('site-title:'.length).trim() : null;
}

let projection;
try { projection = JSON.parse(await fs.readFile(projectionPath, 'utf8')); }
catch (error) {
  console.error(`ERROR: generated projection not found or invalid: ${projectionPath}`);
  console.error('Run npm run content:pull first.');
  process.exit(2);
}
if (projection.identity_field !== 'content_id') {
  console.error(`ERROR: expected content_id projection identity, got ${projection.identity_field || '(missing)'}`);
  process.exit(2);
}

const items = Array.isArray(projection.items) ? projection.items : [];
const projected = new Map(items.map(item => [String(item.content_id || '').trim(), item]).filter(([id]) => id));
if (!projected.size) {
  console.error('ERROR: projection contains no Upgrade Society content items.');
  process.exit(2);
}

const files = await walk(contentRoot);
const existing = new Map();
for (const file of files) {
  if (path.basename(file) === '_index.md') continue;
  const raw = await fs.readFile(file, 'utf8');
  if (!raw.startsWith('---')) continue;
  const parsed = parseDocument(raw);
  const id = String(parsed.data.content_id || '').trim();
  if (id) existing.set(id, { file, raw, ...parsed });
}

const planned = [];
for (const [contentId, item] of projected) {
  const current = existing.get(contentId) || null;
  const slug = normalizeSlug(item.slug, contentId);
  const file = current?.file || path.join(contentRoot, `${slug}.md`);
  const data = { ...(current?.data || {}) };
  data.content_id = contentId;
  data.title = siteTitle(item) || item.title || data.title || contentId;
  if (item.summary != null) data.description = item.summary;
  if (item.content_type) data.content_type = item.content_type;
  if (item.content_status) data.content_status = item.content_status;
  data.publication_status = projectStatus(item);
  if (item.workflow_stage) data.workflow_stage = item.workflow_stage;
  if (item.primary_topic) data.primary_topic = item.primary_topic;
  if (item.language) data.language = item.language;
  if (item.privacy) data.privacy = item.privacy;
  data.citizen_upgrade_section = item.category || 'Uncategorized';
  data.citizen_upgrade_curated = true;
  const role = siteRole(item);
  if (role) data.site_role = role;
  if (data.toc === undefined) data.toc = true;
  data.draft = !(projectStatus(item) === 'published' && isPublic(item));
  if (item.project_published_at) data.published_at = String(item.project_published_at).slice(0, 10);
  data.content_projection_source = 'content-manager';
  const body = item.body_markdown == null ? (current?.body || '') : item.body_markdown;
  const output = renderDocument(data, body);
  if (!current || output !== current.raw) planned.push({ kind: current ? 'update' : 'create', contentId, file, output });
}

for (const [contentId, current] of existing) {
  if (projected.has(contentId)) continue;

  // The Hugo content tree is a publishing projection of Content Studio.
  // When an item is removed from the authoritative curation, stale managed
  // Markdown must disappear entirely. Merely setting draft=true is not enough:
  // `hugo server -D` intentionally renders drafts.
  const managedByProjection =
    current.data.content_projection_source === 'content-manager' ||
    Object.prototype.hasOwnProperty.call(current.data, 'citizen_upgrade_curated');

  if (managedByProjection) {
    planned.push({ kind: 'delete', contentId, file: current.file });
    continue;
  }

  // Never silently delete a file that does not carry projection ownership.
  // Surface it as a conflict instead so a human can decide what it is.
  planned.push({ kind: 'conflict', contentId, file: current.file });
}

function markdownTitle(item) {
  return siteTitle(item) || item.title || item.content_id || 'Untitled';
}
function itemUrl(item) {
  return `/${normalizeSlug(item.slug, item.content_id)}/`;
}
function itemSummary(item) {
  return String(item.summary || '').trim();
}
function renderMarkdownItem(item) {
  const summary = itemSummary(item);
  return `- **[${markdownTitle(item)}](${itemUrl(item)})**${summary ? ` — ${summary}` : ''}`;
}
function sectionGroups(items) {
  const groups = new Map();
  for (const item of items) {
    const category = String(item.category || 'Uncategorized').trim() || 'Uncategorized';
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(item);
  }
  return groups;
}
const sectionDescriptions = {
  'General': 'Orientation pieces for understanding Upgrade Society and the transition it explores.',
  'Co-Created Money': 'Money creation, universal dividends, Ğ1 and experiments in human-centered monetary systems.',
  'The World Now': 'Diagnosis of the pressures shaping everyday life: money, work, generational change, conflict and institutional strain.',
  'Nation States': 'How nation-states, public finance and large-scale political order may change through the coming transition.',
  'Cooperatives': 'Cooperatives, upgraded communities, hubs and local economic institutions that can be built in practice.',
  'Beyond Left and Right': 'Political and economic ideas that do not fit neatly inside the inherited socialism-versus-capitalism divide.',
  'About': 'About Upgrade Society, editorial provenance and publishing architecture.'
};
function renderStartIndex(items) {
  const featured = items.filter(item => Boolean(item.featured));
  const groups = sectionGroups(items);
  const lines = [
    '---',
    'title: Start Here',
    'description: "The central index to Upgrade Society: begin with the present situation, then explore the ideas, systems and tools that could improve it."',
    'kicker: Index',
    '---',
    '',
    '## Quick Start',
    '',
    `${featured.length} pieces give the fastest route into Upgrade Society.`,
    '',
    ...featured.map(renderMarkdownItem),
    ''
  ];
  for (const [category, categoryItems] of groups) {
    lines.push(`## ${category}`, '');
    if (sectionDescriptions[category]) lines.push(sectionDescriptions[category], '');
    lines.push(...categoryItems.map(renderMarkdownItem), '');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}
function htmlEscape(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}
function renderHtmlItem(item) {
  const summary = itemSummary(item);
  return `<a class="journal-row" href="${htmlEscape(itemUrl(item))}"><span><strong>${htmlEscape(markdownTitle(item))}</strong>${summary ? `<small>${htmlEscape(summary)}</small>` : ''}</span><span aria-hidden="true">→</span></a>`;
}
function renderRootIndex(items) {
  const featured = items.filter(item => Boolean(item.featured));
  const groups = sectionGroups(items);
  const lines = [
    '---',
    'title: Upgrade Society',
    'description: Upgrade Society is a collection of essays, guides, ideas and projects about personal growth, civic responsibility and social improvement. It is a space to think clearly, act intentionally and contribute to a world that works better for everyone.',
    'kicker: Welcome',
    'hero_title: Thoughts on becoming better citizens and building a better society.',
    `hero_line: We don't need to be perfect to make progress. We just need to be willing.`,
    'hero_image: /images/home.jpg',
    'hero_alt: An imaginative optimistic world combining community life, clean energy, transport and technology.',
    'redirect: /start/',
    '---',
    '',
    '<!-- CITIZEN-UPGRADE-CURATED:START -->',
    '',
    '## Quick Start',
    '',
    `${featured.length} pieces give the fastest route into Upgrade Society.`,
    '',
    '<div class="journal-list curated-reading-list">',
    ...featured.map(renderHtmlItem),
    '</div>',
    ''
  ];
  for (const [category, categoryItems] of groups) {
    lines.push(`## ${category}`, '');
    if (sectionDescriptions[category]) lines.push(sectionDescriptions[category], '');
    lines.push('<div class="journal-list curated-reading-list">', ...categoryItems.map(renderHtmlItem), '</div>', '');
  }
  lines.push('<!-- CITIZEN-UPGRADE-CURATED:END -->', '');
  return lines.join('\n');
}
async function planAuxiliaryFile(file, output, label) {
  const current = await fs.readFile(file, 'utf8').catch(() => null);
  if (current !== output) planned.push({ kind: current == null ? 'create' : 'update', contentId: label, file, output });
}
async function planDerivedProjectionFiles(items) {
  const featuredIds = items.filter(item => Boolean(item.featured)).map(item => String(item.content_id));
  await planAuxiliaryFile(path.join(contentRoot, 'start', '_index.md'), renderStartIndex(items), '@start-here');
  await planAuxiliaryFile(path.join(contentRoot, '_index.md'), renderRootIndex(items), '@homepage');

  const viewPath = path.join(root, 'content.view.json');
  const view = JSON.parse(await fs.readFile(viewPath, 'utf8'));
  view.site = view.site || {};
  view.site.quick_start = featuredIds;
  await planAuxiliaryFile(viewPath, `${JSON.stringify(view, null, 2)}\n`, '@content-view');

  const compatPath = path.join(root, 'data', 'citizen-upgrade-new-content.json');
  const sections = [...sectionGroups(items)].map(([name, sectionItems], index) => ({
    name,
    description: sectionDescriptions[name] || '',
    items: sectionItems.map((item, itemIndex) => ({
      content_id: String(item.content_id),
      title: markdownTitle(item),
      description: itemSummary(item),
      site_role: siteRole(item),
      featured: Boolean(item.featured),
      sort_order: item.sort_order ?? itemIndex + 1,
      slug: normalizeSlug(item.slug, item.content_id),
      url: itemUrl(item)
    })),
    sort_order: index + 1
  }));
  const compat = {
    generated_from: '.content/content.json',
    generated_by: 'scripts/apply-content-projection.mjs',
    name: 'Upgrade Society — Content Studio Projection',
    quick_start: featuredIds,
    sections,
    items: items.map(item => ({
      content_id: String(item.content_id),
      title: markdownTitle(item),
      description: itemSummary(item),
      category: item.category || 'Uncategorized',
      featured: Boolean(item.featured),
      slug: normalizeSlug(item.slug, item.content_id),
      url: itemUrl(item)
    }))
  };
  await planAuxiliaryFile(compatPath, `${JSON.stringify(compat, null, 2)}\n`, '@compat-data');
}

await planDerivedProjectionFiles(items);

if (mode === 'check') {
  if (!planned.length) {
    console.log(`OK: ${projected.size} projected Upgrade Society items match Hugo content.`);
    process.exit(0);
  }
  console.error(`OUT OF SYNC: ${planned.length} Hugo content change(s) are required.`);
  for (const change of planned) console.error(`  ${change.kind.padEnd(7)} ${change.contentId} -> ${path.relative(root, change.file)}`);
  console.error('Run npm run content:apply after reviewing Content Studio project curation/publication state.');
  process.exit(2);
}

const conflicts = planned.filter(change => change.kind === 'conflict');
if (conflicts.length) {
  console.error('ERROR: stale Hugo file(s) are not marked as Content Studio-managed; refusing to delete them:');
  for (const change of conflicts) {
    console.error(`  conflict ${change.contentId} -> ${path.relative(root, change.file)}`);
  }
  process.exit(2);
}

for (const change of planned) {
  if (change.kind === 'delete') {
    await fs.unlink(change.file);
    console.log(`${change.kind.padEnd(7)} ${change.contentId} -> ${path.relative(root, change.file)}`);
    continue;
  }
  await fs.mkdir(path.dirname(change.file), { recursive: true });
  await fs.writeFile(change.file, change.output, 'utf8');
  console.log(`${change.kind.padEnd(7)} ${change.contentId} -> ${path.relative(root, change.file)}`);
}
console.log(`Applied exact Content Studio projection: ${projected.size} curated items, ${planned.length} file change(s).`);
