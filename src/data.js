/**
 * Supabase data layer. The public anon key is safe in the browser — RLS
 * gives every table read-only access.
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

/** All offices joined to companies. ~4,682 rows. Called once on load.
 *
 * Supabase has a server-side max-rows cap (1000 by default) that .range()
 * cannot override from the client, so we paginate explicitly. Five round-trips
 * over a small payload still completes in <500 ms. */
export async function fetchGlobeData() {
  const PAGE = 1000;
  const all = [];
  for (let from = 0; ; from += PAGE) {
    const to = from + PAGE - 1;
    const { data, error } = await supabase
      .from('globe_data')
      .select('*')
      .order('office_id', { ascending: true })
      .range(from, to);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
  }
  // Sort once on the client so render order is deterministic regardless of paging.
  all.sort((a, b) => (b.job_count || 0) - (a.job_count || 0));
  return all;
}

/** Job rows for one office. Called when the user clicks a spike. */
export async function fetchOfficeJobs(officeId) {
  const { data, error } = await supabase
    .from('globe_jobs')
    .select('id, title, ai_type, job_url, is_remote, salary_min, salary_max, currency, date_posted')
    .eq('office_id', officeId)
    .order('date_posted', { ascending: false, nullsFirst: false })
    .limit(50);
  if (error) throw error;
  return data;
}

/** Autocomplete for the search box. */
export async function searchCompanies(query) {
  const { data, error } = await supabase
    .from('companies')
    .select('name, slug, country, tier, jobs_count')
    .ilike('name', `%${query}%`)
    .gt('jobs_count', 0)
    .order('jobs_count', { ascending: false })
    .limit(8);
  if (error) throw error;
  return data;
}

/** Hero counters. */
export async function fetchStats() {
  const [jobs, companies, countries] = await Promise.all([
    supabase.from('jobs').select('id', { count: 'exact', head: true }),
    supabase.from('companies').select('id', { count: 'exact', head: true }).gt('jobs_count', 0),
    supabase.from('companies').select('country').gt('jobs_count', 0),
  ]);
  const uniqueCountries = new Set((countries.data || []).map((r) => r.country)).size;
  return {
    jobs: jobs.count ?? 0,
    companies: companies.count ?? 0,
    countries: uniqueCountries,
  };
}
