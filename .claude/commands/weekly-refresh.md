---
description: Refresh CLAUDE.md against the live DB and repo, then open a PR
---

Refresh `CLAUDE.md` so it stops drifting from reality. Work on a branch and open a
PR at the end (never push to `main`). Keep it tight; this should be mostly mechanical.

## 1. Refresh the "Current state snapshot"

Run this via the Supabase MCP `execute_sql` (`project_id: kyneaettrynagavewefi`) and
rewrite the snapshot bullets with the returned numbers:

```sql
SELECT
  count(*) FILTER (WHERE is_active) AS active,
  count(*) FILTER (WHERE is_active AND is_locally_owned IS TRUE) AS locally_owned,
  count(*) FILTER (WHERE is_active AND 'Chain'=ANY(features)) AS chains,
  count(*) FILTER (WHERE is_active AND is_locally_owned IS NULL) AS unclassified,
  count(*) FILTER (WHERE is_active AND lower(city)='minooka') AS minooka,
  count(*) FILTER (WHERE is_active AND lower(city)='channahon') AS channahon,
  count(*) FILTER (WHERE is_active AND lower(city)='shorewood') AS shorewood,
  count(*) FILTER (WHERE is_active AND lower(city) NOT IN ('minooka','channahon','shorewood')) AS around_815,
  count(*) FILTER (WHERE is_active AND (photos IS NULL OR array_length(photos,1) IS NULL OR array_length(photos,1)=0)) AS missing_photos,
  count(*) FILTER (WHERE is_active AND (photos IS NULL OR array_length(photos,1) IS NULL OR array_length(photos,1)=0) AND NOT ('Chain'=ANY(features))) AS missing_photos_local,
  count(*) FILTER (WHERE is_active AND (phone IS NULL OR phone='')) AS missing_phone,
  count(*) FILTER (WHERE is_active AND (website IS NULL OR website='')) AS missing_website,
  (SELECT count(*) FROM reviews WHERE is_flagged IS NOT TRUE) AS reviews,
  (SELECT count(*) FROM events WHERE is_active) AS active_events,
  (SELECT count(*) FROM deals WHERE is_active) AS active_deals,
  (SELECT count(*) FROM newsletter_subscribers) AS newsletter,
  (SELECT count(*) FROM claim_requests) AS claim_requests,
  (SELECT count(*) FROM advertise_waitlist) AS ad_waitlist
FROM businesses;
```

## 2. Reconcile structure and open work

- `git ls-files` and compare against the **File structure** tree. Add new files/folders,
  remove deleted ones. Pay attention to `pages/`, `admin/`, `supabase/functions/`, `tests/`.
- Re-check each **Open work** item against the repo / DB. Cross off anything done; add any
  new known gaps. Be honest about what is actually complete.
- Spot-check that any "do not rebuild / already shipped" notes are still accurate.

## 3. Finish

- Bump the "Last updated" line (top) and the snapshot date.
- Only change what actually changed; do not reflow the whole file.
- Commit on a branch named `claude/weekly-refresh-<date>`, push, and open a PR titled
  "Weekly CLAUDE.md refresh (<date>)" summarizing what moved. Do not push to `main`.

Respect the project rules: no em-dashes anywhere, plain language, only real data.
