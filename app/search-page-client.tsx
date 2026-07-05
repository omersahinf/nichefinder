"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type SetStateAction } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { SaturationReport } from "@/lib/saturation";
import type { NicheDecision } from "@/lib/niche-decision";
import { slugifyNiche } from "@/lib/niche-utils";
import type { EnrichedVideo, QuotaUsage, SearchSource } from "@/lib/search-types";
import type { SavedSearch } from "@/lib/saved-searches";
import { useKeyboardShortcuts } from "@/lib/keyboard";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import {
  type Filters,
  DEFAULT_OUTLIER_FEED_FILTERS,
  DEFAULT_PAGE_SIZE,
  EXAMPLE_CHIPS,
  activeFilterChips,
  buildExportRows,
  buildSearchParams,
  defaultSavedSearchLabel,
  downloadCsv,
  hydrateFilters,
  jsonToParams,
  paramsToJson,
  sameSearch,
  cacheAgeLabel,
} from "@/lib/search-utils";
import { NavBar } from "@/app/components/NavBar";
import { NicheOverview } from "@/app/components/NicheOverview";
import { FilterSidebar } from "@/app/components/FilterSidebar";
import { ResultsView } from "@/app/components/ResultsView";
import { SearchCommandBar } from "@/app/components/SearchCommandBar";
import { SavedSearchDrawer } from "@/app/components/SavedSearchDrawer";
import { Spinner } from "@/app/components/ui";

interface SearchResponse {
  results: EnrichedVideo[];
  saturation?: SaturationReport;
  decision?: NicheDecision | null;
  source?: SearchSource;
  fallbackReason?: string;
  refreshReason?: string;
  quota?: QuotaUsage;
  quotaUnits?: number;
  fetchedAt?: string;
  browseMode?: boolean;
  totalCount?: number;
  page?: number;
  pageSize?: number;
  hasMore?: boolean;
  dbMatchCount?: number;
  error?: string;
}

interface SavedSearchesResponse {
  savedSearches?: SavedSearch[];
  error?: string;
}

export function SearchPageClient({
  adminShortcutsEnabled = false,
  userEmail,
  userAvatarUrl,
}: {
  adminShortcutsEnabled?: boolean;
  userEmail?: string;
  userAvatarUrl?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialSearchParamsString = useRef(searchParams.toString()).current;
  const startedWithSearchParams = initialSearchParamsString.length > 0;

  const [q, setQ] = useState(() => (
    startedWithSearchParams
      ? hydrateFilters(new URLSearchParams(initialSearchParamsString)).q
      : ""
  ));
  const [lastQuery, setLastQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [results, setResults] = useState<EnrichedVideo[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [resultPage, setResultPage] = useState(1);
  const [resultPageSize, setResultPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [hasMore, setHasMore] = useState(false);
  const [saturation, setSaturation] = useState<SaturationReport | null>(null);
  const [decision, setDecision] = useState<NicheDecision | null>(null);
  const [source, setSource] = useState<SearchSource | null>(null);
  const [browseMode, setBrowseMode] = useState(false);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(() => (
    startedWithSearchParams
      ? hydrateFilters(new URLSearchParams(initialSearchParamsString)).filters
      : { ...DEFAULT_OUTLIER_FEED_FILTERS }
  ));
  const [quota, setQuota] = useState<QuotaUsage | null>(null);
  const [showRevenue, setShowRevenue] = useState(false);
  const [staleCache, setStaleCache] = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [savingSearch, setSavingSearch] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [savedError, setSavedError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [defaultFeedPinned, setDefaultFeedPinned] = useState(!startedWithSearchParams);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const hydrated = useRef(true);
  const autoSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialSearchRan = useRef(false);
  const skipNextAutoSearch = useRef(false);

  const focusSearch = useCallback(() => {
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }, []);

  useKeyboardShortcuts({
    adminEnabled: adminShortcutsEnabled,
    onFocusSearch: focusSearch,
    onEscape: () => { setFiltersOpen(false); setSavedOpen(false); },
    onAdminSeeds: () => router.push("/admin/seeds"),
    onAdminAlerts: () => router.push("/admin/alerts"),
  });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/quota")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: QuotaUsage | null) => { if (!cancelled && data) setQuota(data); })
      .catch(() => { if (!cancelled) setQuota(null); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/saved-searches")
      .then((res) => res.json().then((data: SavedSearchesResponse) => ({ res, data })))
      .then(({ res, data }) => {
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? "Unable to load saved searches");
        setSavedSearches(data.savedSearches ?? []);
      })
      .catch((err) => { if (!cancelled) setSavedError(err instanceof Error ? err.message : "Unable to load saved searches"); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    if (defaultFeedPinned && !startedWithSearchParams) return;
    const next = buildSearchParams(q, filters);
    const current = new URLSearchParams(searchParams.toString());
    if (sameSearch(new URLSearchParams(next), current)) return;
    const queryString = next.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
  }, [defaultFeedPinned, filters, pathname, q, router, searchParams, startedWithSearchParams]);

  const search = useCallback(async (
    event?: FormEvent,
    forceRefresh = false,
    searchQ = q,
    searchFilters = filters,
    requestedPage = 1,
    append = false,
  ): Promise<void> => {
    event?.preventDefault();
    if (event && autoSearchTimer.current) {
      clearTimeout(autoSearchTimer.current);
      autoSearchTimer.current = null;
    }
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const params = buildSearchParams(searchQ, searchFilters, forceRefresh, requestedPage, DEFAULT_PAGE_SIZE);
      const res = await fetch(`/api/search?${params}`);
      const data = await res.json() as SearchResponse;
      if (!res.ok) throw new Error(data.error ?? "search failed");
      setResults((current) => {
        if (!append) return data.results;
        const merged = new Map(current.map((v) => [v.id, v]));
        for (const v of data.results) merged.set(v.id, v);
        return [...merged.values()];
      });
      if (!append) { setSaturation(data.saturation ?? null); setDecision(data.decision ?? null); }
      setSource(data.source ?? null);
      setBrowseMode(data.browseMode === true);
      setFallbackReason(data.fallbackReason ?? data.refreshReason ?? null);
      setQuota(data.quota ?? null);
      setLastFetchedAt(data.fetchedAt ?? null);
      setTotalCount(data.totalCount ?? data.results.length);
      setResultPage(data.page ?? requestedPage);
      setResultPageSize(data.pageSize ?? DEFAULT_PAGE_SIZE);
      setHasMore(data.hasMore === true);
      setStaleCache(false);
      setLastQuery(searchQ.trim());
      setHasSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "error");
      if (!append) {
        setResults([]); setSaturation(null); setDecision(null); setSource(null);
        setBrowseMode(false); setFallbackReason(null); setStaleCache(false); setLastFetchedAt(null);
        setTotalCount(0); setResultPage(1); setHasMore(false);
      }
      setHasSearched(true);
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  }, [filters, q]);

  useEffect(() => {
    if (initialSearchRan.current) return;
    initialSearchRan.current = true;
    skipNextAutoSearch.current = true;
    void search(undefined, false, q, filters, 1, false);
  }, [filters, q, search]);

  useEffect(() => {
    if (!hasSearched) return;
    if (skipNextAutoSearch.current) {
      skipNextAutoSearch.current = false;
      return;
    }
    if (autoSearchTimer.current) clearTimeout(autoSearchTimer.current);
    autoSearchTimer.current = setTimeout(() => { void search(undefined, false, q, filters, 1, false); }, 350);
    return () => { if (autoSearchTimer.current) clearTimeout(autoSearchTimer.current); };
  }, [filters, hasSearched, q, search]);

  const nicheHref = useMemo(() => {
    const keyword = lastQuery || q.trim();
    const slug = slugifyNiche(keyword || "cached-browse");
    return keyword ? `/niche/${slug}?q=${encodeURIComponent(keyword)}` : `/niche/${slug}`;
  }, [lastQuery, q]);

  const setUserQ = useCallback((next: string) => {
    setDefaultFeedPinned(false);
    setQ(next);
  }, []);
  const setUserFilters = useCallback((next: SetStateAction<Filters>) => {
    setDefaultFeedPinned(false);
    setFilters(next);
  }, []);
  const activeChips = useMemo(() => activeFilterChips(filters, setUserFilters), [filters, setUserFilters]);
  const isUrl = q.includes("youtube.com") || q.includes("youtu.be");
  const canForceRefresh = q.trim().length > 0 && !loading && !loadingMore;
  const isDefaultFeedResult = defaultFeedPinned && hasSearched && !lastQuery;

  const saveCurrentSearch = async (): Promise<void> => {
    setSavingSearch(true); setSavedNotice(null); setSavedError(null);
    try {
      const params = buildSearchParams(q, filters);
      const res = await fetch("/api/saved-searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: defaultSavedSearchLabel(q, filters), keyword: q.trim() || undefined, filtersJson: paramsToJson(params) }),
      });
      const data = await res.json() as SavedSearchesResponse;
      if (!res.ok) throw new Error(data.error ?? "Unable to save search");
      setSavedSearches(data.savedSearches ?? []);
      setSavedNotice("Search saved.");
    } catch (err) {
      setSavedError(err instanceof Error ? err.message : "Unable to save search");
    } finally { setSavingSearch(false); }
  };

  const deleteSavedSearch = async (id: string): Promise<void> => {
    setSavedNotice(null); setSavedError(null);
    try {
      const res = await fetch(`/api/saved-searches?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json() as SavedSearchesResponse;
      if (!res.ok) throw new Error(data.error ?? "Unable to delete saved search");
      setSavedSearches(data.savedSearches ?? []);
    } catch (err) {
      setSavedError(err instanceof Error ? err.message : "Unable to delete saved search");
    }
  };

  const openSavedSearch = async (saved: SavedSearch): Promise<void> => {
    const params = jsonToParams(saved.filtersJson, saved.keyword);
    const hydratedSearch = hydrateFilters(params);
    const nextParams = buildSearchParams(hydratedSearch.q, hydratedSearch.filters);
    const queryString = nextParams.toString();
    setDefaultFeedPinned(false);
    setQ(hydratedSearch.q); setFilters(hydratedSearch.filters);
    setSavedNotice(null); setSavedError(null);
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
    if (!hasSearched) void search(undefined, false, hydratedSearch.q, hydratedSearch.filters);
    try {
      const res = await fetch("/api/saved-searches", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: saved.id }) });
      const data = await res.json() as SavedSearchesResponse;
      if (res.ok) setSavedSearches(data.savedSearches ?? []);
    } catch { /* non-blocking */ }
  };

  const signOut = async (): Promise<void> => {
    const supabase = getSupabaseBrowser();
    await supabase?.auth.signOut();
    router.refresh();
  };

  const exportCsv = (): void => {
    const keyword = (lastQuery || q.trim() || "cached-browse").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const today = new Date().toISOString().slice(0, 10);
    downloadCsv(`nichefinder-${keyword || "results"}-${today}.csv`, buildExportRows(results, source));
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <NavBar quotaUsed={quota?.used} quotaLimit={quota?.limit} userEmail={userEmail} userAvatarUrl={userAvatarUrl} onSignOut={() => void signOut()} />

      <SearchCommandBar
        q={q} setQ={setUserQ} isUrl={isUrl} loading={loading} loadingMore={loadingMore}
        canForceRefresh={canForceRefresh} activeChips={activeChips}
        searchInputRef={searchInputRef as React.RefObject<HTMLInputElement>}
        onSubmit={(e) => void search(e)}
        onForceRefresh={() => void search(undefined, true)}
        onOpenFilters={() => setFiltersOpen(true)}
      />

      <main className="mx-auto max-w-screen-xl px-5 py-5 space-y-4">
        {error && (
          <div className="rounded-md border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-200">
            Error: {error}
          </div>
        )}

        {source && !isDefaultFeedResult && (
          <div className={`rounded-md border px-4 py-2.5 text-xs flex items-center justify-between gap-3 ${
            source === "mock" ? "border-amber-900 bg-amber-950/30 text-amber-200"
            : source === "database_youtube_refresh" ? "border-sky-900 bg-sky-950/20 text-sky-200"
            : "border-emerald-900 bg-emerald-950/20 text-emerald-200"
          }`}>
            <div>
              <span className="font-semibold">
                {source === "mock" ? "Mock data"
                  : source === "database_youtube_refresh" ? "Database + YouTube refresh"
                  : source === "youtube_refresh" ? "YouTube refresh"
                  : browseMode ? "Browsing database" : "Database"}
              </span>
              {lastFetchedAt && <span className="ml-2 opacity-70">· fetched {cacheAgeLabel(lastFetchedAt)}</span>}
              {fallbackReason && <span className="ml-2 opacity-70">· {fallbackReason}</span>}
            </div>
            {staleCache && (
              <button type="button" onClick={() => void search(undefined, true)} disabled={!canForceRefresh}
                className="rounded border border-sky-700 px-2.5 py-1 text-[11px] font-semibold hover:border-sky-400 disabled:opacity-50 transition-colors">
                Refresh
              </button>
            )}
          </div>
        )}

        {!hasSearched && !loading && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="mb-6 text-4xl text-neutral-800">◉</div>
            <h2 className="text-base font-semibold text-neutral-300">Find your niche</h2>
            <p className="mt-2 max-w-sm text-sm text-neutral-500">
              Search a keyword, topic, or paste a YouTube URL to analyze saturation, outliers, and revenue.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {EXAMPLE_CHIPS.map((chip) => (
                <button key={chip} type="button"
                  onClick={() => { setDefaultFeedPinned(false); setQ(chip); void search(undefined, false, chip, filters); }}
                  className="rounded border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-400 hover:border-neutral-600 hover:text-neutral-200 transition-colors">
                  {chip}
                </button>
              ))}
            </div>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Spinner className="h-6 w-6" />
            <span className="text-sm text-neutral-500">
              {q.trim() ? <>Searching for <span className="font-mono text-neutral-400">&ldquo;{q}&rdquo;</span>...</> : "Browsing database..."}
            </span>
          </div>
        )}

        {!loading && hasSearched && (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-sm font-semibold text-neutral-100">
                  {lastQuery ? <><span className="text-neutral-500 font-normal">Results for </span>&ldquo;{lastQuery}&rdquo;</> : <span className="text-neutral-500">{isDefaultFeedResult ? "Default outlier feed" : "Browsing cached database"}</span>}
                </h2>
                {decision && !isDefaultFeedResult && (
                  <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-semibold ${
                    decision.verdict === "Enter" ? "border-green-500/30 bg-green-500/10 text-green-300"
                    : decision.verdict === "Avoid" ? "border-red-500/30 bg-red-500/10 text-red-300"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-300"
                  }`}>
                    {decision.verdict === "Enter" ? "▶" : decision.verdict === "Avoid" ? "✕" : "◎"} {decision.verdict}
                  </span>
                )}
                {results.length > 0 && (
                  <span className="font-mono text-[11px] text-neutral-500">
                    showing {results.length.toLocaleString()} of {totalCount.toLocaleString()} videos
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!isDefaultFeedResult && (
                  <Link href={nicheHref} className="rounded border border-neutral-700 px-2.5 py-1.5 text-[11px] text-neutral-400 hover:border-neutral-600 hover:text-neutral-200 transition-colors">
                    Niche page →
                  </Link>
                )}
                <button type="button" onClick={() => void saveCurrentSearch()} disabled={savingSearch}
                  className="rounded border border-neutral-700 px-2.5 py-1.5 text-[11px] text-neutral-400 hover:border-neutral-600 hover:text-neutral-200 disabled:opacity-50 transition-colors">
                  {savingSearch ? "Saving…" : "+ Save search"}
                </button>
              </div>
            </div>

            {savedNotice && <div className="rounded-md border border-emerald-900 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-200">{savedNotice}</div>}
            {savedError && <div className="rounded-md border border-red-900 bg-red-950/30 px-3 py-2 text-xs text-red-200">{savedError}</div>}

            {saturation && !isDefaultFeedResult && <NicheOverview saturation={saturation} query={lastQuery || "browse"} decision={decision} />}

            {results.length > 0 ? (
              <>
                <ResultsView videos={results} showRevenue={showRevenue} source={source} totalCount={totalCount} pageSize={resultPageSize} onExportCsv={exportCsv} defaultView="feed" />
                {hasMore && (
                  <div className="flex justify-center">
                    <button type="button" onClick={() => void search(undefined, false, lastQuery, filters, resultPage + 1, true)} disabled={loadingMore}
                      className="rounded border border-neutral-700 bg-neutral-900 px-4 py-2 text-xs font-semibold text-neutral-300 hover:border-neutral-600 hover:text-neutral-100 disabled:opacity-50 transition-colors">
                      {loadingMore ? "Loading..." : "Load more"}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-md border border-neutral-800 bg-neutral-900/40 py-16 text-center">
                <div className="text-2xl text-neutral-700 mb-2">≋</div>
                <div className="text-sm text-neutral-500">No videos match the current filters.</div>
              </div>
            )}
          </>
        )}

        <SavedSearchDrawer
          open={savedOpen}
          onClose={() => setSavedOpen(false)}
          savedSearches={savedSearches}
          onOpen={openSavedSearch}
          onDelete={deleteSavedSearch}
        />
      </main>

      <FilterSidebar open={filtersOpen} onClose={() => setFiltersOpen(false)} filters={filters} setFilters={setUserFilters} showRevenue={showRevenue} setShowRevenue={setShowRevenue} />
    </div>
  );
}
