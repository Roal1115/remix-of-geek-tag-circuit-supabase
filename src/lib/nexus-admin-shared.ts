import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getNexusAdmin, failDb } from "./nexus-admin.server";
import { requireNexusUser } from "./nexus-auth.middleware";
import type { Database, Json } from "./database.types";

export type TournamentStatus = Database["public"]["Enums"]["tournament_status"];

// Store URLs (website, google_maps_url) get rendered as <a href> on public
// pages. Without a protocol allowlist, a manager/organizer could persist
// "javascript:..." and turn the link into stored XSS for any visitor. Reject
// everything but http(s) instead of relying on z.string().url(), which
// happily accepts "javascript:alert(1)" as a well-formed URL.
export const httpUrlSchema = z
  .string()
  .max(500)
  .trim()
  .optional()
  .or(z.literal(""))
  .refine((v) => !v || /^https?:\/\//i.test(v), {
    message: "La URL debe iniciar con http:// o https://",
  });

// ---------- Audit log helper ----------
export async function logAction(
  admin: ReturnType<typeof getNexusAdmin>,
  player: { id: string; role: string; geek_tag: string },
  action: string,
  target_type: string,
  target_id: string | null,
  target_label: string,
  metadata?: Json,
) {
  try {
    await admin.from("admin_audit_log").insert({
      actor_id: player.id,
      actor_role: player.role,
      actor_tag: player.geek_tag,
      action,
      target_type,
      target_id: target_id ?? undefined,
      target_label,
      metadata: metadata ?? null,
    });
  } catch (e) {
    console.error("audit log error:", e);
  }
}

// ---------- Active season helper ----------
export async function getActiveSeason(admin: ReturnType<typeof getNexusAdmin>) {
  const { data } = await admin
    .from("seasons")
    .select("id, name, slug, start_date, end_date, status")
    .eq("is_active", true)
    .maybeSingle();
  return (data ?? null) as {
    id: string;
    name: string;
    slug: string;
    start_date: string;
    end_date: string;
    status: string;
  } | null;
}

export const fetchActiveSeason = createServerFn({ method: "POST" })
  .middleware([requireNexusUser])
  .handler(async ({ context }) => {
    return getActiveSeason(context.admin);
  });

export function tfMonth(month: number, year: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

// Returns ISO week key "YYYY-WNN" for a given date string "YYYY-MM-DD"
// Week starts on Monday
function getWeekKey(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00Z");
  const day = date.getUTCDay(); // 0=Sun, 1=Mon ... 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // adjust to Monday
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() + diff);
  const year = monday.getUTCFullYear();
  const startOfYear = new Date(Date.UTC(year, 0, 1));
  const weekNum = Math.ceil(
    ((monday.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getUTCDay() + 1) / 7,
  );
  return `${year}-W${String(weekNum).padStart(2, "0")}`;
}

// Recompute leaderboard snapshots for a given game+timeframe based on
// PUBLISHED tournaments in that period.
export async function recomputeSnapshot(
  admin: ReturnType<typeof getNexusAdmin>,
  game_id: string,
  store_id: string,
  timeframe_type: "MONTHLY" | "SEMESTRAL",
  timeframe_value: string,
  filter: { year?: number; month?: number; season_id?: string },
  season_id?: string,
) {
  // Épica 4: el leaderboard del Circuito Nacional (leaderboard_snapshots) solo
  // se calcula con torneos SIN liga interna (league_id null) — por default
  // ningún torneo de liga interna cuenta para el circuito padre. Si un
  // organizador quiere que un torneo nacional también cuente para su liga
  // interna, eso se hace al revés: agregándolo manualmente a la liga desde
  // "Torneos y premios" (store_league_tournaments), sin tocar este cálculo.
  let q = admin
    .from("tournaments")
    .select("id, store_id, tournament_date, qualifying_year, qualifying_month")
    .eq("status", "PUBLISHED")
    .eq("game_id", game_id)
    .eq("store_id", store_id)
    .is("league_id", null);
  if (filter.year != null) q = q.eq("qualifying_year", filter.year);
  if (filter.month != null) q = q.eq("qualifying_month", filter.month);
  if (filter.season_id != null) q = q.eq("season_id", filter.season_id);

  const { data: tournaments, error: te } = await q;
  if (te) failDb(te);
  const tIds = (tournaments ?? []).map((t) => t.id);

  const { error: de } = await admin
    .from("leaderboard_snapshots")
    .delete()
    .eq("game_id", game_id)
    .eq("store_id", store_id)
    .eq("timeframe_type", timeframe_type)
    .eq("timeframe_value", timeframe_value);
  if (de) failDb(de);

  if (tIds.length === 0) return;

  const { data: results, error: re } = await admin
    .from("tournament_results")
    .select("player_id, rank, points_earned, omw_percentage, tournament_id")
    .in("tournament_id", tIds);
  if (re) failDb(re);

  // Build a map from tournament_id -> tournament_date
  const tournamentDateMap = new Map<string, string>(
    (tournaments ?? []).map((t) => [t.id, t.tournament_date]),
  );

  // Group results by player_id -> week -> list of results
  type RawResult = {
    player_id: string;
    rank: number | null;
    points_earned: number | null;
    omw_percentage: number | null;
    tournament_id: string;
  };

  const playerWeekMap = new Map<string, Map<string, RawResult[]>>();

  for (const r of (results ?? []) as RawResult[]) {
    const date = tournamentDateMap.get(r.tournament_id);
    if (!date) continue;
    const weekKey = getWeekKey(date);

    if (!playerWeekMap.has(r.player_id)) {
      playerWeekMap.set(r.player_id, new Map());
    }
    const weekMap = playerWeekMap.get(r.player_id)!;
    if (!weekMap.has(weekKey)) {
      weekMap.set(weekKey, []);
    }
    weekMap.get(weekKey)!.push(r);
  }

  // For each player, apply top-2-per-week rule and aggregate
  type Agg = {
    total_points: number;
    played: number;
    won: number;
    omw_sum: number;
    omw_count: number;
  };
  const agg = new Map<string, Agg>();

  for (const [player_id, weekMap] of playerWeekMap.entries()) {
    const a: Agg = { total_points: 0, played: 0, won: 0, omw_sum: 0, omw_count: 0 };

    for (const weekResults of weekMap.values()) {
      a.played += weekResults.length;

      const top2 = weekResults
        .sort((x, y) => (y.points_earned ?? 0) - (x.points_earned ?? 0))
        .slice(0, 2);

      for (const r of top2) {
        a.total_points += r.points_earned ?? 0;
        if (r.rank === 1) a.won += 1;
        if (r.omw_percentage != null) {
          a.omw_sum += Number(r.omw_percentage);
          a.omw_count += 1;
        }
      }
    }

    agg.set(player_id, a);
  }

  const ranked = Array.from(agg.entries())
    .map(([player_id, a]) => ({ player_id, ...a }))
    .sort((a, b) => b.total_points - a.total_points);

  const rows = ranked.map((r, i) => ({
    player_id: r.player_id,
    game_id,
    store_id,
    timeframe_type,
    timeframe_value,
    season_id: season_id ?? null,
    total_points: r.total_points,
    tournaments_played: r.played,
    tournaments_won: r.won,
    omw_percentage: r.omw_count > 0 ? Math.round((r.omw_sum / r.omw_count) * 100) / 100 : 0,
    rank_position: i + 1,
    last_updated_at: new Date().toISOString(),
  }));

  if (rows.length === 0) return;
  const { error: ie } = await admin.from("leaderboard_snapshots").insert(rows);
  if (ie) failDb(ie);
}

// ---------- Torneos pendientes / aprobados ----------

export const PAGE_SIZE = 25;
