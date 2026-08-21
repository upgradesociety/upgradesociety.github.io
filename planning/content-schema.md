# Upgrade Society content contract

Content Studio is authoritative for substantive Upgrade Society content. Hugo is a publication surface.

## Required front matter

Every managed page must have:

- `content_id` — permanent identity; never reuse it for another work;
- `title`;
- `content_type`;
- `content_status`;
- `publication_status`;
- `identity`;
- `author` when individually authored;
- `date` and `last_reviewed` when applicable.

Recommended fields include `description`, `primary_topic`, `topics`, `series`, `privacy`, `is_canonical`, and `relationships`. Add `published_at` only when the page has actually gone live; that is what creates/updates the Content Studio `publications` record.

## Relationships

```yaml
relationships:
  - "practical-guide|cu-guide-example"
  - "evidence|cu-research-example"
```

The sync command resolves both content IDs to the Content Studio database and creates `content_relationships`. The website resolves the same IDs to current URLs.

## Sync direction

```text
Content Studio
  stable content identity
  canonical Markdown
  immutable content_versions
  content_relationships
  publications
        ↕ explicit push / pull
Upgrade Society Hugo repository
  front matter with content_id
  presentation templates
  Git history
        ↓
GitHub Pages
```

Use explicit sync rather than an uncontrolled live two-writer model.
