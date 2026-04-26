# SOT / Logic — Control & API Layer

## Product: AI Jobs Globe

---

## Architecture: Supabase + Static Frontend

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Vite App   │────▶│   Supabase   │────▶│  PostgreSQL   │
│  (Three.js)  │     │  (REST API)  │     │  (hosted)     │
│   Browser    │◀────│  supabase-js │◀────│              │
└──────────────┘     └──────────────┘     └──────────────┘
       │
       ▼
   Vercel CDN
 (static assets,
  textures, logos)
```

**Why Supabase for MVP (not just static JSON):**
- Data is already structured (jobs, companies, offices) — relational DB is natural
- Free tier: 500MB storage, 50K monthly active users, unlimited API calls
- `supabase-js` client works directly from the browser (no backend needed)
- Row-level security = public read, no auth required for viewing
- If we want to add features later (user saves, live job updates), the DB is already there

---

## Supabase Setup

### 1. Create Project

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Create project (or use dashboard: https://supabase.com/dashboard)
# Project name: ai-jobs-globe
# Region: us-east-1 (closest to most users)
# Database password: [generate strong password]
```

### 2. Get Connection Details

After project creation, grab from Settings → API:
- **Project URL**: `https://dmvxrfmnkrwhjawpfbxk.supabase.co`
- **Anon Key**: see `.env` file (public, safe to embed in frontend)
- **Service Role Key**: see `.env.local` (private, for data import only — never commit)

### 3. Schema Migration

```sql
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New Query)

-- ============================================
-- TABLE: companies
-- ============================================
CREATE TABLE companies (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,
  slug            TEXT NOT NULL UNIQUE,
  domain          TEXT,
  country         TEXT NOT NULL,
  tier            SMALLINT NOT NULL CHECK (tier BETWEEN 1 AND 3),
  category        TEXT,
  has_logo        BOOLEAN DEFAULT false,
  logo_file       TEXT,
  jobs_count      INTEGER DEFAULT 0,
  locations_count INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- TABLE: offices (geocoded locations)
-- ============================================
CREATE TABLE offices (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER NOT NULL REFERENCES companies(id),
  location_name   TEXT NOT NULL,
  lat             DOUBLE PRECISION NOT NULL,
  lon             DOUBLE PRECISION NOT NULL,
  job_count       INTEGER DEFAULT 0,
  formatted_address TEXT,
  country_code    TEXT,
  UNIQUE(company_id, location_name)
);

CREATE INDEX idx_offices_company ON offices(company_id);

-- ============================================
-- TABLE: jobs
-- ============================================
CREATE TABLE jobs (
  id              SERIAL PRIMARY KEY,
  title           TEXT NOT NULL,
  company_id      INTEGER NOT NULL REFERENCES companies(id),
  office_id       INTEGER REFERENCES offices(id),
  location        TEXT,
  ai_type         TEXT CHECK (ai_type IN ('A1', 'A2', 'A3', 'B')),
  job_url         TEXT,
  job_type        TEXT DEFAULT 'fulltime',
  is_remote       BOOLEAN DEFAULT false,
  salary_min      NUMERIC,
  salary_max      NUMERIC,
  currency        TEXT,
  date_posted     DATE,
  description     TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_jobs_company ON jobs(company_id);
CREATE INDEX idx_jobs_office ON jobs(office_id);
CREATE INDEX idx_jobs_ai_type ON jobs(ai_type);
CREATE INDEX idx_jobs_title_search ON jobs USING GIN (to_tsvector('english', title));

-- ============================================
-- VIEW: globe_data (what the frontend queries)
-- ============================================
CREATE OR REPLACE VIEW globe_data AS
SELECT
  o.id AS office_id,
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

-- ============================================
-- VIEW: globe_jobs (job detail for panels)
-- ============================================
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

-- ============================================
-- RLS: Public read access
-- ============================================
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read companies" ON companies FOR SELECT USING (true);

ALTER TABLE offices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read offices" ON offices FOR SELECT USING (true);

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read jobs" ON jobs FOR SELECT USING (true);
```

### 4. Import Data from CSVs

Run this Python script to upload our existing data into Supabase:

```python
# import_to_supabase.py
import pandas as pd
from supabase import create_client
import re

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://dmvxrfmnkrwhjawpfbxk.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")  # SERVICE ROLE key (not anon)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── 1. Import companies ──
master = pd.read_csv('company_master_1500.csv')
companies = []
for _, r in master.iterrows():
    slug = r['name'].replace('/', '_').replace(' ', '_').replace('&', 'and')
    companies.append({
        'name': r['name'],
        'slug': slug,
        'domain': r.get('domain', ''),
        'country': r['country'],
        'tier': int(r['reputation_tier']),
        'category': r.get('category', ''),
        'has_logo': bool(r.get('has_logo', False)),
        'logo_file': r.get('logo_file', ''),
        'jobs_count': int(r.get('jobs_in_data', 0)),
        'locations_count': int(r.get('locations_in_data', 0)),
    })

# Batch insert (Supabase supports up to 1000 rows per call)
for i in range(0, len(companies), 500):
    supabase.table('companies').insert(companies[i:i+500]).execute()
print(f"Imported {len(companies)} companies")

# Build company name → id mapping
result = supabase.table('companies').select('id, name').execute()
company_ids = {r['name']: r['id'] for r in result.data}

# ── 2. Import offices ──
geo = pd.read_csv('geocoded_offices.csv')
offices = []
for _, r in geo.iterrows():
    if pd.isna(r.get('lat')) or r['company'] not in company_ids:
        continue
    offices.append({
        'company_id': company_ids[r['company']],
        'location_name': r['location'],
        'lat': float(r['lat']),
        'lon': float(r['lon']),
        'job_count': int(r.get('job_count', 0)),
        'formatted_address': r.get('formatted_address', ''),
        'country_code': r.get('country_code', ''),
    })

for i in range(0, len(offices), 500):
    supabase.table('offices').insert(offices[i:i+500]).execute()
print(f"Imported {len(offices)} offices")

# Build office lookup
result = supabase.table('offices').select('id, company_id, location_name').execute()
office_lookup = {}
for r in result.data:
    key = f"{r['company_id']}|{r['location_name']}"
    office_lookup[key] = r['id']

# ── 3. Import jobs ──
jobs_df = pd.read_csv('ai_jobs_1802_companies.csv', low_memory=False)
jobs = []
for _, r in jobs_df.iterrows():
    co = r.get('master_company', '')
    if co not in company_ids:
        continue
    cid = company_ids[co]
    office_key = f"{cid}|{r.get('location', '')}"
    oid = office_lookup.get(office_key)
    
    jobs.append({
        'title': str(r.get('title', ''))[:500],
        'company_id': cid,
        'office_id': oid,
        'location': str(r.get('location', ''))[:200],
        'ai_type': r.get('ai_type', 'A1'),
        'job_url': str(r.get('job_url', ''))[:1000] if pd.notna(r.get('job_url')) else None,
        'job_type': r.get('job_type', 'fulltime'),
        'is_remote': bool(r.get('is_remote', False)),
        'salary_min': float(r['min_amount']) if pd.notna(r.get('min_amount')) else None,
        'salary_max': float(r['max_amount']) if pd.notna(r.get('max_amount')) else None,
        'currency': r.get('currency') if pd.notna(r.get('currency')) else None,
        'date_posted': str(r['date_posted']) if pd.notna(r.get('date_posted')) else None,
        # Skip description for now (too large for initial import)
    })

for i in range(0, len(jobs), 500):
    supabase.table('jobs').insert(jobs[i:i+500]).execute()
    if (i+500) % 5000 == 0:
        print(f"  Imported {i+500} jobs...")
print(f"Imported {len(jobs)} jobs total")
```

### 5. Logos

Logos are stored in the Git repo at `public/logos/` (1,594 PNGs, ~11MB). Served as static assets via Vercel CDN. No Supabase Storage needed.

---

## Frontend Data Fetching

### Supabase Client Setup (`src/data.js`)

```javascript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// Fetch all globe pins (called once on page load)
export async function fetchGlobeData() {
  const { data, error } = await supabase
    .from('globe_data')
    .select('*')
    .order('job_count', { ascending: false });
  
  if (error) throw error;
  return data;  // ~4,759 rows
}

// Fetch jobs for a specific office (called on spike click)
export async function fetchOfficeJobs(officeId) {
  const { data, error } = await supabase
    .from('globe_jobs')
    .select('title, ai_type, job_url, is_remote, salary_min, salary_max, currency, date_posted')
    .eq('office_id', officeId)
    .order('date_posted', { ascending: false })
    .limit(50);
  
  if (error) throw error;
  return data;
}

// Search companies
export async function searchCompanies(query) {
  const { data, error } = await supabase
    .from('companies')
    .select('name, slug, country, tier')
    .ilike('name', `%${query}%`)
    .limit(10);
  
  if (error) throw error;
  return data;
}

// Get aggregate stats
export async function fetchStats() {
  const { count: jobCount } = await supabase.from('jobs').select('*', { count: 'exact', head: true });
  const { count: companyCount } = await supabase.from('companies').select('*', { count: 'exact', head: true }).gt('jobs_count', 0);
  const { data: countries } = await supabase.from('companies').select('country').gt('jobs_count', 0);
  const uniqueCountries = new Set(countries.map(c => c.country)).size;
  
  return { jobs: jobCount, companies: companyCount, countries: uniqueCountries };
}
```

### Data Loading Strategy

```
Page Load
  ├── 1. Show loading screen (spinning globe silhouette)
  ├── 2. Start loading satellite textures (async)
  ├── 3. fetchGlobeData() from Supabase (~200ms)
  ├── 4. Build InstancedMesh from globe data
  ├── 5. Textures loaded → apply to globe
  └── 6. Hide loading screen, start render loop

On Spike Click
  ├── 1. Get office_id from spike instance index
  ├── 2. fetchOfficeJobs(officeId) from Supabase (~100ms)
  └── 3. Render job list in detail panel

On Search Input
  ├── 1. Debounce 300ms
  ├── 2. searchCompanies(query) from Supabase (~80ms)
  └── 3. Show autocomplete dropdown, fly camera on select
```

### Fallback: Static JSON

If Supabase is down or for offline development, fall back to a pre-built JSON file:

```javascript
export async function fetchGlobeData() {
  try {
    // Try Supabase first
    const { data } = await supabase.from('globe_data').select('*');
    return data;
  } catch {
    // Fallback to static JSON
    const response = await fetch('/data/globe-data.json');
    return (await response.json()).locations;
  }
}
```

Generate the fallback JSON at build time:
```bash
node scripts/export-globe-json.js  # queries Supabase → writes public/data/globe-data.json
```

---

## Business Logic (in-browser)

### 1. Geo Projection (`src/utils/geo.js`)

```javascript
// Convert (lat, lon) to 3D position on sphere
export function latLonToVector3(lat, lon, radius) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
     radius * Math.cos(phi),
     radius * Math.sin(phi) * Math.sin(theta)
  );
}

// Get "up" direction at a point on the sphere (for spike orientation)
export function getNormal(lat, lon) {
  return latLonToVector3(lat, lon, 1).normalize();
}
```

### 2. Spike Sizing

```javascript
function spikeHeight(jobCount) {
  return Math.min(Math.log2(jobCount + 1) * 0.03, 0.3);
}

function spikeColor(tier) {
  const colors = { 1: 0x00ffff, 2: 0x4488ff, 3: 0x8844ff };
  return colors[tier] || 0x4488ff;
}

function heatRadius(jobCount) {
  return Math.sqrt(jobCount) * 0.002 + 0.005;
}

function heatIntensity(jobCount, maxJobs) {
  return Math.log2(jobCount + 1) / Math.log2(maxJobs + 1);
}
```

### 3. Filter Logic

```javascript
const filterState = {
  aiTypes: new Set(['A1', 'A2', 'A3', 'B']),
  tiers: new Set([1, 2, 3]),
  searchQuery: '',
};

function applyFilters(locations) {
  return locations.filter(loc => {
    const tierMatch = filterState.tiers.has(loc.tier);
    const searchMatch = !filterState.searchQuery ||
      loc.company.toLowerCase().includes(filterState.searchQuery.toLowerCase());
    return tierMatch && searchMatch;
  });
}
```

### 4. Camera Fly-To

```javascript
import TWEEN from '@tweenjs/tween.js';

function flyTo(lat, lon, zoomDistance = 3) {
  const target = latLonToVector3(lat, lon, zoomDistance * GLOBE_RADIUS);
  
  new TWEEN.Tween(camera.position)
    .to({ x: target.x, y: target.y, z: target.z }, 1200)
    .easing(TWEEN.Easing.Cubic.InOut)
    .onUpdate(() => camera.lookAt(0, 0, 0))
    .start();
}
```

---

## Environment Variables

```env
# Real values live in .env (committed: NO — gitignored) and .env.local (committed: NO).
# Do NOT paste secrets back into this file. See repo root for actual values.
# Service key is at: Supabase dashboard → Project Settings → API → service_role.

# .env (Vite exposes VITE_ prefixed vars to the browser)
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...

# .env.local (private — never committed; only used by data import scripts)
SUPABASE_SERVICE_KEY=...
```

---

## Reference Data Sources

| Source | File | Records | Status |
|--------|------|---------|--------|
| Job listings | `ai_jobs_1802_companies.csv` | 15,352 | Complete — all in one file (includes Chinese companies) |
| Office geocodes | `geocoded_offices.csv` | 4,759 | Complete — 100% geocoded |
| Company master | `company_master_1500.csv` | 1,802 | Complete — includes domain, logo info |
| Company logos | `logos/*.png` | 1,594 | ~88% coverage |

**Note:** Chinese company jobs are NOT in a separate file — they are merged into the main `ai_jobs_1802_companies.csv` alongside all other jobs.

---

## Recent Changes

- 2026-04-26 — moved Supabase keys out of this file into `.env` (anon, public) and `.env.local` (service, private). Both gitignored.
