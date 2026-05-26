import { notFound } from "next/navigation";
import { getCurrentAdminIdentity } from "@/lib/auth";
import { previewKeywordTuning } from "@/lib/keyword-tuning";
import Link from "next/link";

export const dynamic = "force-dynamic";

const ACTION_CONFIG = {
  promote: {
    label: "Promote",
    cls: "bg-green-500/10 text-green-300 border border-green-500/20",
  },
  demote: {
    label: "Demote",
    cls: "bg-amber-500/10 text-amber-300 border border-amber-500/20",
  },
  disable_expired: {
    label: "Disable (expired)",
    cls: "bg-red-500/10 text-red-300 border border-red-500/20",
  },
  disable_no_yield: {
    label: "Disable (no yield)",
    cls: "bg-red-500/10 text-red-300 border border-red-500/20",
  },
} as const;

export default async function TuningPreviewPage() {
  if (process.env.ADMIN_UI_ENABLED !== "true") notFound();
  if (process.env.ADMIN_EMAILS && !(await getCurrentAdminIdentity())) notFound();

  const preview = await previewKeywordTuning();

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 px-6 py-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Keyword Tuning — Dry Run Preview</h1>
            <p className="mt-0.5 text-sm text-neutral-500">
              What the next tuning run would do, without executing.
            </p>
          </div>
          <Link
            href="/admin/keywords"
            className="rounded border border-neutral-700 px-3 py-1.5 text-xs text-neutral-400 hover:border-neutral-600 hover:text-neutral-200 transition-colors"
          >
            ← Keywords
          </Link>
        </div>

        {!preview ? (
          <div className="rounded border border-neutral-800 py-12 text-center text-sm text-neutral-500">
            Supabase not configured.
          </div>
        ) : (
          <>
            {/* Stats summary */}
            <div className="grid grid-cols-3 gap-px bg-neutral-800 rounded-lg overflow-hidden">
              <div className="bg-neutral-900 px-5 py-4">
                <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">Eligible</div>
                <div className="text-2xl font-bold">{preview.eligibleCount}</div>
                <div className="text-xs text-neutral-600 mt-0.5">keywords with ≥5 runs</div>
              </div>
              <div className="bg-neutral-900 px-5 py-4">
                <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">Too few runs</div>
                <div className="text-2xl font-bold text-amber-400">{preview.tooFewRunsCount}</div>
                <div className="text-xs text-neutral-600 mt-0.5">need more searches first</div>
              </div>
              <div className="bg-neutral-900 px-5 py-4">
                <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">Would change</div>
                <div className="text-2xl font-bold text-sky-400">{preview.rows.length}</div>
                <div className="text-xs text-neutral-600 mt-0.5">keywords affected</div>
              </div>
            </div>

            {preview.rows.length === 0 ? (
              <div className="rounded border border-neutral-800 bg-neutral-900/50 py-12 text-center">
                <div className="text-neutral-500 text-sm">
                  No changes would be made.
                  {preview.tooFewRunsCount > 0 && (
                    <span className="block mt-1 text-amber-400/70">
                      {preview.tooFewRunsCount} keywords need ≥5 search runs before they qualify.
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-neutral-800 overflow-hidden">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-neutral-800 bg-neutral-900/80">
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
                        Keyword
                      </th>
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
                        Action
                      </th>
                      <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
                        Priority
                      </th>
                      <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
                        Runs
                      </th>
                      <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
                        Added
                      </th>
                      <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
                        Yield
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row, i) => {
                      const cfg = ACTION_CONFIG[row.action];
                      const priorityChanged = row.newPriority !== row.currentPriority;
                      return (
                        <tr
                          key={row.id}
                          className={`border-b border-neutral-800/60 ${
                            i % 2 === 0 ? "bg-transparent" : "bg-neutral-900/20"
                          }`}
                        >
                          <td className="px-4 py-2.5 font-mono text-xs text-neutral-200 max-w-[220px] truncate">
                            {row.keyword}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`inline-flex rounded px-2 py-0.5 text-[10px] font-semibold ${cfg.cls}`}>
                              {cfg.label}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs">
                            {priorityChanged ? (
                              <span>
                                <span className="text-neutral-500 line-through">{row.currentPriority}</span>
                                <span className="ml-1 text-neutral-200">→ {row.newPriority}</span>
                              </span>
                            ) : (
                              <span className="text-neutral-500">{row.currentPriority}</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs text-neutral-400">
                            {row.totalRuns}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs text-neutral-400">
                            {row.totalAdded}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs">
                            <span className={row.yield > 5 ? "text-green-300" : row.yield > 0 ? "text-neutral-300" : "text-red-400"}>
                              {row.yield.toFixed(1)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
