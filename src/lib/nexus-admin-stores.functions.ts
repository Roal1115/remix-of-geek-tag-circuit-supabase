import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { failDb } from "./nexus-admin.server";
import { requireNexusAdmin } from "./nexus-auth.middleware";
import { logAction, httpUrlSchema } from "./nexus-admin-shared";

export const listStoresWithOrganizers = createServerFn({ method: "POST" })
  .middleware([requireNexusAdmin])
  .handler(async ({ context }) => {
    const { admin } = context;
    const [storesRes, playersRes] = await Promise.all([
      admin
        .from("stores")
        .select(
          "id, slug, name, city, state, country, is_active, address, phone, google_maps_url, description, opening_hours, instagram, website, twitter, twitch, created_at",
        )
        .order("city", { ascending: true })
        .order("name", { ascending: true }),
      admin
        .from("players")
        .select("id, geek_tag, email, role, home_store_id")
        .in("role", ["organizer", "admin"]),
    ]);

    if (storesRes.error) failDb(storesRes.error);
    if (playersRes.error) failDb(playersRes.error);

    return {
      stores: storesRes.data ?? [],
      organizers: playersRes.data ?? [],
    };
  });

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

export const createStore = createServerFn({ method: "POST" })
  .middleware([requireNexusAdmin])
  .inputValidator(
    (d: {
      name: string;
      city?: string;
      state?: string;
      slug?: string;
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
          name: z.string().min(1).max(120),
          city: z.string().max(120).optional(),
          state: z.string().max(120).optional(),
          slug: z.string().max(80).optional(),
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
    const slug = data.slug && data.slug.trim() ? slugify(data.slug) : slugify(data.name);
    if (!slug) throw new Error("Nombre inválido para generar slug");
    const { data: newStore, error } = await admin
      .from("stores")
      .insert({
        slug,
        name: data.name,
        city: data.city || null,
        state: data.state || null,
        country: "MX",
        is_active: true,
        address: data.address || null,
        phone: data.phone || null,
        google_maps_url: data.google_maps_url || null,
        description: data.description || null,
        opening_hours: data.opening_hours || null,
        instagram: data.instagram || null,
        website: data.website || null,
        twitter: data.twitter || null,
        twitch: data.twitch || null,
      })
      .select("id")
      .maybeSingle();
    if (error) failDb(error);
    await logAction(admin, player, "STORE_CREATED", "store", newStore?.id ?? null, data.name, {
      city: data.city,
    });
    return { ok: true };
  });

export const setStoreActive = createServerFn({ method: "POST" })
  .middleware([requireNexusAdmin])
  .inputValidator((d: { store_id: string; is_active: boolean }) =>
    z
      .object({
        store_id: z.string().uuid(),
        is_active: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { admin } = context;
    const { error } = await admin
      .from("stores")
      .update({ is_active: data.is_active })
      .eq("id", data.store_id);
    if (error) failDb(error);
    return { ok: true };
  });

// ---------- Players ----------
export const updateStore = createServerFn({ method: "POST" })
  .middleware([requireNexusAdmin])
  .inputValidator(
    (d: {
      store_id: string;
      name: string;
      city?: string;
      state?: string;
      country?: string;
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
          country: z.string().min(2).max(2).optional(),
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
    const { error } = await admin
      .from("stores")
      .update({
        name: data.name,
        city: data.city || null,
        state: data.state || null,
        country: (data.country || "MX").toUpperCase(),
        address: data.address || null,
        phone: data.phone || null,
        google_maps_url: data.google_maps_url || null,
        description: data.description || null,
        opening_hours: data.opening_hours || null,
        instagram: data.instagram || null,
        website: data.website || null,
        twitter: data.twitter || null,
        twitch: data.twitch || null,
      })
      .eq("id", data.store_id);
    if (error) failDb(error);
    await logAction(admin, player, "STORE_UPDATED", "store", data.store_id, data.name, {
      changes: data as unknown as import("./database.types").Json,
    });
    return { ok: true };
  });

export const assignOrganizerToStore = createServerFn({ method: "POST" })
  .middleware([requireNexusAdmin])
  .inputValidator((d: { store_id: string; player_id: string }) =>
    z
      .object({
        store_id: z.string().uuid(),
        player_id: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { admin, player } = context;
    // Clear any other organizers that currently point to this store
    const { error: ce } = await admin
      .from("players")
      .update({ home_store_id: null })
      .eq("home_store_id", data.store_id)
      .neq("id", data.player_id);
    if (ce) failDb(ce);

    const { error } = await admin
      .from("players")
      .update({ home_store_id: data.store_id })
      .eq("id", data.player_id);
    if (error) failDb(error);

    const { data: store } = await admin
      .from("stores")
      .select("name")
      .eq("id", data.store_id)
      .maybeSingle();
    const { data: targetPlayer } = await admin
      .from("players")
      .select("geek_tag")
      .eq("id", data.player_id)
      .maybeSingle();
    await logAction(
      admin,
      player,
      "ORGANIZER_ASSIGNED",
      "store",
      data.store_id,
      store?.name ?? data.store_id,
      {
        player_id: data.player_id,
        geek_tag: targetPlayer?.geek_tag,
      },
    );
    return { ok: true };
  });

// ---------- Seasons ----------
export const getStoreSchedules = createServerFn({ method: "POST" })
  .middleware([requireNexusAdmin])
  .inputValidator((d: { store_id: string }) => z.object({ store_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { admin } = context;
    const [schedulesRes, gamesRes] = await Promise.all([
      admin
        .from("store_schedules")
        .select("id, store_id, game_id, day_of_week, start_time, games(id, name)")
        .eq("store_id", data.store_id)
        .order("game_id")
        .order("day_of_week"),
      admin.from("games").select("id, name").eq("is_active", true).order("name"),
    ]);
    return {
      schedules: schedulesRes.data ?? [],
      games: gamesRes.data ?? [],
    };
  });

export const upsertStoreSchedule = createServerFn({ method: "POST" })
  .middleware([requireNexusAdmin])
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
    const { admin } = context;
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

export const deleteStoreSchedule = createServerFn({ method: "POST" })
  .middleware([requireNexusAdmin])
  .inputValidator((d: { schedule_id: string }) =>
    z.object({ schedule_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.admin
      .from("store_schedules")
      .delete()
      .eq("id", data.schedule_id);
    if (error) failDb(error);
    return { success: true };
  });

// ==================== Delete Player Account ====================
