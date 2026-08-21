# Upgrade Society

## v1.3.9 — Citizen Upgrade author profile and publication metadata

Article bylines now identify **Citizen Upgrade** and link to `/about/citizen-upgrade/`, a short author profile that can be expanded later. Article pages and section listings also display a published date. Pages with an authoritative `published_at` value use it; projected pages without one currently use the temporary preparation date configured in `hugo.toml`.

The GitHub Pages workflow in `.github/workflows/hugo.yaml` builds the `new/` Hugo source and deploys it from `main`. Run `npm run build` before publishing to verify the deployable artifact.

## v1.3.7 — Start Here theme navigation

The left sidebar and desktop top navigation now use the same generated Content Studio theme categories as the Start Here index. The navigation is **Start Here → Quick Start → General → Co-Created Money → The World Now → Nation States → Cooperatives → Beyond Left and Right → About**. Theme links jump directly to the corresponding Start Here section, and article pages highlight their generated `citizen_upgrade_section`.

Because the menus read `data/citizen-upgrade-new-content.json`, category changes produced by the normal Content Studio projection flow automatically propagate into both menus instead of leaving legacy content-type links such as Essays, Guides, Ideas and Projects.

## v1.3.5 — legacy projection adoption + exact reconciliation


`npm run content:sync` performs an **exact projection reconciliation**: current Content Studio-curated items are created/updated in Hugo, and stale Content-Studio-managed Markdown files for items no longer in the curation are physically deleted. This matters for development because `hugo server -D` renders drafts; stale pages can no longer survive merely by being marked `draft: true`.

V1.3.4 also migrates legacy generated pages safely. Older Upgrade Society projections used the project-specific `citizen_upgrade_curated` front-matter field before `content_projection_source: content-manager` existed. The **presence** of `citizen_upgrade_curated` (whether `true` or `false`) is therefore accepted as legacy projection ownership. This lets exact sync prune old generated pages while still refusing to delete unrelated Markdown that has neither ownership marker.

All Upgrade Society commands that enter Content Studio now use `scripts/content-manager-node.sh`, which resolves the exact Node executable used by `content-studio.service`. `content:write` itself enters through that launcher, and Content Studio V9.2 propagates the same runtime to its child processes. This permanently avoids `better-sqlite3` ABI mismatches when the interactive HomeDev shell uses another Node version.

Upgrade Society is the public knowledge, writing and experimentation site for the Upgrade Society project. The website is a **publishing projection**; **Content Studio / Content Manager on HomeDev is the canonical authority for content, project curation, versions and publication records**.

## Runtime and repository layout

HomeDev project root:

```text
$HOME/AI-System/Projects/upgradesociety
```

Active Hugo source:

```text
$HOME/AI-System/Projects/upgradesociety/new
```

HomeDev preview:

```text
http://192.168.1.247:1321
```

The parent `citizenupgrade/` folder can be an independent Git repository. The `new/` directory is the current website source tracked by that repository.

A normal Drive `download.sh` refresh also installs the repository-root README, npm wrapper and GitHub Pages workflow from the `new/` source. To refresh those root controls manually:

```bash
npm run project:install-root
```

## Publishing identity

Citizen Upgrade is the public author identity for this release. Upgrade Society remains the project and website identity.

## v1.3.1 — Content Studio Node ABI alignment

Upgrade Society now resolves the Node binary used by `content-studio.service` before invoking shared Content Studio scripts. This prevents `better-sqlite3` ABI failures when the interactive HomeDev shell uses a different Node major. Set `CONTENT_MANAGER_NODE` only when an explicit override is required. Do not rebuild Content Studio native modules from an unrelated login-shell Node runtime.

## Authority model

```text
Content Studio / Content Manager
  ├─ content_items + content_versions
  ├─ publications + content_outlets
  ├─ Upgrade Society — Website collection
  │    ├─ membership
  │    ├─ category
  │    ├─ ordering
  │    ├─ featured state
  │    ├─ project slug
  │    └─ project presentation tags
  │
  └─ project projection engine
           ↓
     .content/content.json
           ↓
     Hugo Markdown projection
           ↓
     Upgrade Society Hugo
           ↓
     Git / GitHub Pages
```

**Do not create another canonical content database in this repository.**

## Stable identity

Upgrade Society keeps three identifiers explicit rather than conflating them:

- `content_manager_id` — the internal numeric `content_items.id` row in Content Studio. This is the exact local CM record reference.
- `content_id` — the stable canonical content identity used across Content Studio and integrated projects.
- `slug` — the Upgrade Society project/site route for the item.

The project contract still uses canonical `content_id` as its cross-project identity:

```json
{
  "content_authority": {
    "id_field": "content_id"
  }
}
```

PQA Custom and Upgrade Society both use canonical `content_id`; active Content Studio project identity is standardized on `content_id` everywhere. The internal `content_manager_id` is exported alongside it for traceability, not as a replacement identity.

## Project files

- `content-manager.project.json` — project contract, outlet and generated artifact declaration.
- `content.view.json` — presentation-only settings.
- `content.bootstrap.json` — Upgrade Society website curation desired state: the focused Start Here selection, thematic category, order, featured/Quick Start state, project slug and presentation tags. Editing it is only a pending proposal until `content:write` completes a Content Studio + Git change set.
- `.content/content.json` — generated local projection from Content Studio. It is intentionally gitignored because it can contain unpublished canonical Markdown.
- `scripts/content-sync.sh` — calls the shared Content Studio project exporter.
- `scripts/apply-curation-to-content-studio.mjs` — thin wrapper around Content Studio V9 `project-change-set.js`; it no longer writes SQLite directly.
- `scripts/apply-content-projection.mjs` — applies the generated projection to Hugo Markdown while preserving local presentation front matter.

## Normal content workflow

Check projection/binding state:

```bash
npm run content:status
```

Generate the local JSON projection from Content Studio:

```bash
npm run content:pull
```

Apply the projection to Hugo pages:

```bash
npm run content:apply
```

Refresh the site **from Content Studio without mutating canonical state**:

```bash
npm run content:sync
```

To change project curation, edit `content.bootstrap.json`, then commit the logical change through the V9 change-set boundary:

```bash
npm run content:write -- "Reduce Start Here to the selected articles"
```

That single command must complete all of these phases before it reports success:

```text
content.bootstrap.json proposal
  -> Content Studio curation transaction
  -> project export
  -> Hugo apply
  -> Hugo verification
  -> Git commit with Change-Set trailer
  -> Git SHA recorded in Content Studio project_change_sets
```

`content:curation:apply` is retained as an alias for `content:write` and also requires a summary. A failed change set is recorded as failed/rolled back rather than being mistaken for a completed write.

Verify committed Hugo pages against the latest local projection:

```bash
npm run content:verify
```

If a generated JSON artifact is deliberately edited locally, commit allowed canonical title/body/workflow changes **through Content Studio first**:

```bash
npm run content:commit
```

Publication and schedule changes are never accepted from generated project JSON; change them in Content Studio.


## Focused Start Here curation

Upgrade Society currently exposes **19 core content pieces**, plus the canonical About page. The five items with `featured: true` in `content.bootstrap.json` form **Quick Start**. The core thematic categories are **General**, **Co-Created Money**, **The World Now**, **Nation States**, **Cooperatives**, and **Beyond Left and Right**.

Items removed from Upgrade Society curation are not deleted from Content Studio. Their canonical history remains available, while the Hugo copies are marked uncurated/draft so they cannot leak back into Start Here.

## Publication behavior

The projection includes:

- `content_manager_id` — exact internal Content Studio row ID
- `content_id` — stable canonical identity
- `slug` — Upgrade Society route identity
- `first_published_at` — Content Studio first-published timestamp, falling back to the earliest known publication record when needed
- `current_version_id`, `created_at`, and `updated_at` for provenance/version traceability
- canonical title/body and workflow state
- Upgrade Society category/order/featured metadata
- all known publication records
- project publication URL/date/status when a Upgrade Society outlet record exists
- a fallback to the canonical item publication status when a project publication record has not yet been created

When applying the projection, a page is `draft: false` only when the Upgrade Society project publication state is `published` and its privacy is not private/secret. Project items removed from the Content Studio collection are pruned from the Hugo `content/` projection when the file is marked as Content Studio-managed (`content_projection_source: content-manager` or `citizen_upgrade_curated: true`). Unmanaged Markdown is preserved and reported as a conflict instead of being silently deleted.

## Legacy sync

The older page-level API push/pull implementation remains available temporarily for migration/debugging:

```bash
npm run content:legacy:pull
npm run content:legacy:push:dry
npm run content:legacy:push
```

It is **not** the normal architecture anymore. Normal project writes go through a V9 change set; a write is not complete until the Content Studio state and the corresponding Git commit are linked by the same `change_set_id`.

## HomeDev development

Run the site manually:

```bash
cd $HOME/AI-System/Projects/upgradesociety/new
hugo server -D --bind 0.0.0.0 --port 1321
```

The managed HomeDev service may run the same source continuously for Home OS and other devices.

## Google Drive synchronization

The AI System Drive project remains the snapshot/transport layer. `citizenupgrade-new.zip` carries the current `new/` website source. The download flow backs up the prior HomeDev/Mac state before replacement and preserves Git/environment state where configured.

Google Drive is **not** the content authority:

```text
Content Studio = canonical content + curation + publications
Google Drive    = AI-accessible project/snapshot transport
Git/GitHub      = source history + public deployment
HomeDev         = active runtime/development host
```

## GitHub deployment

The independent Git repository should be rooted at:

```text
$HOME/AI-System/Projects/upgradesociety
```

The GitHub Pages workflow at repository root builds the Hugo site from `new/` and deploys `new/public/` from `main`.

Before public deployment, review:

```bash
cd $HOME/AI-System/Projects/upgradesociety/new
npm run content:status
npm run content:verify
hugo --minify
```

The generated `.content/content.json` must remain uncommitted because it may contain unpublished bodies.

## Public site

Current deployment identity:

```text
https://upgradesociety.org
```

The public domain/account can later change without changing the Content Studio authority model.

## Canonical references

- Upgrade Society LifeOS project: `prj_a1675ed158585273826ab394075aedc1`
- Content Studio owns canonical content identity, Markdown versions, project curation, editorial state and publication records.
- Upgrade Society Hugo owns website structure, templates, styling and deployment source.


## v1.3.5 — full-site projection reconciliation

`content:sync` now regenerates managed article Markdown, `content/start/_index.md`, the homepage curated lists, `content.view.json` quick-start IDs, and compatibility data from the same `.content/content.json` export. Navigation/index pages can no longer retain removed content after the article file is pruned.
