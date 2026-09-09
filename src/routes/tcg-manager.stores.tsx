import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  Search,
  CalendarDays,
  Instagram,
  Globe,
  Twitch,
  Twitter,
  MapPin,
  Phone,
  Clock,
  Map as MapIcon,
} from "lucide-react";
import { toast } from "sonner";
import { StoreCardSkeleton } from "@/components/ui/skeleton-loader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  getManagerResponsibleStores,
  getStoreSchedulesForManager,
  upsertStoreScheduleManager,
  deleteStoreScheduleManager,
} from "@/lib/nexus-manager.functions";
import { StoreSchedulesDialog } from "@/components/admin/StoreSchedulesDialog";
import { StoreEditModal } from "@/components/stores/StoreEditModal";
import { safeHref } from "@/lib/utils";

export const Route = createFileRoute("/tcg-manager/stores")({
  head: () => ({ meta: [{ title: "Tiendas — TCG Manager" }] }),
  component: ManagerStoresPage,
});

type Store = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  country?: string | null;
  is_active: boolean | null;
  address?: string | null;
  phone?: string | null;
  google_maps_url?: string | null;
  description?: string | null;
  opening_hours?: string | null;
  instagram?: string | null;
  website?: string | null;
  twitter?: string | null;
  twitch?: string | null;
  zone?: string | null;
  available_game_ids: string[];
};

type Game = { id: string; name: string };

function ManagerStoresPage() {
  const fetchStores = useServerFn(getManagerResponsibleStores);
  const fetchSchedulesFn = useServerFn(getStoreSchedulesForManager);
  const upsertScheduleFn = useServerFn(upsertStoreScheduleManager);
  const deleteScheduleFn = useServerFn(deleteStoreScheduleManager);

  const [stores, setStores] = useState<Store[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchRaw, setSearchRaw] = useState("");
  const [search, setSearch] = useState("");
  const [schedStore, setSchedStore] = useState<Store | null>(null);
  const [editStore, setEditStore] = useState<Store | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchRaw.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [searchRaw]);

  const refresh = async () => {
    setLoading(true);
    try {
      const res: any = await fetchStores();
      setStores((res.stores ?? []) as Store[]);
      setGames((res.games ?? []) as Game[]);
    } catch (e) {
      toast.error(String((e as Error).message ?? e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    return stores.filter((s) => {
      if (!search) return true;
      const hay = `${s.name} ${s.city ?? ""} ${s.state ?? ""}`.toLowerCase();
      return hay.includes(search);
    });
  }, [stores, search]);

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <StoreCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">Red</p>
        <h1 className="mt-2 text-3xl font-bold text-white">Tiendas a tu cargo</h1>
        <p className="mt-1 text-sm text-gray-400">
          Gestiona la información y los horarios de torneos de las tiendas que ofrecen tus TCGs.
        </p>
      </header>

      <div className="glass flex flex-wrap items-center gap-3 rounded-2xl p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <Input
            value={searchRaw}
            onChange={(e) => setSearchRaw(e.target.value)}
            placeholder="Buscar por nombre, ciudad o estado..."
            className="pl-9"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-sm text-gray-400">
          No hay tiendas que coincidan.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((s) => (
            <div key={s.id} className="glass rounded-2xl p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-white font-bold text-lg">{s.name}</h3>
                  <p className="text-xs text-gray-400">
                    {s.city ?? "—"}
                    {s.state ? ` · ${s.state}` : ""}
                    {s.zone ? ` · ${s.zone}` : ""}
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={() => setEditStore(s)}
                    className="text-xs text-primary hover:underline"
                  >
                    Editar
                  </button>
                  <Button size="sm" variant="outline" onClick={() => setSchedStore(s)}>
                    <CalendarDays size={13} className="mr-1.5" />
                    Torneos
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {s.available_game_ids.map((gid) => {
                  const g = games.find((x) => x.id === gid);
                  return (
                    <span
                      key={gid}
                      className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-semibold text-primary"
                    >
                      {g?.name ?? "—"}
                    </span>
                  );
                })}
              </div>

              <div className="space-y-1.5 text-xs text-gray-300">
                <div className="flex items-start gap-2">
                  <MapPin size={12} className="mt-0.5 text-gray-500 shrink-0" />
                  <span>{s.address || "—"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone size={12} className="text-gray-500 shrink-0" />
                  <span>{s.phone || "—"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock size={12} className="text-gray-500 shrink-0" />
                  <span>{s.opening_hours || "—"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapIcon size={12} className="text-gray-500 shrink-0" />
                  {safeHref(s.google_maps_url) ? (
                    <a
                      href={safeHref(s.google_maps_url)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline"
                    >
                      Ver mapa
                    </a>
                  ) : (
                    <span>—</span>
                  )}
                </div>
              </div>

              {(s.instagram || s.website || s.twitter || s.twitch) && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
                  {s.instagram && (
                    <a
                      href={`https://instagram.com/${s.instagram.replace("@", "")}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-gray-300 hover:text-primary"
                    >
                      <Instagram size={12} /> Instagram
                    </a>
                  )}
                  {safeHref(s.website) && (
                    <a
                      href={safeHref(s.website)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-gray-300 hover:text-primary"
                    >
                      <Globe size={12} /> Web
                    </a>
                  )}
                  {s.twitter && (
                    <a
                      href={`https://x.com/${s.twitter.replace("@", "")}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-gray-300 hover:text-primary"
                    >
                      <Twitter size={12} /> X
                    </a>
                  )}
                  {s.twitch && (
                    <a
                      href={`https://twitch.tv/${s.twitch}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-gray-300 hover:text-primary"
                    >
                      <Twitch size={12} /> Twitch
                    </a>
                  )}
                </div>
              )}

              {s.description && (
                <p className="text-xs text-gray-400 leading-relaxed pt-2 border-t border-white/5">
                  {s.description}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <StoreSchedulesDialog
        store={schedStore ? { id: schedStore.id, name: schedStore.name } : null}
        onClose={() => setSchedStore(null)}
        fns={{
          fetch: fetchSchedulesFn as any,
          upsert: upsertScheduleFn as any,
          remove: deleteScheduleFn as any,
        }}
      />

      {editStore && (
        <StoreEditModal
          store={editStore}
          onClose={() => setEditStore(null)}
          onSaved={() => void refresh()}
        />
      )}
    </div>
  );
}
