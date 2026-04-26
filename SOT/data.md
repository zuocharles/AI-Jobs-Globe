# SOT / Data — Data Layer

## Product: AI Jobs Globe

---

## Recent Changes
- 2026-04-26 — added `data/building_focus.json` with 53 building entries (lat/lon + camera framing) for the top 30 employers, supporting Cesium scope-mode auto-focus. 30 HQs covered; ~23 secondary major hubs included. 4 entries flagged low-confidence (Prolific London exact suite, Invisible remote-only, Binance Dubai/Paris non-fixed HQ); 1 medium (Anthropic, Ro NYC, Deloitte UK, RBC NY, TCS NA, Capital One NYC). Compiled from canonical training-knowledge sources (Wikipedia infoboxes, official company location pages); live web verification was unavailable in the research environment, so a manual audit is recommended before production use.
- 2026-04-26 — attempted to extend coverage to ranks 31–80 via background agent (brief at `data/_research_brief_v2.md`). Agent hit the org monthly usage limit before producing output — `data/building_focus_extended.json` does NOT exist yet. **Next session:** pick one of (a) re-run after limit reset, (b) write a Node script using Google Places API on the same GCP project (669037656528) that already hosts Map Tiles — ~$17 for ~1000 lookups, fastest path to authoritative data, or (c) hand-curate top 50 in foreground.
- 2026-04-26 — added `data/building_focus_extended.json` covering all 50 tier-2 companies (rank 31–80) with **75 building entries**: 50 HQs + 25 secondary hubs (extra SF/NYC/London/Tokyo/Beijing offices for Salesforce, Meta, Tesla, AMD, Goldman Sachs, BNY, TikTok, Wells Fargo, etc., to address the SF scope-mode cycling issue). Compiled from Wikipedia infoboxes, company contact pages, and live WebSearch against business directories (D&B, GlobalData, Craft.co). All entries are "high" or "medium" confidence except 2 "low" (ElevenLabs London exact address, Nebius Amsterdam exact address); zero fabrications. Frontend `scope.js` does not need any code changes — it already merges `building_focus.json`; the loader needs to also merge `building_focus_extended.json` (or the two files can be concatenated into one).

---

## Architecture: Supabase (PostgreSQL)

| Component | Choice | Details |
|-----------|--------|---------|
| Database | **Supabase PostgreSQL** | Free tier: 500MB, 50K MAU |
| Storage | **Git repo** `public/logos/` + `public/textures/` | Served via Vercel CDN as static assets |
| API | **Supabase REST (PostgREST)** | Auto-generated from schema, accessed via `supabase-js` |
| Auth | None (MVP) | All data is public read |
| Hosting | **Vercel** | Static frontend + Supabase for data |

### Why Supabase over static JSON?

- **Queryable**: filter by tier, AI type, company on the server instead of shipping all 15K jobs to the browser
- **Growable**: add new scrape data without redeploying the frontend
- **Free**: Supabase free tier is more than enough (our entire dataset is ~50MB)
- **Instant API**: PostgREST gives us REST endpoints from SQL views — no backend code

---

## Database Schema

### Tables

```sql
-- ============================================
-- companies: 1,802 rows
-- ============================================
CREATE TABLE companies (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,        -- "Alphabet/Google"
  slug            TEXT NOT NULL UNIQUE,        -- "Alphabet_Google" (logo filename)
  domain          TEXT,                        -- "google.com"
  country         TEXT NOT NULL,              -- "US" (ISO 2-letter)
  tier            SMALLINT NOT NULL           -- 1=top, 2=strong, 3=emerging
                  CHECK (tier BETWEEN 1 AND 3),
  category        TEXT,                        -- "F500", "STARTUP", etc.
  has_logo        BOOLEAN DEFAULT false,
  logo_file       TEXT,                        -- "Alphabet_Google.png"
  jobs_count      INTEGER DEFAULT 0,
  locations_count INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_companies_tier ON companies(tier);
CREATE INDEX idx_companies_country ON companies(country);
CREATE INDEX idx_companies_name_search ON companies 
  USING GIN (to_tsvector('simple', name));

-- ============================================
-- offices: 4,682 rows (one per company+location)
-- ============================================
CREATE TABLE offices (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  location_name   TEXT NOT NULL,              -- "Mountain View, CA"
  lat             DOUBLE PRECISION NOT NULL,
  lon             DOUBLE PRECISION NOT NULL,
  job_count       INTEGER DEFAULT 0,
  formatted_address TEXT,                     -- from Nominatim geocoder
  country_code    TEXT,                       -- "us"
  UNIQUE(company_id, location_name)
);

CREATE INDEX idx_offices_company ON offices(company_id);
CREATE INDEX idx_offices_location ON offices(location_name);

-- ============================================
-- jobs: 15,352 rows
-- ============================================
CREATE TABLE jobs (
  id              SERIAL PRIMARY KEY,
  title           TEXT NOT NULL,
  company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  office_id       INTEGER REFERENCES offices(id) ON DELETE SET NULL,
  location        TEXT,                       -- raw location string
  ai_type         TEXT NOT NULL DEFAULT 'A1'
                  CHECK (ai_type IN ('A1', 'A2', 'A3', 'B')),
  job_url         TEXT,
  job_type        TEXT DEFAULT 'fulltime',
  is_remote       BOOLEAN DEFAULT false,
  salary_min      NUMERIC,
  salary_max      NUMERIC,
  currency        TEXT,
  date_posted     DATE,
  description     TEXT,                       -- full JD (not served to frontend)
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_jobs_company ON jobs(company_id);
CREATE INDEX idx_jobs_office ON jobs(office_id);
CREATE INDEX idx_jobs_ai_type ON jobs(ai_type);
CREATE INDEX idx_jobs_date ON jobs(date_posted DESC);
CREATE INDEX idx_jobs_title_fts ON jobs 
  USING GIN (to_tsvector('english', title));
```

### Views (what the frontend queries)

```sql
-- Globe pins: one row per office with company info (what the frontend queries on load)
CREATE OR REPLACE VIEW globe_data AS
SELECT
  o.id AS office_id,
  c.id AS company_id,
  c.name AS company,
  c.slug AS company_slug,
  c.domain,
  c.tier,
  c.country AS company_country,
  c.has_logo,
  c.logo_file,
  o.location_name,
  o.lat,
  o.lon,
  o.job_count,
  o.country_code
FROM offices o
JOIN companies c ON c.id = o.company_id
WHERE o.lat IS NOT NULL AND o.lon IS NOT NULL;

-- Job detail for panels (fetched on spike click)
CREATE OR REPLACE VIEW globe_jobs AS
SELECT
  j.id,
  j.title,
  j.ai_type,
  j.job_url,
  j.is_remote,
  j.salary_min,
  j.salary_max,
  j.currency,
  j.date_posted,
  c.name AS company,
  c.slug AS company_slug,
  o.location_name,
  o.id AS office_id
FROM jobs j
JOIN companies c ON c.id = j.company_id
LEFT JOIN offices o ON o.id = j.office_id;
```

### Row-Level Security

```sql
-- Everything is public read, no write from browser
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE offices ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read" ON companies FOR SELECT USING (true);
CREATE POLICY "Public read" ON offices FOR SELECT USING (true);
CREATE POLICY "Public read" ON jobs FOR SELECT USING (true);

-- Write access only for service role (used by import script)
CREATE POLICY "Service write" ON companies FOR ALL 
  USING (auth.role() = 'service_role');
CREATE POLICY "Service write" ON offices FOR ALL 
  USING (auth.role() = 'service_role');
CREATE POLICY "Service write" ON jobs FOR ALL 
  USING (auth.role() = 'service_role');
```

---

## Data Import Process

### Step-by-step: CSV → Supabase

```bash
# 1. Create Supabase project at https://supabase.com/dashboard
#    - Name: ai-jobs-globe
#    - Region: us-east-1
#    - Save the project URL and keys

# 2. Run schema migration
#    Dashboard → SQL Editor → paste the CREATE TABLE statements above → Run

# 3. Install Python Supabase client
pip install supabase --break-system-packages

# 4. Run import script
python import_to_supabase.py
```

### Import Script

See `SOT/logic.md` Section 4 for the full `import_to_supabase.py` script. Summary:

1. Read `company_master_1500.csv` → insert 1,802 companies
2. Read `geocoded_offices.csv` → insert 4,759 offices (linked to companies by name)
3. Read `ai_jobs_1802_companies.csv` → insert 15,352 jobs (linked to companies + offices)
4. Each table is batch-inserted in groups of 500 rows

**Estimated import time:** ~2 minutes for all three tables.

### Logo Storage (DECIDED)

Logos are stored in the Git repo at `public/logos/` and served from Vercel CDN as static assets.

- **Repo**: https://github.com/zuocharles/AI-Jobs-Globe
- **Path**: `public/logos/*.png`
- **Count**: 1,594 PNGs (128px favicons)
- **Total size**: ~11MB
- **Logo URL in app**: `/logos/Alphabet_Google.png`
- **Fallback**: companies without logos use a CSS-generated initials circle

---

## Source Data Files

All data lives in one unified set of files. There is NO separate Chinese company file — everything is merged.

### File Inventory

| File | Rows | Size | Contents |
|------|------|------|----------|
| `ai_jobs_1802_companies.csv` | 15,352 | ~1.3GB* | All AI jobs (including 122 Chinese company entries) |
| `geocoded_offices.csv` | 4,682 | ~500KB | Every (company, location) with lat/lon |
| `company_master_1500.csv` | 1,802 | ~200KB | All companies with domain, tier, logo info |
| `logos/*.png` | 1,594 files | ~11MB | Company favicons (128px) |
| `logo_results.csv` | 1,802 | ~100KB | Logo fetch results and domain mapping |
| `data/building_focus.json` | 53 entries | ~25KB | Per-building lat/lon + camera framing for 30 top employers (HQ + major hubs) — feeds Cesium "scope mode" auto-focus |

*Job descriptions make the CSV large. Without descriptions, it's ~15MB.

### Column Reference

**ai_jobs_1802_companies.csv** (18 columns):

| Column | Type | Description |
|--------|------|-------------|
| title | string | Job title |
| company | string | Company name from job board |
| location | string | Office location |
| date_posted | date | Listing date |
| job_type | string | fulltime/parttime/contract |
| min_amount | float | Min salary |
| max_amount | float | Max salary |
| currency | string | Salary currency |
| is_remote | bool | Remote flag |
| job_url | string | Link to job posting |
| description | text | Full job description |
| ai_type | enum | A1/A2/A3/B classification |
| master_company | string | Normalized company name |
| master_tier | int | Company tier (1/2/3) |
| master_country | string | HQ country |
| source_company | string | Search term used |
| source_country | string | Country searched |
| source_tier | int | Tier searched |

### AI Type Classification

| Code | Name | % | What it means |
|------|------|---|---------------|
| A1 | Pro Upskill | 55.9% | Non-technical roles at AI companies (PM, analyst, ops, marketing) |
| A2 | AI-Technical | 35.0% | ML engineers, data scientists, researchers, architects |
| A3 | AI-Executive | 3.3% | VP/Director/CTO with AI focus |
| B | AI-Native | 5.8% | AI product managers, AI governance, AI strategy |

### Company Tier Distribution

| Tier | Count | Examples |
|------|-------|---------|
| 1 (Top brand) | 154 | Google, Amazon, OpenAI, Goldman Sachs, McKinsey |
| 2 (Strong) | 474 | Databricks, CrowdStrike, Waymo, Palantir, Cloudflare |
| 3 (Emerging) | 1,174 | Startups, regional firms, research labs |

### Coverage

- **1,177 of 1,802 companies** have at least 1 AI job (65.3%)
- **626 companies** have 0 jobs (couldn't find AI listings on Indeed/LinkedIn)
  - Tier 1 missing: 24 (Vale, Sony, Shopify, BMW, Unilever, etc.)
  - Tier 2 missing: 180 (Midjourney, Cloudflare, Notion, etc.)
  - Tier 3 missing: 422 (mostly small/niche companies)
- These 626 companies will NOT have spikes on the globe — no data to visualize

---

## Data Pipeline Architecture

```
               COLLECTION (completed)
               ═══════════════════════

Indeed (python-jobspy)  ──┐
LinkedIn (python-jobspy) ─┤
Manual (Chinese cos.) ────┤
                          ▼
               ┌───────────────────┐
               │   AI Job Filter   │
               │ • title regex     │
               │ • desc keywords   │
               │ • internship rm   │
               │ • AI type assign  │
               └────────┬──────────┘
                        ▼
               ┌───────────────────┐
               │  Company Matcher  │
               │ • name normalize  │
               │ • substring match │
               │ • map to master   │
               └────────┬──────────┘
                        ▼
               ┌───────────────────┐
               │   Deduplication   │
               │ • by job_url      │
               │ • by title+co+loc │
               └────────┬──────────┘
                        ▼
               ┌───────────────────┐
               │    Geocoding      │
               │ • Nominatim API   │
               │ • 1 req/sec       │
               │ • cached locally  │
               └────────┬──────────┘
                        ▼
               ┌───────────────────┐
               │   Logo Fetching   │
               │ • Google Favicons │
               │ • DDG fallback    │
               │ • 128px PNG       │
               └────────┬──────────┘
                        ▼
              STORAGE (Supabase)
              ══════════════════
              companies: 1,802
              offices:   4,682
              jobs:      15,352
              logos:     1,594 files
```

---

## Data Quality Rules

Enforced during import and as database constraints:

| Rule | SQL Constraint / Filter |
|------|------------------------|
| No internships | Title regex excludes `intern|internship|co-op|trainee|...` |
| AI jobs only | Title regex OR 3+ description keywords |
| Valid AI type | `CHECK (ai_type IN ('A1','A2','A3','B'))` |
| Valid tier | `CHECK (tier BETWEEN 1 AND 3)` |
| No duplicate URLs | Deduplicated during import (not enforced as DB constraint — placeholder URLs exist for Chinese companies) |
| Valid geocode | offices require non-null lat/lon |
| Company reference | `FOREIGN KEY (company_id) REFERENCES companies(id)` |

---

## Texture Assets (for globe rendering)

These are NOT in Supabase — they're static files served from the Vite `/public/textures/` folder.

| File | Source | Size | Resolution | License |
|------|--------|------|------------|---------|
| `earth-night-8k.jpg` | [NASA VIIRS](https://svs.gsfc.nasa.gov/30003/) | ~8MB | 8192x4096 | Public domain |
| `earth-night-4k.jpg` | NASA (downscaled) | ~2MB | 4096x2048 | Public domain |
| `earth-day-4k.jpg` | [Solar System Scope](https://www.solarsystemscope.com/textures/) | ~3MB | 4096x2048 | CC BY 4.0 |
| `earth-bump-4k.jpg` | Solar System Scope | ~2MB | 4096x2048 | CC BY 4.0 |
| `earth-specular-4k.jpg` | Solar System Scope | ~1MB | 4096x2048 | CC BY 4.0 |
| `earth-clouds-4k.png` | Solar System Scope | ~3MB | 4096x2048 | CC BY 4.0 |

**Download commands:**
```bash
mkdir -p public/textures

# NASA Earth at Night (primary)
# Download from: https://svs.gsfc.nasa.gov/30003/
# Choose: "flat" projection, JPEG, 8192x4096 or 4096x2048

# Solar System Scope pack (day, bump, specular, clouds)
# Download from: https://www.solarsystemscope.com/textures/
# Direct links on the page for each texture type
```

---

## Future: Data Refresh

For MVP, data is static (scraped once). If we productize:

```
Weekly Cron (Supabase Edge Function or GitHub Actions)
  ├── Run python-jobspy for all 1,802 companies
  ├── Apply AI job filter + dedup
  ├── Upsert new jobs into Supabase
  ├── Mark stale jobs as inactive (>30 days old, not re-scraped)
  ├── Geocode any new locations
  └── Refresh materialized view / update office job counts
```
