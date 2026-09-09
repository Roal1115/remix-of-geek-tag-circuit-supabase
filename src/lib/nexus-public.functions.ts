import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getNexusAdmin, failDb } from "./nexus-admin.server";
import { toLocalDateStr, todayInMexicoStr } from "./utils";
import { getClientIp } from "./rate-limit.server";

// ─── Dedupe de vistas de tienda por IP+sección ────────────────────────────
// ponytail: mismo patrón que registerAdView (dedupe en memoria del worker,
// se reinicia con cada isolate) — suficiente para que el conteo no se dispare
// por refresh/scroll repetido; migrar a tabla con constraint único si se
// vuelve algo facturable o cross-isolate.
const PAGE_VIEW_DEDUPE_MS = 30 * 60 * 1000;
const recentPageViews = new Map<string, number>();

function isDuplicatePageView(key: string): boolean {
  const now = Date.now();
  if (recentPageViews.size > 5000) {
    for (const [k, t] of recentPageViews) {
      if (now - t > PAGE_VIEW_DEDUPE_MS) recentPageViews.delete(k);
    }
  }
  const last = recentPageViews.get(key);
  if (last && now - last < PAGE_VIEW_DEDUPE_MS) return true;
  recentPageViews.set(key, now);
  return false;
}

// Registra una visita a una sección de la página pública de una tienda.
// No requiere sesión — es la página pública /stores/$slug.
export const logStorePageView = createServerFn({ method: "POST" })
  .inputValidator((d: { store_id: string; section: "profile" | "calendario" | "liga_interna" }) =>
    z
      .object({
        store_id: z.string().uuid(),
        section: z.enum(["profile", "calendario", "liga_interna"]),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    if (isDuplicatePageView(`storeview_${getClientIp()}_${data.store_id}_${data.section}`)) {
      return { success: true };
    }
    const admin = getNexusAdmin();
    await admin.from("store_page_views").insert({ store_id: data.store_id, section: data.section });
    return { success: true };
  });

export const getPublicStoresList = createServerFn({ method: "POST" }).handler(async () => {
  const admin = getNexusAdmin();
  const { data: stores, error } = await admin
    .from("stores")
    .select(
      "id, slug, name, city, state, zone, google_maps_url, opening_hours, instagram, website, twitter, twitch",
    )
    .eq("is_active", true)
    .order("name");
  if (error) failDb(error);

  const storeIds = (stores ?? []).map((s: any) => s.id);
  const { data: schedules } = storeIds.length
    ? await admin
        .from("store_schedules")
        .select("store_id, game_id, games(id, name)")
        .in("store_id", storeIds)
    : { data: [] as any[] };

  const gamesByStore = new Map<string, Array<{ id: string; name: string }>>();
  for (const s of (schedules ?? []) as any[]) {
    const arr = gamesByStore.get(s.store_id) ?? [];
    const g = Array.isArray(s.games) ? s.games[0] : s.games;
    if (g && !arr.some((x) => x.id === g.id)) arr.push(g);
    gamesByStore.set(s.store_id, arr);
  }

  return {
    stores: (stores ?? []).map((s: any) => ({
      ...s,
      games: gamesByStore.get(s.id) ?? [],
    })),
  };
});

export const getStoreProfile = createServerFn({ method: "POST" })
  .inputValidator((d: { slug: string }) => z.object({ slug: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data }) => {
    const admin = getNexusAdmin();
    const { data: store, error } = await admin
      .from("stores")
      .select(
        "id, slug, name, city, state, zone, address, phone, google_maps_url, description, opening_hours, instagram, website, twitter, twitch",
      )
      .eq("slug", data.slug)
      .eq("is_active", true)
      .maybeSingle();
    if (error) failDb(error);
    if (!store) throw new Error("Tienda no encontrada");

    const { data: schedules } = await admin
      .from("store_schedules")
      .select("game_id, games(id, name)")
      .eq("store_id", store.id);

    const games: Array<{ id: string; name: string }> = [];
    for (const s of (schedules ?? []) as any[]) {
      const g = Array.isArray(s.games) ? s.games[0] : s.games;
      if (g && !games.some((x) => x.id === g.id)) games.push(g);
    }

    return { store: { ...store, games } };
  });

// Historial público de torneos de una tienda — mismo criterio de status que
// el perfil público de jugador y getPublicTournament: solo APPROVED/PUBLISHED,
// nunca DRAFT ni rechazados.
export const getStoreTournamentHistory = createServerFn({ method: "POST" })
  .inputValidator((d: { slug: string }) => z.object({ slug: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data }) => {
    const admin = getNexusAdmin();
    const { data: store, error: storeErr } = await admin
      .from("stores")
      .select("id")
      .eq("slug", data.slug)
      .eq("is_active", true)
      .maybeSingle();
    if (storeErr) failDb(storeErr);
    if (!store) throw new Error("Tienda no encontrada");

    const { data: tournaments, error } = await admin
      .from("tournaments")
      .select(
        "id, tournament_date, game_id, league_id, games(name), store_leagues!tournaments_league_id_fkey(name)",
      )
      .eq("store_id", store.id)
      .in("status", ["APPROVED", "PUBLISHED"])
      .order("tournament_date", { ascending: false })
      .limit(200);
    if (error) failDb(error);

    const tournamentIds = (tournaments ?? []).map((t) => t.id);
    const { data: results, error: resultsErr } = tournamentIds.length
      ? await admin
          .from("tournament_results")
          .select("tournament_id")
          .in("tournament_id", tournamentIds)
      : { data: [] as { tournament_id: string }[], error: null };
    if (resultsErr) failDb(resultsErr);

    const participantCounts = new Map<string, number>();
    for (const r of results ?? []) {
      participantCounts.set(r.tournament_id, (participantCounts.get(r.tournament_id) ?? 0) + 1);
    }

    return {
      tournaments: (tournaments ?? []).map((t: any) => ({
        id: t.id,
        date: t.tournament_date as string,
        game_id: t.game_id as string,
        game_name: t.games?.name ?? "—",
        league_name:
          (Array.isArray(t.store_leagues) ? t.store_leagues[0] : t.store_leagues)?.name ?? null,
        participants: participantCounts.get(t.id) ?? 0,
      })),
    };
  });

export const getStoreWeeklySchedule = createServerFn({ method: "POST" })
  .inputValidator((d: { slug: string }) => z.object({ slug: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data }) => {
    const admin = getNexusAdmin();
    const { data: store } = await admin
      .from("stores")
      .select("id")
      .eq("slug", data.slug)
      .eq("is_active", true)
      .maybeSingle();
    if (!store) throw new Error("Tienda no encontrada");

    const { data: schedules, error } = await admin
      .from("store_schedules")
      .select("day_of_week, start_time, games(id, name)")
      .eq("store_id", store.id)
      .order("day_of_week")
      .order("start_time");
    if (error) failDb(error);

    return {
      schedule: (schedules ?? []).map((s: any) => ({
        day_of_week: s.day_of_week,
        start_time: String(s.start_time).slice(0, 5),
        game_name: s.games?.name ?? "—",
      })),
    };
  });

export const getPublicCalendar = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      game_id?: string | null;
      zone?: string | null;
      store_id?: string | null;
      store_ids?: string[] | null;
      week_start: string; // "YYYY-MM-DD" — lunes (semana Lun–Dom, estandarizada con el resto de la app, ver mondayOfWeek en utils)
    }) =>
      z
        .object({
          game_id: z.string().uuid().nullable().optional(),
          zone: z.string().nullable().optional(),
          store_id: z.string().uuid().nullable().optional(),
          store_ids: z.array(z.string().uuid()).max(5).nullable().optional(),
          week_start: z.string(),
        })
        .parse(d),
  )
  .handler(async ({ data }) => {
    const admin = getNexusAdmin();

    const weekStartDate = new Date(data.week_start + "T00:00:00");
    const weekDates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStartDate);
      d.setDate(weekStartDate.getDate() + i);
      return toLocalDateStr(d);
    });
    const weekEndStr = weekDates[6];
    // "Hoy" en hora de México — el server corre en UTC y a las 6pm MX
    // el toISOString() de UTC ya marca mañana, ocultando torneos de hoy.
    const today = todayInMexicoStr();
    const fromDate = data.week_start < today ? today : data.week_start;

    // 1. Torneos reales publicados en esta semana
    let tournamentQuery = admin
      .from("tournaments")
      .select(
        `
        id, tournament_date, tournament_time, game_id, store_id, league_id,
        stores!inner(id, slug, name, city, state, zone, address, phone, description, opening_hours, instagram, website, twitter, twitch, google_maps_url),
        games!inner(id, name, slug),
        store_leagues!tournaments_league_id_fkey(name)
      `,
      )
      .eq("status", "PUBLISHED")
      .gte("tournament_date", fromDate)
      .lte("tournament_date", weekEndStr);

    if (data.game_id) tournamentQuery = tournamentQuery.eq("game_id", data.game_id);
    if (data.store_ids?.length) {
      tournamentQuery = tournamentQuery.in("store_id", data.store_ids);
    } else if (data.store_id) {
      tournamentQuery = tournamentQuery.eq("store_id", data.store_id);
    }
    if (data.zone) tournamentQuery = tournamentQuery.eq("stores.zone", data.zone);

    const { data: tournaments, error } = await tournamentQuery;
    if (error) failDb(error);

    // 2. Store schedules (plantilla recurrente) — proyectar a fechas de esta semana
    let scheduleQuery = admin.from("store_schedules").select(
      `
        id, store_id, game_id, day_of_week, start_time,
        stores!inner(id, slug, name, city, state, zone, address, phone, description, opening_hours, instagram, website, twitter, twitch, google_maps_url),
        games!inner(id, name, slug)
      `,
    );

    if (data.game_id) scheduleQuery = scheduleQuery.eq("game_id", data.game_id);
    if (data.store_ids?.length) {
      scheduleQuery = scheduleQuery.in("store_id", data.store_ids);
    } else if (data.store_id) {
      scheduleQuery = scheduleQuery.eq("store_id", data.store_id);
    }
    if (data.zone) scheduleQuery = scheduleQuery.eq("stores.zone", data.zone);

    const { data: schedules, error: scheduleError } = await scheduleQuery;
    if (scheduleError) failDb(scheduleError);

    // 3. Horarios de ligas internas — comparten calendario con el circuito
    // nacional (Épica 4). shares_national_slot=true solo etiqueta el schedule
    // nacional con el nombre de la liga; false proyecta un slot propio.
    let leagueScheduleQuery = admin
      .from("store_league_schedules")
      .select(
        `
        id, store_id, game_id, day_of_week, start_time, shares_national_slot, national_schedule_id, league_id,
        games!inner(id, name, slug),
        store_leagues!inner(name, status),
        stores!inner(id, slug, name, city, state, zone, address, phone, description, opening_hours, instagram, website, twitter, twitch, google_maps_url)
      `,
      )
      .eq("store_leagues.status", "active");
    if (data.game_id) leagueScheduleQuery = leagueScheduleQuery.eq("game_id", data.game_id);
    if (data.store_ids?.length) {
      leagueScheduleQuery = leagueScheduleQuery.in("store_id", data.store_ids);
    } else if (data.store_id) {
      leagueScheduleQuery = leagueScheduleQuery.eq("store_id", data.store_id);
    }
    if (data.zone) leagueScheduleQuery = leagueScheduleQuery.eq("stores.zone", data.zone);

    const { data: leagueSchedules, error: leagueScheduleError } = await leagueScheduleQuery;
    if (leagueScheduleError) failDb(leagueScheduleError);

    const sharedLeagueNameByNationalId = new Map<string, string>();
    for (const s of (leagueSchedules ?? []) as any[]) {
      if (s.shares_national_slot && s.national_schedule_id) {
        sharedLeagueNameByNationalId.set(
          s.national_schedule_id,
          s.store_leagues?.name ?? "Liga interna",
        );
      }
    }

    // Excepciones puntuales (una fecha) a horarios de liga — mismo dato que ve
    // el organizador en /organizer/calendar, así ambas vistas quedan en sync.
    // Reindexadas por (store_id, league_id, fecha): aplican también a un
    // torneo ya subido para esa fecha, no solo a un slot proyectado.
    const leagueScheduleStoreLeagueById = new Map(
      (leagueSchedules ?? []).map((s: any) => [
        s.id,
        { store_id: s.store_id, league_id: s.league_id },
      ]),
    );
    const ownLeagueScheduleIds = (leagueSchedules ?? [])
      .filter((s: any) => !s.shares_national_slot)
      .map((s: any) => s.id);
    const { data: overrides } = ownLeagueScheduleIds.length
      ? await admin
          .from("store_league_schedule_overrides")
          .select("league_schedule_id, occurrence_date, start_time, label")
          .in("league_schedule_id", ownLeagueScheduleIds)
          .gte("occurrence_date", fromDate)
          .lte("occurrence_date", weekEndStr)
      : { data: [] as any[] };
    const overrideByStoreLeagueDate = new Map<
      string,
      { start_time: string | null; label: string | null }
    >();
    for (const o of (overrides ?? []) as any[]) {
      const sched = leagueScheduleStoreLeagueById.get(o.league_schedule_id);
      if (!sched) continue;
      overrideByStoreLeagueDate.set(`${sched.store_id}_${sched.league_id}_${o.occurrence_date}`, {
        start_time: o.start_time,
        label: o.label,
      });
    }

    const realTournamentKeys = new Set(
      (tournaments ?? []).map(
        (t: any) => `${t.store_id}_${t.tournament_date}_${t.league_id ?? "national"}`,
      ),
    );

    // Excepciones puntuales al schedule nacional — mismo dato que ve
    // admin/tcg_manager en su calendario, así todas las vistas quedan en sync.
    // Reindexadas por (store_id, game_id, fecha) en vez de schedule_id: así
    // aplican tanto a un slot proyectado como a un torneo YA subido para esa
    // fecha (que es el caso común — el override no vivía ahí antes y por eso
    // no se reflejaba en /calendar).
    const scheduleStoreGameById = new Map(
      (schedules ?? []).map((s: any) => [s.id, { store_id: s.store_id, game_id: s.game_id }]),
    );
    const nationalScheduleIds = (schedules ?? []).map((s: any) => s.id);
    const { data: nationalOverrides } = nationalScheduleIds.length
      ? await admin
          .from("store_schedule_overrides")
          .select("national_schedule_id, occurrence_date, start_time, label")
          .in("national_schedule_id", nationalScheduleIds)
          .gte("occurrence_date", fromDate)
          .lte("occurrence_date", weekEndStr)
      : { data: [] as any[] };
    const nationalOverrideByStoreGameDate = new Map<
      string,
      { start_time: string | null; label: string | null }
    >();
    for (const o of (nationalOverrides ?? []) as any[]) {
      const sched = scheduleStoreGameById.get(o.national_schedule_id);
      if (!sched) continue;
      nationalOverrideByStoreGameDate.set(
        `${sched.store_id}_${sched.game_id}_${o.occurrence_date}`,
        {
          start_time: o.start_time,
          label: o.label,
        },
      );
    }

    const scheduledEvents: any[] = [];
    for (const s of (schedules ?? []) as any[]) {
      for (const dateStr of weekDates) {
        if (dateStr < fromDate) continue;
        const d = new Date(dateStr + "T12:00:00");
        if (d.getDay() !== s.day_of_week) continue;
        if (realTournamentKeys.has(`${s.store_id}_${dateStr}_national`)) continue;

        const nationalOverride = nationalOverrideByStoreGameDate.get(
          `${s.store_id}_${s.game_id}_${dateStr}`,
        );

        scheduledEvents.push({
          id: `schedule_${s.id}_${dateStr}`,
          date: dateStr,
          time: nationalOverride?.start_time || s.start_time,
          game_id: s.game_id,
          game_name: nationalOverride?.label || (s.games?.name ?? "—"),
          game_slug: s.games?.slug ?? "",
          store_id: s.store_id,
          store_slug: s.stores?.slug ?? "",
          store_name: s.stores?.name ?? "—",
          store_city: s.stores?.city ?? "—",
          store_state: s.stores?.state ?? "—",
          store_address: s.stores?.address ?? null,
          store_phone: s.stores?.phone ?? null,
          store_description: s.stores?.description ?? null,
          store_opening_hours: s.stores?.opening_hours ?? null,
          store_instagram: s.stores?.instagram ?? null,
          store_website: s.stores?.website ?? null,
          store_twitter: s.stores?.twitter ?? null,
          store_twitch: s.stores?.twitch ?? null,
          store_google_maps_url: s.stores?.google_maps_url ?? null,
          zone: s.stores?.zone ?? "—",
          is_scheduled: true,
          league_id: null,
          league_name: sharedLeagueNameByNationalId.get(s.id) ?? null,
        });
      }
    }
    for (const s of (leagueSchedules ?? []) as any[]) {
      if (s.shares_national_slot) continue;
      for (const dateStr of weekDates) {
        if (dateStr < fromDate) continue;
        const d = new Date(dateStr + "T12:00:00");
        if (d.getDay() !== s.day_of_week) continue;
        if (realTournamentKeys.has(`${s.store_id}_${dateStr}_${s.league_id}`)) continue;

        const override = overrideByStoreLeagueDate.get(`${s.store_id}_${s.league_id}_${dateStr}`);

        scheduledEvents.push({
          id: `league_schedule_${s.id}_${dateStr}`,
          date: dateStr,
          time: override?.start_time || s.start_time,
          game_id: s.game_id,
          game_name: override?.label || (s.games?.name ?? "—"),
          game_slug: s.games?.slug ?? "",
          store_id: s.store_id,
          store_slug: s.stores?.slug ?? "",
          store_name: s.stores?.name ?? "—",
          store_city: s.stores?.city ?? "—",
          store_state: s.stores?.state ?? "—",
          store_address: s.stores?.address ?? null,
          store_phone: s.stores?.phone ?? null,
          store_description: s.stores?.description ?? null,
          store_opening_hours: s.stores?.opening_hours ?? null,
          store_instagram: s.stores?.instagram ?? null,
          store_website: s.stores?.website ?? null,
          store_twitter: s.stores?.twitter ?? null,
          store_twitch: s.stores?.twitch ?? null,
          store_google_maps_url: s.stores?.google_maps_url ?? null,
          zone: s.stores?.zone ?? "—",
          is_scheduled: true,
          league_id: s.league_id,
          league_name: s.store_leagues?.name ?? "Liga interna",
        });
      }
    }

    const allEvents = [
      ...(tournaments ?? []).map((t: any) => {
        // Un torneo ya subido también hereda la excepción puntual de esa
        // fecha (nacional si league_id es null, de liga si no) — antes solo
        // se aplicaba al slot proyectado y por eso no se veía en /calendar.
        const tOverride = t.league_id
          ? overrideByStoreLeagueDate.get(`${t.store_id}_${t.league_id}_${t.tournament_date}`)
          : nationalOverrideByStoreGameDate.get(`${t.store_id}_${t.game_id}_${t.tournament_date}`);
        return {
          id: t.id,
          date: t.tournament_date as string,
          time: tOverride?.start_time || t.tournament_time || null,
          game_id: t.game_id as string,
          game_name: tOverride?.label || (t.games?.name ?? "—"),
          game_slug: t.games?.slug ?? "",
          store_id: t.store_id as string,
          store_slug: t.stores?.slug ?? "",
          store_name: t.stores?.name ?? "—",
          store_city: t.stores?.city ?? "—",
          store_state: t.stores?.state ?? "—",
          store_address: t.stores?.address ?? null,
          store_phone: t.stores?.phone ?? null,
          store_description: t.stores?.description ?? null,
          store_opening_hours: t.stores?.opening_hours ?? null,
          store_instagram: t.stores?.instagram ?? null,
          store_website: t.stores?.website ?? null,
          store_twitter: t.stores?.twitter ?? null,
          store_twitch: t.stores?.twitch ?? null,
          store_google_maps_url: t.stores?.google_maps_url ?? null,
          zone: t.stores?.zone ?? "—",
          is_scheduled: false,
          league_id: t.league_id ?? null,
          league_name: t.store_leagues?.name ?? null,
        };
      }),
      ...scheduledEvents,
    ].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.time ?? "00:00").localeCompare(b.time ?? "00:00");
    });

    const { data: stores } = await admin
      .from("stores")
      .select("id, name, city, zone")
      .eq("is_active", true)
      .order("name");

    const zones = Array.from(
      new Set(((stores ?? []) as any[]).map((s: any) => s.zone).filter(Boolean)),
    ).sort();

    return {
      events: allEvents,
      stores: stores ?? [],
      zones,
    };
  });

type LeagueStanding = {
  player_id: string;
  geek_tag: string;
  total_points: number;
  tournaments_played: number;
  tournaments_won: number;
  omw_percentage: number;
};

async function computeLeagueStandings(
  admin: any,
  tournamentIds: string[],
): Promise<LeagueStanding[]> {
  if (!tournamentIds.length) return [];
  const { data: results } = await admin
    .from("tournament_results")
    .select("player_id, points_earned, rank, omw_percentage")
    .in("tournament_id", tournamentIds);

  type Agg = { points: number; played: number; won: number; omw_sum: number; omw_count: number };
  const agg = new Map<string, Agg>();
  for (const r of (results ?? []) as any[]) {
    const a = agg.get(r.player_id) ?? { points: 0, played: 0, won: 0, omw_sum: 0, omw_count: 0 };
    a.points += r.points_earned ?? 0;
    a.played += 1;
    if (r.rank === 1) a.won += 1;
    if (r.omw_percentage != null) {
      a.omw_sum += Number(r.omw_percentage);
      a.omw_count += 1;
    }
    agg.set(r.player_id, a);
  }

  const playerIds = Array.from(agg.keys());
  const { data: players } = playerIds.length
    ? await admin.from("players").select("id, geek_tag").in("id", playerIds)
    : { data: [] as any[] };
  const tagById = new Map<string, string>((players ?? []).map((p: any) => [p.id, p.geek_tag]));

  return Array.from(agg.entries())
    .map(([player_id, a]) => ({
      player_id,
      geek_tag: tagById.get(player_id) ?? "—",
      total_points: a.points,
      tournaments_played: a.played,
      tournaments_won: a.won,
      omw_percentage: a.omw_count > 0 ? Math.round((a.omw_sum / a.omw_count) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.total_points - a.total_points)
    .slice(0, 25);
}

// Una liga por TCG: la tienda puede tener varias ligas internas activas en
// paralelo (una para One Piece, otra para Riftbound, etc.) — antes solo se
// traía la más reciente (.limit(1)) sin importar el juego.
export const getStoreActiveLeagues = createServerFn({ method: "POST" })
  .inputValidator((d: { slug: string }) => z.object({ slug: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data }) => {
    const admin = getNexusAdmin();
    const { data: store } = await admin
      .from("stores")
      .select("id")
      .eq("slug", data.slug)
      .eq("is_active", true)
      .maybeSingle();
    if (!store) return { leagues: [] };

    const { data: leagues, error } = await admin
      .from("store_leagues")
      .select(
        "id, name, start_date, end_date, game_id, games(name), store_league_tournaments(tournament_id), store_league_prizes(id, description, image_url, sort_order)",
      )
      .eq("store_id", store.id)
      .eq("status", "active")
      .order("created_at", { ascending: false });
    if (error) failDb(error);

    const result = await Promise.all(
      (leagues ?? []).map(async (league: any) => {
        const tournamentIds = (league.store_league_tournaments ?? []).map(
          (t: any) => t.tournament_id,
        );
        return {
          id: league.id,
          name: league.name,
          game_id: league.game_id,
          game_name: (Array.isArray(league.games) ? league.games[0] : league.games)?.name ?? "—",
          start_date: league.start_date,
          end_date: league.end_date,
          prizes: (league.store_league_prizes ?? []).sort(
            (a: any, b: any) => a.sort_order - b.sort_order,
          ),
          standings: await computeLeagueStandings(admin, tournamentIds),
        };
      }),
    );

    return { leagues: result };
  });

export const getPublicTournament = createServerFn({ method: "POST" })
  .inputValidator((d: { tournament_id: string }) =>
    z.object({ tournament_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const admin = getNexusAdmin();

    // 1. Torneo — solo PUBLISHED
    const { data: t } = await admin
      .from("tournaments")
      .select(
        `id, tournament_date, tournament_time, status, game_id, store_id,
         stores!inner(id, slug, name, city, state, zone),
         games!inner(id, name, slug)`,
      )
      .eq("id", data.tournament_id)
      .eq("status", "PUBLISHED")
      .maybeSingle();

    if (!t) throw new Error("Torneo no encontrado o no publicado");
    const tournament = t as any;

    // 2. Standings
    const { data: results } = await admin
      .from("tournament_results")
      .select("player_id, rank, wins, losses, draws, points_earned, omw_percentage")
      .eq("tournament_id", data.tournament_id)
      .order("rank", { ascending: true });

    const resultList = (results ?? []) as any[];
    const playerIds = resultList.map((r) => r.player_id);

    if (playerIds.length === 0) {
      return {
        tournament: {
          id: tournament.id,
          date: tournament.tournament_date,
          time: tournament.tournament_time,
          game_name: tournament.games?.name ?? "—",
          game_slug: tournament.games?.slug ?? "",
          store_name: tournament.stores?.name ?? "—",
          store_slug: tournament.stores?.slug ?? "",
          store_city: tournament.stores?.city ?? "—",
          store_state: tournament.stores?.state ?? "—",
          zone: tournament.stores?.zone ?? "—",
        },
        standings: [],
        total_participants: 0,
      };
    }

    const { data: players } = await admin
      .from("players")
      .select("id, geek_tag, is_profile_public, auth_user_id")
      .in("id", playerIds);
    const playerMap = new Map(((players ?? []) as any[]).map((p) => [p.id, p]));

    // 3. Leader más jugado por cada player en este torneo
    const { data: rounds } = await admin
      .from("tournament_round_results")
      .select("player_id, player_leader_id")
      .eq("tournament_id", data.tournament_id)
      .not("player_leader_id", "is", null);

    const leaderCount = new Map<string, Map<string, number>>();
    for (const r of (rounds ?? []) as any[]) {
      if (!leaderCount.has(r.player_id)) leaderCount.set(r.player_id, new Map());
      const m = leaderCount.get(r.player_id)!;
      m.set(r.player_leader_id, (m.get(r.player_leader_id) ?? 0) + 1);
    }

    const topLeaderByPlayer = new Map<string, string>();
    for (const [pid, counts] of leaderCount.entries()) {
      const best = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
      if (best) topLeaderByPlayer.set(pid, best[0]);
    }

    // 4. Resolver leaders a canónico
    const rawLeaderIds = Array.from(new Set(topLeaderByPlayer.values()));
    const { data: rawLeaders } = rawLeaderIds.length
      ? await admin
          .from("deck_identifiers")
          .select("id, base_name, card_image, canonical_leader_id")
          .in("id", rawLeaderIds)
      : { data: [] as any[] };

    const variantToCanonical = new Map<string, string>();
    for (const l of (rawLeaders ?? []) as any[]) {
      if (l.canonical_leader_id) variantToCanonical.set(l.id, l.canonical_leader_id);
    }

    const existingIds = new Set(((rawLeaders ?? []) as any[]).map((l) => l.id));
    const missingCanonicalIds = Array.from(new Set(Array.from(variantToCanonical.values()))).filter(
      (id) => !existingIds.has(id),
    );

    const { data: canonicalLeaders } = missingCanonicalIds.length
      ? await admin
          .from("deck_identifiers")
          .select("id, base_name, card_image, canonical_leader_id")
          .in("id", missingCanonicalIds)
      : { data: [] as any[] };

    const leaderMap = new Map(
      [...((rawLeaders ?? []) as any[]), ...((canonicalLeaders ?? []) as any[])].map((l) => [
        l.id,
        l,
      ]),
    );
    const resolveId = (id: string): string => variantToCanonical.get(id) ?? id;

    // 5. Standings finales
    const standings = resultList.map((r) => {
      const p = playerMap.get(r.player_id) as any;
      const rawLeaderId = topLeaderByPlayer.get(r.player_id);
      const leader = rawLeaderId ? leaderMap.get(resolveId(rawLeaderId)) : null;
      // El líder solo se expone si el perfil del jugador es público, o si el
      // resultado no está ligado a ninguna cuenta real (auth_user_id null —
      // placeholder cargado por el TO, nadie a quien exponer). Un perfil
      // privado nunca debe filtrar su leader en una página pública.
      const canShowLeader = !p || !p.auth_user_id || Boolean(p.is_profile_public);
      return {
        rank: r.rank as number,
        geek_tag: p?.geek_tag ?? "—",
        is_profile_public: Boolean(p?.is_profile_public),
        wins: r.wins as number | null,
        losses: r.losses as number | null,
        draws: r.draws as number | null,
        points_earned: r.points_earned as number | null,
        omw_percentage: r.omw_percentage as number | null,
        leader_name: canShowLeader ? ((leader as any)?.base_name ?? null) : null,
        leader_image: canShowLeader ? ((leader as any)?.card_image ?? null) : null,
      };
    });

    return {
      tournament: {
        id: tournament.id,
        date: tournament.tournament_date,
        time: tournament.tournament_time,
        game_name: tournament.games?.name ?? "—",
        game_slug: tournament.games?.slug ?? "",
        store_name: tournament.stores?.name ?? "—",
        store_slug: tournament.stores?.slug ?? "",
        store_city: tournament.stores?.city ?? "—",
        store_state: tournament.stores?.state ?? "—",
        zone: tournament.stores?.zone ?? "—",
      },
      standings,
      total_participants: standings.length,
    };
  });
