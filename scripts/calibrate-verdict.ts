#!/usr/bin/env npx tsx
/**
 * Calibration script: runs niche decision scoring over recent search history.
 * Usage: npx tsx --env-file=.env.local scripts/calibrate-verdict.ts [--limit=200]
 *
 * Requires .env.local with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */

import { getSupabaseAdmin } from "../lib/supabase";
import { searchCachedVideos } from "../lib/cache";
import { computeSaturation } from "../lib/saturation";
import { computeNicheDecision } from "../lib/niche-decision";
import type { NicheVerdict } from "../lib/niche-decision";

const limitArg = process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1];
const LIMIT = limitArg ? parseInt(limitArg, 10) : 200;

interface SearchRow {
  query: string;
}

async function main() {
  const client = getSupabaseAdmin();
  if (!client) {
    console.error("Supabase not configured — ensure .env.local has SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  console.log(`\nFetching ${LIMIT} recent searches from database...\n`);

  const { data, error } = await client
    .from("searches")
    .select("query")
    .not("query", "is", null)
    .not("query", "eq", "")
    .order("created_at", { ascending: false })
    .limit(LIMIT);

  if (error) {
    console.error("Failed to fetch searches:", error.message);
    process.exit(1);
  }

  const rows = (data ?? []) as SearchRow[];
  // Deduplicate
  const keywords = [...new Set(rows.map((r) => r.query.trim().toLowerCase()).filter(Boolean))];
  console.log(`Unique keywords to evaluate: ${keywords.length}\n`);

  const verdictCounts: Record<NicheVerdict | "null", number> = { Enter: 0, Test: 0, Avoid: 0, null: 0 };
  const scores: number[] = [];

  for (const kw of keywords) {
    try {
      const page = await searchCachedVideos({ q: kw, page: 1, pageSize: 100 });
      const saturation = computeSaturation(page.results);
      const decision = computeNicheDecision(saturation);

      if (!decision) {
        verdictCounts.null++;
        continue;
      }

      verdictCounts[decision.verdict]++;
      scores.push(decision.score);
    } catch {
      verdictCounts.null++;
    }
  }

  const total = keywords.length;
  const scored = scores.length;

  console.log("─".repeat(50));
  console.log("VERDICT DISTRIBUTION");
  console.log("─".repeat(50));
  for (const [verdict, count] of Object.entries(verdictCounts)) {
    const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "0.0";
    const bar = "█".repeat(Math.round((count / total) * 30));
    console.log(`  ${verdict.padEnd(8)} ${String(count).padStart(4)}  (${pct.padStart(5)}%)  ${bar}`);
  }

  console.log("\n─".repeat(50));
  console.log("SCORE STATISTICS");
  console.log("─".repeat(50));
  if (scored > 0) {
    scores.sort((a, b) => a - b);
    const mean = (scores.reduce((s, n) => s + n, 0) / scored).toFixed(1);
    const median = scores[Math.floor(scored / 2)];
    const p10 = scores[Math.floor(scored * 0.1)];
    const p25 = scores[Math.floor(scored * 0.25)];
    const p75 = scores[Math.floor(scored * 0.75)];
    const p90 = scores[Math.floor(scored * 0.9)];
    console.log(`  Evaluated : ${scored}`);
    console.log(`  Mean      : ${mean}`);
    console.log(`  Median    : ${median}`);
    console.log(`  P10 / P25 : ${p10} / ${p25}`);
    console.log(`  P75 / P90 : ${p75} / ${p90}`);
    console.log(`  Min / Max : ${scores[0]} / ${scores[scored - 1]}`);
  } else {
    console.log("  No scored results.");
  }

  console.log("\n─".repeat(50));
  console.log("CALIBRATION NOTES");
  console.log("─".repeat(50));
  const enterPct = total > 0 ? (verdictCounts.Enter / total) * 100 : 0;
  const avoidPct = total > 0 ? (verdictCounts.Avoid / total) * 100 : 0;

  if (enterPct > 20) {
    console.log(`  ⚠  Enter rate ${enterPct.toFixed(1)}% is HIGH (target <15%).`);
    console.log("     Consider raising the Enter threshold (currently ≥70) or tightening scoring.");
  } else if (enterPct < 3) {
    console.log(`  ⚠  Enter rate ${enterPct.toFixed(1)}% is very LOW (target 5-15%).`);
    console.log("     Consider lowering the Enter threshold or boosting positive signals.");
  } else {
    console.log(`  ✓  Enter rate ${enterPct.toFixed(1)}% looks healthy (target 5-15%).`);
  }

  if (avoidPct < 30) {
    console.log(`  ⚠  Avoid rate ${avoidPct.toFixed(1)}% is LOW — too many keywords scoring above 45.`);
  } else {
    console.log(`  ✓  Avoid rate ${avoidPct.toFixed(1)}% looks reasonable.`);
  }

  console.log();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
