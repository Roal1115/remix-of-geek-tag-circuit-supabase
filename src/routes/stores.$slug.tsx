import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  MapPin,
  Navigation,
  Clock,
  Instagram,
  Globe,
  Twitter,
  Twitch,
  ArrowLeft,
  Phone,
  ChevronLeft,
  ChevronRight,
  Medal,
  Gift,
  Star,
  Trophy,
} from "lucide-react";
import {
  useWeekNav,
  useCalendarGrid,
  WeeklyGrid,
  dotColorForGame,
} from "@/components/calendar/weekly-grid";
import { getActiveSponsor, registerAdView } from "@/lib/nexus-ads.functions";
import { getStoreActiveLeagues, logStorePageView } from "@/lib/nexus-public.functions";
import { getMyFavoriteStores, toggleFavoriteStore } from "@/lib/nexus-player.functions";
import { useNexusRole } from "@/hooks/use-nexus-role";
import { AdVertical } from "@/components/ads/AdVertical";
import { AdHorizontal } from "@/components/ads/AdHorizontal";
import { storeProfileQuery, storeTournamentHistoryQuery } from "@/lib/stores-queries";
import { publicCalendarQuery } from "@/lib/calendar-queries";
import { SkeletonLine, SkeletonBlock } from "@/components/ui/skeleton-loader";
import { safeHref } from "@/lib/utils";

export const Route = createFileRoute("/stores/$slug")({
  head: () => ({ meta: [{ title: "Tienda — Nexus" }] }),
  loader: async ({ context, params }) => {
    try {
      return await context.queryClient.ensureQueryData(storeProfileQuery(params.slug));
    } catch {
      return undefined;
    }
  },
  component: StoreProfilePage,
});

// Refleja la estructura real de la página (hero, ubicación/actividad,
// calendario, historial) en vez de un spinner genérico — evita el salto de
// layout entre "cargando" y "cargado" que un spinner centrado no previene.
function StoreProfileSkeleton() {
  return (
    <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-6 px-4 sm:px-6 xl:grid-cols-[160px_minmax(0,1fr)_160px]">
      <aside className="hidden xl:block" />
      <main className="min-w-0 max-w-4xl space-y-6 py-10">
        <SkeletonLine width="w-40" height="h-3" />

        <div className="glass space-y-4 rounded-2xl p-6">
          <SkeletonLine width="w-24" height="h-3" />
          <SkeletonLine width="w-2/3" height="h-8" />
          <SkeletonLine width="w-full" height="h-4" />
          <div className="flex gap-2">
            <SkeletonLine width="w-20" height="h-6" className="rounded-md" />
            <SkeletonLine width="w-24" height="h-6" className="rounded-md" />
          </div>
          <div className="flex gap-2 pt-2">
            <SkeletonBlock className="h-9 w-32 rounded-md" />
            <SkeletonBlock className="h-9 w-9 rounded-md" />
            <SkeletonBlock className="h-9 w-9 rounded-md" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="glass space-y-3 rounded-2xl p-6">
            <SkeletonLine width="w-40" height="h-4" />
            <SkeletonLine width="w-full" height="h-3" />
            <SkeletonLine width="w-3/4" height="h-3" />
          </div>
          <div className="glass space-y-3 rounded-2xl p-6">
            <SkeletonLine width="w-32" height="h-4" />
            <SkeletonBlock className="h-9 w-full rounded-lg" />
            <SkeletonBlock className="h-9 w-full rounded-lg" />
            <SkeletonBlock className="h-9 w-full rounded-lg" />
          </div>
        </div>

        <div className="glass space-y-4 rounded-2xl p-6">
          <SkeletonLine width="w-48" height="h-4" />
          <SkeletonBlock className="h-96 w-full rounded-lg" />
        </div>

        <div className="glass space-y-2 rounded-2xl p-6">
          <SkeletonLine width="w-40" height="h-4" />
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonLine key={i} width="w-full" height="h-9" />
          ))}
        </div>
      </main>
      <aside className="hidden xl:block" />
    </div>
  );
}

function StoreProfilePage() {
  const { slug } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const navigate = useNavigate();

  const { data: profileData, isLoading: loading } = useQuery({
    ...storeProfileQuery(slug),
    initialData: loaderData,
    retry: false,
  });
  const store = profileData?.store ?? null;
  const notFound = !loading && !store;

  const { weekDates, weekStartStr, goToPrevWeek, goToNextWeek, goToToday, weekLabel } =
    useWeekNav();
  const [selectedEntry, setSelectedEntry] = useState<any | null>(null);
  const [mapExpanded, setMapExpanded] = useState(false);
  const { player } = useNexusRole();

  const fetchFavorites = useServerFn(getMyFavoriteStores);
  const toggleFavorite = useServerFn(toggleFavoriteStore);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);

  useEffect(() => {
    if (!player?.id || !store?.id) {
      setIsFavorite(false);
      return;
    }
    // Guard contra respuestas fuera de orden: si este efecto se re-dispara
    // (p.ej. el contexto de auth resuelve `player` en varios pasos) antes de
    // que la request anterior responda, esa respuesta vieja no debe pisar
    // el estado ya actualizado por la más reciente.
    let cancelled = false;
    fetchFavorites()
      .then((res: any) => {
        if (!cancelled) setIsFavorite((res.store_ids ?? []).includes(store.id));
      })
      .catch(() => {
        if (!cancelled) setIsFavorite(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player?.id, store?.id]);

  async function handleToggleFavorite() {
    if (!store?.id || favoriteBusy) return;
    setFavoriteBusy(true);
    setIsFavorite((v) => !v);
    try {
      const res: any = await toggleFavorite({ data: { store_id: store.id } });
      setIsFavorite(res.is_favorite);
    } catch {
      setIsFavorite((v) => !v);
    } finally {
      setFavoriteBusy(false);
    }
  }

  const fetchActiveSponsor = useServerFn(getActiveSponsor);
  const registerView = useServerFn(registerAdView);
  const [sponsor, setSponsor] = useState<any>(null);

  useEffect(() => {
    registerView()
      .then(setSponsor)
      .catch(() => {
        fetchActiveSponsor()
          .then(setSponsor)
          .catch(() => {});
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: calendarData, isLoading: calLoading } = useQuery({
    ...publicCalendarQuery({
      game_id: null,
      zone: null,
      store_id: store?.id ?? null,
      store_ids: null,
      week_start: weekStartStr,
    }),
    enabled: !!store?.id,
  });
  const events = calendarData?.events ?? [];

  const { data: historyData, isLoading: historyLoading } = useQuery({
    ...storeTournamentHistoryQuery(slug),
    enabled: !!slug,
  });
  const tournamentHistory = historyData?.tournaments ?? [];
  const uniqueHistoryGames = Array.from(
    new Map(
      tournamentHistory
        .filter((t) => t.game_id)
        .map((t) => [t.game_id, { id: t.game_id, name: t.game_name }]),
    ).values(),
  );
  const [historyGameFilter, setHistoryGameFilter] = useState<string | null>(null);
  const filteredHistory = historyGameFilter
    ? tournamentHistory.filter((t) => t.game_id === historyGameFilter)
    : tournamentHistory;
  const HISTORY_PAGE_SIZE = 10;
  const [historyPage, setHistoryPage] = useState(1);
  const historyTotalPages = Math.max(1, Math.ceil(filteredHistory.length / HISTORY_PAGE_SIZE));
  const paginatedHistory = filteredHistory.slice(
    (historyPage - 1) * HISTORY_PAGE_SIZE,
    historyPage * HISTORY_PAGE_SIZE,
  );

  const fetchActiveLeagues = useServerFn(getStoreActiveLeagues);
  const [leagues, setLeagues] = useState<any[]>([]);
  const [leagueLoading, setLeagueLoading] = useState(true);

  useEffect(() => {
    if (!store?.slug) return;
    setLeagueLoading(true);
    fetchActiveLeagues({ data: { slug: store.slug } })
      .then((res: any) => setLeagues(res.leagues ?? []))
      .catch(() => setLeagues([]))
      .finally(() => setLeagueLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store?.slug]);

  // Visitas a la página: registra "profile" al entrar, y "calendario" /
  // "liga_interna" cuando esas secciones realmente entran a la vista —
  // la página es un solo scroll con anchors, no rutas separadas, así que
  // IntersectionObserver es la única forma honesta de saber qué se mira.
  const logView = useServerFn(logStorePageView);
  const loggedSectionsRef = useRef(new Set<string>());
  const calendarioSectionRef = useRef<HTMLElement | null>(null);
  const ligaSectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!store?.id) return;
    const key = `${store.id}:profile`;
    if (loggedSectionsRef.current.has(key)) return;
    loggedSectionsRef.current.add(key);
    logView({ data: { store_id: store.id, section: "profile" } }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store?.id]);

  useEffect(() => {
    if (!store?.id) return;
    const targets: Array<{ el: HTMLElement | null; section: "calendario" | "liga_interna" }> = [
      { el: calendarioSectionRef.current, section: "calendario" },
      { el: ligaSectionRef.current, section: "liga_interna" },
    ];
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const match = targets.find((t) => t.el === entry.target);
          const key = `${store.id}:${match?.section}`;
          if (!match || loggedSectionsRef.current.has(key)) continue;
          loggedSectionsRef.current.add(key);
          logView({ data: { store_id: store.id!, section: match.section } }).catch(() => {});
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.4 },
    );
    for (const t of targets) {
      if (t.el) observer.observe(t.el);
    }
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store?.id, leagues, leagueLoading]);

  const calendarGrid = useCalendarGrid(events, weekDates);
  const gamesInSchedule = Array.from(
    new Map(events.map((e) => [e.game_slug, e.game_name])).entries(),
  );

  if (loading) {
    return <StoreProfileSkeleton />;
  }

  if (notFound || !store) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-16 text-center sm:px-6">
        <p className="text-sm text-gray-400">No encontramos esta tienda.</p>
        <Link to="/stores" className="text-sm font-semibold text-primary hover:underline">
          ← Volver al directorio
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-6 px-4 sm:px-6 xl:grid-cols-[160px_minmax(0,1fr)_160px]">
      <aside className="hidden xl:block">
        <AdVertical sponsor={sponsor} />
      </aside>

      <main className="min-w-0 max-w-4xl space-y-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/stores"
            className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400 hover:text-primary"
          >
            <ArrowLeft size={12} /> Volver al directorio
          </Link>
        </div>

        {/* Ad horizontal mobile */}
        <AdHorizontal sponsor={sponsor} />

        <header className="glass space-y-4 rounded-2xl p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">
                {store.zone ?? "—"}
              </p>
              <h1 className="text-3xl font-bold text-white">{store.name}</h1>
            </div>
            {player && (
              <button
                onClick={handleToggleFavorite}
                disabled={favoriteBusy}
                aria-pressed={isFavorite}
                title={isFavorite ? "Quitar de favoritas" : "Agregar a favoritas"}
                className={`flex-shrink-0 rounded-full border p-2.5 transition ${
                  isFavorite
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-white/10 text-gray-400 hover:border-primary/40 hover:text-primary"
                }`}
              >
                <Star size={18} className={isFavorite ? "fill-primary" : ""} />
              </button>
            )}
          </div>
          {store.description && <p className="text-sm text-gray-300">{store.description}</p>}

          {store.games.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {store.games.map((g: any) => (
                <span
                  key={g.id}
                  className="rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-primary"
                >
                  {g.name}
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex flex-wrap items-center gap-2">
              {safeHref(store.google_maps_url) && (
                <a
                  href={safeHref(store.google_maps_url)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-bold uppercase tracking-widest text-primary-foreground"
                >
                  <Navigation size={12} /> Cómo llegar
                </a>
              )}
              {leagues.length > 0 && (
                <a
                  href="#liga-interna"
                  className="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-primary hover:bg-primary/20"
                >
                  <Medal size={12} /> Ver Liga Interna
                </a>
              )}
            </div>

            {/* Contacto/social: secundario respecto a las acciones primarias
                de arriba — icon-only, sin fondo, separado por un divisor. */}
            {(store.instagram || safeHref(store.website) || store.twitter || store.twitch) && (
              <div className="flex items-center gap-3 border-l border-white/10 pl-3">
                {store.instagram && (
                  <a
                    href={`https://instagram.com/${store.instagram.replace("@", "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-gray-500 hover:text-primary"
                  >
                    <Instagram size={16} />
                  </a>
                )}
                {safeHref(store.website) && (
                  <a
                    href={safeHref(store.website)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-gray-500 hover:text-primary"
                  >
                    <Globe size={16} />
                  </a>
                )}
                {store.twitter && (
                  <a
                    href={`https://x.com/${store.twitter.replace("@", "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-gray-500 hover:text-primary"
                  >
                    <Twitter size={16} />
                  </a>
                )}
                {store.twitch && (
                  <a
                    href={`https://twitch.tv/${store.twitch.replace("@", "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-gray-500 hover:text-primary"
                  >
                    <Twitch size={16} />
                  </a>
                )}
              </div>
            )}
          </div>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Ubicación y horario: dirección, horario, teléfono y mapa
              consolidados en una sola unidad — antes vivían repartidos como
              cuatro tratamientos visuales distintos dentro del hero. El mapa
              queda colapsado por default: "Cómo llegar" ya cubre la acción de
              navegar, el iframe completo es peso visual redundante. */}
          <section className="glass space-y-3 rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white">Ubicación y horario</h2>
            {!(store.address || store.city || store.opening_hours || store.phone) ? (
              <p className="text-sm text-gray-500">
                La tienda sigue en proceso de configuración — pronto verás su dirección y horario
                aquí.
              </p>
            ) : (
              <>
                <div className="space-y-2 text-sm text-gray-300">
                  {(store.address || store.city) && (
                    <p className="flex items-center gap-1.5">
                      <MapPin size={14} className="flex-shrink-0 text-gray-500" />
                      {[store.address, store.city, store.state].filter(Boolean).join(", ")}
                    </p>
                  )}
                  {store.opening_hours && (
                    <p className="flex items-center gap-1.5">
                      <Clock size={14} className="flex-shrink-0 text-gray-500" />{" "}
                      {store.opening_hours}
                    </p>
                  )}
                  {store.phone && (
                    <p className="flex items-center gap-1.5">
                      <Phone size={14} className="flex-shrink-0 text-gray-500" /> {store.phone}
                    </p>
                  )}
                </div>

                {(store.address || store.city) && (
                  <button
                    onClick={() => setMapExpanded((v) => !v)}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    {mapExpanded ? "Ocultar mapa" : "Ver mapa"}
                  </button>
                )}

                {mapExpanded && (store.address || store.city) && (
                  <iframe
                    title={`Mapa de ${store.name}`}
                    src={`https://www.google.com/maps?q=${encodeURIComponent(
                      [store.name, store.address, store.city, store.state]
                        .filter(Boolean)
                        .join(", "),
                    )}&output=embed`}
                    className="h-64 w-full rounded-xl border border-white/10"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                )}
              </>
            )}
          </section>

          {/* Actividad reciente: señal rápida de "esta tienda está activa"
              sin obligar a bajar hasta el historial completo (que sigue
              existiendo, paginado, más abajo) — resuelve que la única
              prueba de actividad viviera hasta el fondo de la página. */}
          {historyLoading ? (
            <section className="glass space-y-3 rounded-2xl p-6">
              <SkeletonLine width="w-32" height="h-4" />
              <SkeletonBlock className="h-9 w-full rounded-lg" />
              <SkeletonBlock className="h-9 w-full rounded-lg" />
              <SkeletonBlock className="h-9 w-full rounded-lg" />
            </section>
          ) : tournamentHistory.length > 0 ? (
            <section className="glass space-y-3 rounded-2xl p-6">
              <h2 className="text-lg font-bold text-white">Actividad reciente</h2>
              <div className="space-y-2.5">
                {tournamentHistory.slice(0, 3).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => navigate({ to: "/tournaments/$id", params: { id: t.id } })}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-left text-xs hover:bg-white/[0.05]"
                  >
                    <span className="text-gray-300">
                      {new Date(t.date + "T12:00:00").toLocaleDateString("es-MX", {
                        day: "numeric",
                        month: "short",
                      })}
                      <span className="text-gray-500"> · {t.game_name}</span>
                    </span>
                    <span className="font-mono-stat text-gray-400">{t.participants} jug.</span>
                  </button>
                ))}
              </div>
              <a
                href="#historial-torneos"
                className="text-xs font-semibold text-primary hover:underline"
              >
                Ver historial completo →
              </a>
            </section>
          ) : (
            <section className="glass space-y-3 rounded-2xl p-6">
              <h2 className="text-lg font-bold text-white">Actividad reciente</h2>
              <p className="text-sm text-gray-500">
                Sin actividad reciente — todavía no hay torneos registrados en esta tienda.
              </p>
            </section>
          )}
        </div>

        <section
          id="calendario"
          ref={calendarioSectionRef}
          className="glass space-y-4 scroll-mt-20 rounded-2xl p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-white">Calendario de torneos</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={goToPrevWeek}
                className="rounded-lg border border-border p-2 text-secondary-foreground hover:text-white transition"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="min-w-[180px] text-center text-sm font-semibold text-white">
                {weekLabel}
              </span>
              <button
                onClick={goToNextWeek}
                className="rounded-lg border border-border p-2 text-secondary-foreground hover:text-white transition"
              >
                <ChevronRight size={16} />
              </button>
              <button
                onClick={goToToday}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:text-white transition"
              >
                Hoy
              </button>
            </div>
          </div>

          {gamesInSchedule.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              {gamesInSchedule.map(([slug, name]) => (
                <div key={slug} className="flex items-center gap-1.5 text-xs text-gray-400">
                  <span className={`h-2 w-2 rounded-full ${dotColorForGame(slug)}`} />
                  {name}
                </div>
              ))}
            </div>
          )}

          <div className="rounded-xl border border-white/10 bg-black/30 overflow-hidden">
            <WeeklyGrid
              weekDates={weekDates}
              calendarGrid={calendarGrid}
              attendedIds={new Set()}
              loading={calLoading}
              onSelectEntry={setSelectedEntry}
            />
          </div>
        </section>

        {leagueLoading ? (
          <section className="glass space-y-4 rounded-2xl p-6">
            <div>
              <SkeletonLine width="w-24" height="h-3" />
              <div className="mt-2">
                <SkeletonLine width="w-48" height="h-5" />
              </div>
              <div className="mt-2">
                <SkeletonLine width="w-32" height="h-3" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <SkeletonLine width="w-24" height="h-4" />
            </div>
            <div className="overflow-hidden rounded-xl border border-white/10">
              <table className="w-full text-sm">
                <thead className="bg-black/80 text-left text-[10px] uppercase tracking-wider text-gray-400">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Tag</th>
                    <th className="px-3 py-2 text-right">Pts</th>
                    <th className="px-3 py-2 text-right">Trn</th>
                    <th className="px-3 py-2 text-right">W</th>
                    <th className="px-3 py-2 text-right">OMW%</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-t border-white/5">
                      <td className="px-3 py-2.5">
                        <SkeletonLine width="w-4" height="h-3" />
                      </td>
                      <td className="px-3 py-2.5">
                        <SkeletonLine width="w-24" height="h-3" />
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex justify-end">
                          <SkeletonLine width="w-10" height="h-3" />
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex justify-end">
                          <SkeletonLine width="w-6" height="h-3" />
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex justify-end">
                          <SkeletonLine width="w-6" height="h-3" />
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex justify-end">
                          <SkeletonLine width="w-10" height="h-3" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {!leagueLoading && leagues.length > 0 && (
          <section id="liga-interna" ref={ligaSectionRef} className="scroll-mt-20 space-y-4">
            {/* Una sección por Liga Interna activa — una tienda puede correr
              una liga por TCG en paralelo (One Piece, Riftbound, etc.), así
              que ya no asumimos que hay una sola. */}
            {leagues.map((league: any) => (
              <section key={league.id} className="glass space-y-4 rounded-2xl p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">
                        Liga Interna
                      </p>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-300">
                        {league.game_name}
                      </span>
                    </div>
                    <h2 className="mt-1 text-lg font-bold text-white">{league.name}</h2>
                    <p className="text-xs text-gray-500">
                      {league.start_date} — {league.end_date}
                    </p>
                  </div>
                  {(() => {
                    const daysLeft = Math.ceil(
                      (new Date(league.end_date + "T23:59:59").getTime() - Date.now()) / 86_400_000,
                    );
                    if (daysLeft < 0) return null;
                    return (
                      <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                        {daysLeft === 0 ? "Último día" : `${daysLeft} días restantes`}
                      </span>
                    );
                  })()}
                </div>

                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Medal size={16} className="text-primary" />
                  Leaderboard
                </div>
                {league.standings.length === 0 ? (
                  <p className="text-sm text-gray-400">
                    Aún no hay resultados registrados en esta liga.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-white/10">
                    <table className="w-full text-sm">
                      <thead className="bg-black/80 text-left text-[10px] uppercase tracking-wider text-gray-400">
                        <tr>
                          <th className="px-3 py-2">#</th>
                          <th className="px-3 py-2">Tag</th>
                          <th className="px-3 py-2 text-right">Pts</th>
                          <th className="px-3 py-2 text-right" title="Torneos jugados">
                            Trn
                          </th>
                          <th className="px-3 py-2 text-right" title="Victorias">
                            W
                          </th>
                          <th className="px-3 py-2 text-right" title="Opponent Match Win %">
                            OMW%
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {league.standings.map((s: any, i: number) => {
                          const medalColor =
                            i === 0
                              ? "text-amber-400"
                              : i === 1
                                ? "text-slate-300"
                                : i === 2
                                  ? "text-orange-400"
                                  : "";
                          return (
                            <tr
                              key={s.player_id}
                              className={`border-t border-white/5 transition hover:bg-white/5 ${i < 3 ? "bg-primary/[0.03]" : ""}`}
                            >
                              <td className="px-3 py-2">
                                {i < 3 ? (
                                  <Trophy size={14} className={medalColor} />
                                ) : (
                                  <span className="font-mono text-xs text-gray-400">{i + 1}</span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <Link
                                  to="/players/$playerTag"
                                  params={{ playerTag: s.geek_tag }}
                                  className={`font-medium hover:text-primary hover:underline ${i < 3 ? "font-semibold text-white" : "text-white"}`}
                                >
                                  {s.geek_tag}
                                </Link>
                              </td>
                              <td className="px-3 py-2 text-right font-mono font-semibold text-white">
                                {s.total_points}
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-xs text-gray-400">
                                {s.tournaments_played}
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-xs text-gray-400">
                                {s.tournaments_won}
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-xs text-gray-400">
                                {s.omw_percentage}%
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {league.prizes.length > 0 && (
                  <div className="space-y-3 border-t border-white/10 pt-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-white">
                      <Gift size={16} className="text-primary" />
                      Premios y Recompensas
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {league.prizes.map((p: any) => (
                        <div
                          key={p.id}
                          className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-3"
                        >
                          {p.image_url && (
                            <img
                              src={p.image_url}
                              alt=""
                              className="h-12 w-12 rounded object-cover"
                            />
                          )}
                          <p className="text-sm text-gray-300">{p.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            ))}
          </section>
        )}

        <section id="historial-torneos" className="glass space-y-4 scroll-mt-20 rounded-2xl p-6">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-white">Historial de torneos</h2>
            {uniqueHistoryGames.length === 1 && (
              <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                {uniqueHistoryGames[0].name}
              </span>
            )}
          </div>

          {uniqueHistoryGames.length > 1 && (
            <div className="flex overflow-x-auto border-b border-white/10">
              <button
                onClick={() => {
                  setHistoryGameFilter(null);
                  setHistoryPage(1);
                }}
                className={`px-4 py-2 text-xs font-medium whitespace-nowrap border-b-2 -mb-px transition flex-shrink-0 ${
                  historyGameFilter === null
                    ? "border-primary text-white"
                    : "border-transparent text-gray-400 hover:text-gray-200"
                }`}
              >
                Todos ({tournamentHistory.length})
              </button>
              {uniqueHistoryGames.map((g) => {
                const count = tournamentHistory.filter((t) => t.game_id === g.id).length;
                return (
                  <button
                    key={g.id}
                    onClick={() => {
                      setHistoryGameFilter(g.id);
                      setHistoryPage(1);
                    }}
                    className={`px-4 py-2 text-xs font-medium whitespace-nowrap border-b-2 -mb-px transition flex-shrink-0 ${
                      historyGameFilter === g.id
                        ? "border-primary text-white"
                        : "border-transparent text-gray-400 hover:text-gray-200"
                    }`}
                  >
                    {g.name} ({count})
                  </button>
                );
              })}
            </div>
          )}

          {historyLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonLine key={i} width="w-full" height="h-9" />
              ))}
            </div>
          ) : filteredHistory.length === 0 ? (
            <p className="text-sm text-gray-500">
              {tournamentHistory.length === 0
                ? "Esta tienda aún no tiene torneos registrados en el circuito."
                : "Sin torneos para este TCG."}
            </p>
          ) : (
            <>
              {/* Desktop */}
              <div className="hidden overflow-x-auto rounded-xl border border-white/10 sm:block">
                <table className="w-full text-sm">
                  <thead className="bg-black/30 text-xs uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-4 py-2 text-left">Fecha</th>
                      {uniqueHistoryGames.length > 1 && (
                        <th className="px-4 py-2 text-left">TCG</th>
                      )}
                      <th className="px-4 py-2 text-left">Liga</th>
                      <th className="px-4 py-2 text-right">Jugadores</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedHistory.map((t) => (
                      <tr
                        key={t.id}
                        onClick={() => navigate({ to: "/tournaments/$id", params: { id: t.id } })}
                        className="cursor-pointer border-b border-white/5 last:border-b-0 hover:bg-white/[0.03]"
                      >
                        <td className="px-4 py-3 text-gray-400 font-mono-stat text-xs">
                          {new Date(t.date + "T12:00:00").toLocaleDateString("es-MX", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                        {uniqueHistoryGames.length > 1 && (
                          <td className="px-4 py-3 text-white">{t.game_name}</td>
                        )}
                        <td className="px-4 py-3">
                          {t.league_name ? (
                            <span className="inline-block rounded-full bg-fuchsia-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-fuchsia-300">
                              {t.league_name}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-600">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono-stat text-xs text-gray-300">
                          {t.participants}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile */}
              <div className="divide-y divide-white/5 sm:hidden">
                {paginatedHistory.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => navigate({ to: "/tournaments/$id", params: { id: t.id } })}
                    className="cursor-pointer px-1 py-3 active:bg-white/[0.03]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono-stat text-xs text-gray-400">
                          {new Date(t.date + "T12:00:00").toLocaleDateString("es-MX", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          {uniqueHistoryGames.length > 1 && (
                            <span className="text-sm font-semibold text-white">{t.game_name}</span>
                          )}
                          {t.league_name && (
                            <span className="inline-block rounded-full bg-fuchsia-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-fuchsia-300">
                              {t.league_name}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="font-mono-stat text-xs text-gray-300 whitespace-nowrap">
                        {t.participants} jug.
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {historyTotalPages > 1 && (
            <div className="flex items-center justify-between border-t border-white/10 pt-3">
              <div className="text-xs text-gray-400">
                Página {historyPage} de {historyTotalPages}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setHistoryPage((p) => p - 1)}
                  disabled={historyPage <= 1}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-gray-400 hover:text-white disabled:opacity-30"
                >
                  ← Anterior
                </button>
                <button
                  onClick={() => setHistoryPage((p) => p + 1)}
                  disabled={historyPage >= historyTotalPages}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-gray-400 hover:text-white disabled:opacity-30"
                >
                  Siguiente →
                </button>
              </div>
            </div>
          )}
        </section>

        {selectedEntry && (
          <div
            className="animate-in fade-in-0 duration-200 fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setSelectedEntry(null)}
          >
            <div
              className="animate-in fade-in-0 zoom-in-95 duration-200 glass w-full max-w-sm rounded-2xl border border-border p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="inline-block rounded-full bg-primary/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary mb-3">
                {selectedEntry.game_name}
              </span>
              {selectedEntry.league_name && (
                <span className="ml-2 inline-block rounded-full bg-fuchsia-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-fuchsia-300 mb-3">
                  {selectedEntry.league_name}
                </span>
              )}
              <h3 className="text-lg font-bold text-white">{selectedEntry.store_name}</h3>
              <div className="mt-3 space-y-2 text-sm text-secondary-foreground">
                {selectedEntry.time && (
                  <p className="flex items-center gap-2">
                    <Clock size={14} className="flex-shrink-0 text-muted-foreground" />
                    {selectedEntry.time.slice(0, 5)} hrs
                  </p>
                )}
                <p className="flex items-center gap-2">
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px]">
                    {selectedEntry.zone}
                  </span>
                </p>
              </div>
              <button
                onClick={() => setSelectedEntry(null)}
                className="mt-5 w-full rounded-xl border border-border py-2.5 text-sm font-medium text-secondary-foreground hover:text-white transition"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}
      </main>

      <aside className="hidden xl:block">
        <AdVertical sponsor={sponsor} />
      </aside>
    </div>
  );
}
