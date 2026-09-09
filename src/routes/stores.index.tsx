import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { StoreCardSkeleton } from "@/components/ui/skeleton-loader";
import {
  Loader2,
  MapPin,
  Navigation,
  Clock,
  Instagram,
  Globe,
  Twitter,
  Twitch,
  Star,
} from "lucide-react";
import { toast } from "sonner";
import { getMyFavoriteStores, toggleFavoriteStore } from "@/lib/nexus-player.functions";
import { useNexusRole } from "@/hooks/use-nexus-role";
import { publicStoresQuery } from "@/lib/stores-queries";

export const Route = createFileRoute("/stores/")({
  head: () => ({ meta: [{ title: "Tiendas — Nexus" }] }),
  loader: async ({ context }) => {
    try {
      return await context.queryClient.ensureQueryData(publicStoresQuery());
    } catch {
      return undefined;
    }
  },
  component: TiendasPage,
});

const ZONES = ["Zona Monterrey", "Zona Guadalajara", "Zona Centro", "Zona Extendida"];

type StoreCard = {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  state: string | null;
  zone: string | null;
  google_maps_url: string | null;
  opening_hours: string | null;
  instagram: string | null;
  website: string | null;
  twitter: string | null;
  twitch: string | null;
  games: Array<{ id: string; name: string }>;
};

function FavoriteStar({
  storeId,
  storeName,
  isFavorite,
  isToggling,
  onToggle,
}: {
  storeId: string;
  storeName: string;
  isFavorite: boolean;
  isToggling: boolean;
  onToggle: (id: string, name: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle(storeId, storeName);
      }}
      disabled={isToggling}
      aria-label={
        isFavorite ? `Quitar ${storeName} de favoritas` : `Marcar ${storeName} como favorita`
      }
      aria-pressed={isFavorite}
      className={`rounded-md p-1.5 transition disabled:opacity-40 ${
        isFavorite
          ? "text-[#FFD54A] hover:bg-[#FFD54A]/10"
          : "text-muted-foreground hover:bg-white/5 hover:text-[#FFD54A]"
      }`}
    >
      <Star size={16} fill={isFavorite ? "currentColor" : "none"} />
    </button>
  );
}

function StoreCardItem({
  store,
  favoriteSlot,
}: {
  store: StoreCard;
  favoriteSlot?: React.ReactNode;
}) {
  return (
    <Link
      to="/stores/$slug"
      params={{ slug: store.slug }}
      className="glass block rounded-2xl p-5 transition hover:border-primary/40 hover:bg-white/[0.04]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold text-white">{store.name}</h3>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-400">
            <MapPin size={12} /> {store.city ?? "—"}
          </p>
        </div>
        {favoriteSlot}
      </div>

      {store.games.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {store.games.map((g) => (
            <span
              key={g.id}
              className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-gray-300"
            >
              {g.name}
            </span>
          ))}
        </div>
      )}

      {store.opening_hours && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-gray-500">
          <Clock size={12} /> {store.opening_hours}
        </p>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3">
        <div className="flex items-center gap-3 text-gray-500">
          {store.instagram && <Instagram size={14} />}
          {store.website && <Globe size={14} />}
          {store.twitter && <Twitter size={14} />}
          {store.twitch && <Twitch size={14} />}
        </div>
        {store.google_maps_url && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              window.open(store.google_maps_url!, "_blank", "noopener,noreferrer");
            }}
            className="flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 cursor-pointer"
          >
            <Navigation size={12} /> Cómo llegar
          </button>
        )}
      </div>
    </Link>
  );
}

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

const gridVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

function TiendasPage() {
  const fetchFavorites = useServerFn(getMyFavoriteStores);
  const toggleFav = useServerFn(toggleFavoriteStore);
  const { player } = useNexusRole();
  const loaderData = Route.useLoaderData();

  const { data: storesData, isLoading: loading } = useQuery({
    ...publicStoresQuery(),
    initialData: loaderData,
  });
  const stores: StoreCard[] = storesData?.stores ?? [];
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    if (!player?.id) {
      setFavoriteIds(new Set());
      return;
    }
    // Guard contra respuestas fuera de orden — mismo fix que stores.$slug.tsx.
    let cancelled = false;
    fetchFavorites()
      .then((res: any) => {
        if (!cancelled) setFavoriteIds(new Set(res.store_ids ?? []));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player?.id]);

  const handleToggleFavorite = async (storeId: string, storeName: string) => {
    const wasFavorite = favoriteIds.has(storeId);
    setTogglingId(storeId);
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (wasFavorite) next.delete(storeId);
      else next.add(storeId);
      return next;
    });
    try {
      await toggleFav({ data: { store_id: storeId } });
      toast.success(
        wasFavorite ? `${storeName} quitada de favoritas` : `${storeName} agregada a favoritas`,
      );
    } catch (e: any) {
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (wasFavorite) next.add(storeId);
        else next.delete(storeId);
        return next;
      });
      toast.error(e?.message ?? "No se pudo actualizar favoritas");
    } finally {
      setTogglingId(null);
    }
  };

  const favoriteStores = useMemo(
    () => stores.filter((s) => favoriteIds.has(s.id)),
    [stores, favoriteIds],
  );
  const otherStores = useMemo(
    () => stores.filter((s) => !favoriteIds.has(s.id)),
    [stores, favoriteIds],
  );

  const renderStar = (s: StoreCard) =>
    player ? (
      <FavoriteStar
        storeId={s.id}
        storeName={s.name}
        isFavorite={favoriteIds.has(s.id)}
        isToggling={togglingId === s.id}
        onToggle={handleToggleFavorite}
      />
    ) : undefined;

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl space-y-10 px-4 py-10 sm:px-6">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">Nexus</p>
          <h1 className="text-4xl font-bold text-white">Tiendas del Circuito</h1>
        </header>
        <div className="space-y-8">
          {[1, 2].map((zone) => (
            <div key={zone} className="space-y-4">
              <div className="h-6 w-40 rounded-md bg-white/[0.06] animate-pulse" />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <StoreCardSkeleton key={i} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 py-10 sm:px-6">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">Nexus</p>
        <h1 className="text-4xl font-bold text-white">Tiendas del Circuito</h1>
        <p className="max-w-2xl text-sm text-gray-400">Encuentra dónde jugar en cada región.</p>
      </header>

      {player && favoriteStores.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Star size={18} className="text-[#FFD54A]" fill="currentColor" />
            <h2 className="text-xl font-bold uppercase tracking-wider text-white">
              Mis tiendas favoritas
            </h2>
            <span className="text-xs text-gray-400">{favoriteStores.length}/5</span>
          </div>
          <motion.div
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            variants={gridVariants}
            initial="hidden"
            animate="show"
          >
            {favoriteStores.map((s) => (
              <motion.div key={s.id} variants={cardVariants}>
                <StoreCardItem store={s} favoriteSlot={renderStar(s)} />
              </motion.div>
            ))}
          </motion.div>
        </section>
      )}

      {player && favoriteStores.length > 0 && (
        <h2 className="text-xl font-bold uppercase tracking-wider text-white">Todas las tiendas</h2>
      )}

      {ZONES.map((zone) => {
        const zoneStores = otherStores.filter((s) => s.zone === zone);
        if (zoneStores.length === 0) return null;
        return (
          <section key={zone} className="space-y-4">
            <h2 className="text-xl font-bold uppercase tracking-wider text-white">{zone}</h2>
            <motion.div
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
              variants={gridVariants}
              initial="hidden"
              animate="show"
            >
              {zoneStores.map((s) => (
                <motion.div key={s.id} variants={cardVariants}>
                  <StoreCardItem store={s} favoriteSlot={renderStar(s)} />
                </motion.div>
              ))}
            </motion.div>
          </section>
        );
      })}

      {stores.length === 0 && (
        <p className="text-sm text-gray-400">Aún no hay tiendas registradas.</p>
      )}
    </div>
  );
}
