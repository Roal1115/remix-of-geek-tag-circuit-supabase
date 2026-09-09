import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { failDb } from "./nexus-admin.server";
import { requireNexusManager, requireNexusAdmin } from "./nexus-auth.middleware";
import { loadTournamentDetail } from "./nexus-tournament-detail.server";
import {
  logAction,
  recomputeSnapshot,
  tfMonth,
  type TournamentStatus,
} from "./nexus-admin.functions";
import { mondayOfWeek, toLocalDateStr } from "./utils";
import { getManagerGameIds, assertManagerOwnsGame } from "./nexus-manager-shared";
import { httpUrlSchema } from "./nexus-admin-shared";

export const getStoreSchedulesForManager = createServerFn({ method: "POST" })
  .middleware([requireNexusManager])
  .inputValidator((d: { store_id: string }) => z.object({ store_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { admin, player } = context;
    const gameIds = await getManagerGameIds(admin, player);
    const [schedulesRes, gamesRes] = await Promise.all([
      admin
        .from("store_schedules")
        .select("id, store_id, game_id, day_of_week, start_time, games(id, name)")
        .eq("store_id", data.store_id)
        .in("game_id", gameIds.length ? gameIds : ["00000000-0000-0000-0000-000000000000"])
        .order("game_id")
        .order("day_of_week"),
      admin
        .from("games")
        .select("id, name")
        .eq("is_active", true)
        .in("id", gameIds.length ? gameIds : ["00000000-0000-0000-0000-000000000000"])
        .order("name"),
    ]);
    return {
      schedules: schedulesRes.data ?? [],
      games: gamesRes.data ?? [],
    };
  });

export const upsertStoreScheduleManager = createServerFn({ method: "POST" })
  .middleware([requireNexusManager])
  .inputValidator(
    (d: {
      store_id: string;
      game_id: string;
      day_of_week: number;
      start_time: string;
      id?: string;
    }) =>
      z
        .object({
          store_id: z.string().uuid(),
          game_id: z.string().uuid(),
          day_of_week: z.number().int().min(0).max(6),
          start_time: z.string().regex(/^\d{2}:\d{2}$/),
          id: z.string().uuid().optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { admin, player } = context;
    const gameIds = await getManagerGameIds(admin, player);
    if (!gameIds.includes(data.game_id)) {
      throw new Error("No tienes permisos para este TCG");
    }
    if (data.id) {
      const { error } = await admin
        .from("store_schedules")
        .update({
          game_id: data.game_id,
          day_of_week: data.day_of_week,
          start_time: data.start_time,
        })
        .eq("id", data.id);
      if (error) failDb(error);
    } else {
      const { error } = await admin.from("store_schedules").upsert(
        {
          store_id: data.store_id,
          game_id: data.game_id,
          day_of_week: data.day_of_week,
          start_time: data.start_time,
        },
        { onConflict: "store_id,game_id,day_of_week" },
      );
      if (error) failDb(error);
    }
    return { success: true };
  });

export const deleteStoreScheduleManager = createServerFn({ method: "POST" })
  .middleware([requireNexusManager])
  .inputValidator((d: { schedule_id: string }) =>
    z.object({ schedule_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { admin, player } = context;
    const { data: row } = await admin
      .from("store_schedules")
      .select("game_id")
      .eq("id", data.schedule_id)
      .maybeSingle();
    if (!row) throw new Error("Horario no encontrado");
    const gameIds = await getManagerGameIds(admin, player);
    if (!gameIds.includes((row as any).game_id)) {
      throw new Error("No tienes permisos para este TCG");
    }
    const { error } = await admin.from("store_schedules").delete().eq("id", data.schedule_id);
    if (error) failDb(error);
    return { success: true };
  });

// ==================== Unapprove Tournament (Manager) ====================

export const unapproveManagerTournament = createServerFn({ method: "POST" })
  .middleware([requireNexusManager])
  .inputValidator((d: { tournament_id: string; reason: string }) =>
    z
      .object({
        tournament_id: z.string().uuid(),
        reason: z.string().min(10, "El motivo debe tener al menos 10 caracteres"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { admin, player } = context;
    const { data: t } = await admin
      .from("tournaments")
      .select("status, game_id, store_id, tournament_date")
      .eq("id", data.tournament_id)
      .maybeSingle();
    if (!t || (t as any).status !== "APPROVED") {
      throw new Error("Torneo no válido para des-aprobación");
    }
    await assertManagerOwnsGame(admin, player, (t as any).game_id);
    const { error } = await admin
      .from("tournaments")
      .update({
        status: "DRAFT",
        approved_at: null,
        undo_deadline: null,
        approved_by: null,
        rejection_reason: data.reason,
      })
      .eq("id", data.tournament_id);
    if (error) failDb(error);
    await logAction(
      admin,
      player,
      "TOURNAMENT_REJECTED",
      "tournament",
      data.tournament_id,
      `${(t as any).game_id} — ${(t as any).store_id}`,
      { reason: data.reason, unapproved_by_role: player.role },
    );
    return { success: true };
  });

// ==================== List stores (Manager) ====================

export const listManagerStores = createServerFn({ method: "POST" })
  .middleware([requireNexusManager])
  .handler(async ({ context }) => {
    const { admin } = context;
    const { data } = await admin
      .from("stores")
      .select("id, name, city, state, is_active")
      .order("name");
    return { stores: data ?? [] };
  });

export const getManagerResponsibleStores = createServerFn({ method: "POST" })
  .middleware([requireNexusManager])
  .handler(async ({ context }) => {
    const { admin, player } = context;

    const gameIds = await getManagerGameIds(admin, player);
    if (gameIds.length === 0) return { stores: [], games: [] };

    const { data: schedules } = await admin
      .from("store_schedules")
      .select("store_id, game_id")
      .in("game_id", gameIds);

    const storeIds = Array.from(new Set((schedules ?? []).map((s: any) => s.store_id)));
    if (storeIds.length === 0) return { stores: [], games: [] };

    const { data: stores, error } = await admin
      .from("stores")
      .select(
        "id, name, city, state, country, is_active, address, phone, google_maps_url, description, opening_hours, instagram, website, twitter, twitch, zone",
      )
      .in("id", storeIds)
      .order("name");
    if (error) failDb(error);

    const { data: games } = await admin.from("games").select("id, name").in("id", gameIds);

    const storeGamesMap = new Map<string, string[]>();
    (schedules ?? []).forEach((s: any) => {
      const arr = storeGamesMap.get(s.store_id) ?? [];
      if (!arr.includes(s.game_id)) arr.push(s.game_id);
      storeGamesMap.set(s.store_id, arr);
    });

    return {
      stores: (stores ?? []).map((s: any) => ({
        ...s,
        available_game_ids: storeGamesMap.get(s.id) ?? [],
      })),
      games: games ?? [],
    };
  });

export const updateStoreData = createServerFn({ method: "POST" })
  .middleware([requireNexusManager])
  .inputValidator(
    (d: {
      store_id: string;
      name: string;
      city?: string;
      state?: string;
      address?: string;
      phone?: string;
      google_maps_url?: string;
      description?: string;
      opening_hours?: string;
      instagram?: string;
      website?: string;
      twitter?: string;
      twitch?: string;
    }) =>
      z
        .object({
          store_id: z.string().uuid(),
          name: z.string().min(1).max(120),
          city: z.string().max(120).optional(),
          state: z.string().max(120).optional(),
          address: z.string().max(300).optional(),
          phone: z.string().max(20).optional(),
          google_maps_url: httpUrlSchema,
          description: z.string().max(500).optional(),
          opening_hours: z.string().max(200).optional(),
          instagram: z.string().max(100).optional(),
          website: httpUrlSchema,
          twitter: z.string().max(100).optional(),
          twitch: z.string().max(100).optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { admin, player } = context;

    if (player.role !== "admin") {
      const gameIds = await getManagerGameIds(admin, player);
      const { data: schedule } = await admin
        .from("store_schedules")
        .select("id")
        .eq("store_id", data.store_id)
        .in("game_id", gameIds)
        .limit(1)
        .maybeSingle();
      if (!schedule) {
        throw new Error("No tienes permisos sobre esta tienda");
      }
    }

    const { store_id, ...fields } = data;
    const { error } = await admin
      .from("stores")
      .update({
        name: fields.name,
        city: fields.city || null,
        state: fields.state || null,
        address: fields.address || null,
        phone: fields.phone || null,
        google_maps_url: fields.google_maps_url || null,
        description: fields.description || null,
        opening_hours: fields.opening_hours || null,
        instagram: fields.instagram || null,
        website: fields.website || null,
        twitter: fields.twitter || null,
        twitch: fields.twitch || null,
      })
      .eq("id", store_id);
    if (error) failDb(error);

    await logAction(admin, player, "STORE_UPDATED", "store", store_id, fields.name);
    return { ok: true };
  });
