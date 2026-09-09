import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Crown, Lock, Share2, Sparkles, Target, TrendingUp, Trophy } from "lucide-react";
import { playerProfileQuery, playerAchievementsQuery } from "@/lib/player-profile-queries";
import { shareProfileWithCard } from "@/lib/share-card";
import { getActiveSponsor, registerAdView } from "@/lib/nexus-ads.functions";
import { setEquippedNameplate } from "@/lib/nexus-player.functions";
import { isNameplateReward } from "@/lib/achievement-rewards";
import { AdVertical } from "@/components/ads/AdVertical";
import { AdHorizontal } from "@/components/ads/AdHorizontal";
import { NameplateBanner } from "@/components/player/NameplateBanner";
import { SkeletonBlock, SkeletonLine } from "@/components/ui/skeleton-loader";

export const Route = createFileRoute("/players/$playerTag")({
  // defaultPreload: "intent" (router.tsx) dispara este loader al hover de
  // cualquier <Link> a este perfil (p. ej. una fila del leaderboard) — para
  // cuando el usuario suelta el click, el query ya está resuelto en caché.
  //
  // Best effort a propósito: si falla (p. ej. "Jugador no encontrado"), NO
  // se relanza. Un error de loader sin errorComponent tumba toda la ruta
  // con un 500 genérico — pero "no encontrado" es un estado válido de la
  // app, no una falla de servidor. El componente ya lo maneja con gracia
  // vía useQuery().isError sobre la misma query key.
  loader: async ({ context, params }) => {
    try {
      const profile = await context.queryClient.ensureQueryData(
        playerProfileQuery(params.playerTag),
      );
      // Precargamos achievements junto con el perfil para que el teaser no
      // aparezca tarde y empuje el layout — mismo patrón que el resto de la
      // página. Best effort: si falla, el useQuery del componente reintenta.
      if (profile && !(profile as any).is_private) {
        context.queryClient
          .ensureQueryData(playerAchievementsQuery(params.playerTag))
          .catch(() => {});
      }
      return profile;
    } catch {
      return undefined;
    }
  },
  head: ({ params }) => ({
    meta: [{ title: `Perfil de ${params.playerTag} — Nexus` }],
    links: [{ rel: "canonical", href: `https://mxntcg.lovable.app/players/${params.playerTag}` }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "ProfilePage",
          mainEntity: {
            "@type": "Person",
            identifier: params.playerTag,
            alternateName: params.playerTag,
            url: `https://mxntcg.lovable.app/players/${params.playerTag}`,
          },
        }),
      },
    ],
  }),
  component: PublicProfilePage,
});

function PublicProfilePage() {
  const { playerTag } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const navigate = useNavigate();
  // A diferencia del dashboard (donde un torneo lleva al detalle de gestión
  // interno), en el perfil público lleva al detalle público del torneo
  // (/tournaments/$id), que a su vez ofrece "Volver" y "Ver tienda".
  const goToTournament = (tournamentId: string) => {
    navigate({ to: "/tournaments/$id", params: { id: tournamentId } });
  };
  const fetchActiveSponsor = useServerFn(getActiveSponsor);
  const registerView = useServerFn(registerAdView);

  const [sponsor, setSponsor] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  const [historyTcg, setHistoryTcg] = useState<string | null>(null);
  const NATIONAL_LEAGUE = "__national__";
  const [historyLeague, setHistoryLeague] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

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

  // initialData del loader: si el usuario llegó por hover/intent (preload)
  // o por SSR, el primer render ya tiene datos — sin ese "Cargando perfil…"
  // ni siquiera en la primera visita. Revalida en background según staleTime.
  const profileQuery = useQuery({
    ...playerProfileQuery(playerTag),
    initialData: loaderData,
  });
  const profile = profileQuery.data ?? null;
  const loading = profileQuery.isPending;
  const notFound = profileQuery.isError;

  const achievementsQuery = useQuery({
    ...playerAchievementsQuery(playerTag),
    enabled: !!profile && !profile.is_private,
  });
  const achievements = achievementsQuery.data ?? null;

  // Nameplates desbloqueados: reusa la misma data ya cargada para el
  // Standing (Fase 2) — cero requests nuevos para armar el switcher del
  // Hero, solo se aplana y filtra por reward_type en cliente.
  const queryClient = useQueryClient();
  const equipNameplateFn = useServerFn(setEquippedNameplate);
  const unlockedNameplates = useMemo(
    () =>
      (achievements?.roads.flatMap((r: any) => r.items) ?? [])
        .filter((item: any) => item.unlocked && isNameplateReward(item))
        .map((item: any) => ({
          key: item.key,
          name: item.name,
          tier: item.tier,
          requirement_text: item.requirement_text,
          base_lp: item.base_lp,
          reward_detail: item.reward_detail,
        })),
    [achievements],
  );
  const handleEquipNameplate = async (achievement_key: string | null) => {
    try {
      await equipNameplateFn({ data: { achievement_key } });
      queryClient.invalidateQueries({ queryKey: ["player-profile", playerTag] });
      queryClient.invalidateQueries({ queryKey: ["player-achievements", playerTag] });
    } catch (err: any) {
      toast.error(err?.message ?? "No se pudo actualizar el nameplate");
    }
  };

  const tournaments: any[] =
    profile && !profile.is_private ? ((profile as any).tournaments ?? []) : [];

  // Win-rate y forma reciente: calculados en cliente a partir de
  // profile.tournaments (ya viene ordenado por fecha desc) — no hace falta
  // tocar el backend, el dato agregado ya está en cada fila.
  const record = useMemo(() => {
    let wins = 0;
    let losses = 0;
    for (const t of tournaments) {
      if (t.wins != null) wins += t.wins;
      if (t.losses != null) losses += t.losses;
    }
    const total = wins + losses;
    return { wins, losses, total, winRate: total > 0 ? Math.round((wins / total) * 100) : null };
  }, [tournaments]);

  // slice + reverse: los más recientes primero en `tournaments` (orden del
  // server), pero una tira de "forma" se lee cronológicamente izq→der.
  const recentForm = useMemo(() => tournaments.slice(0, 5).reverse(), [tournaments]);

  const uniqueGames = useMemo(
    () =>
      Array.from(
        new Map(
          tournaments
            .filter((t: any) => t.game_id)
            .map((t: any) => [t.game_id, { id: t.game_id, name: t.tcg }]),
        ).values(),
      ),
    [tournaments],
  );

  const uniqueLeagues = useMemo(
    () =>
      Array.from(
        new Map(
          tournaments
            .filter((t: any) => t.league_id)
            .map((t: any) => [t.league_id, { id: t.league_id, name: t.league_name }]),
        ).values(),
      ),
    [tournaments],
  );

  const filteredTournaments = tournaments
    .filter((t: any) => !historyTcg || t.game_id === historyTcg)
    .filter((t: any) => {
      if (!historyLeague) return true;
      if (historyLeague === NATIONAL_LEAGUE) return !t.league_id;
      return t.league_id === historyLeague;
    });
  const paginatedTournaments = filteredTournaments.slice(0, page * PAGE_SIZE);
  const hasMoreTournaments = filteredTournaments.length > page * PAGE_SIZE;

  if (loading) {
    return (
      <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-6 px-4 sm:px-6 xl:grid-cols-[160px_minmax(0,1fr)_160px]">
        <aside className="hidden xl:block" />
        <main className="min-w-0 pb-20">
          {/* Hero — avatar, tag, pills de title/badge, fila de headline
              stats y botón de compartir: mismo layout que el estado real
              para que no haya salto de tamaño al resolver la query. */}
          <div className="relative my-8 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-black/60 via-primary/10 to-black/40 p-6 sm:p-10">
            <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
              <SkeletonBlock className="h-20 w-20 flex-shrink-0 rounded-full sm:h-24 sm:w-24" />
              <div className="min-w-0 flex-1 space-y-3">
                <SkeletonLine width="w-24" height="h-3" />
                <SkeletonLine width="w-48" height="h-8" />
                <div className="flex gap-2">
                  <SkeletonBlock className="h-7 w-28 rounded-full" />
                  <SkeletonBlock className="h-7 w-24 rounded-full" />
                </div>
                <div className="flex gap-5 pt-1">
                  <SkeletonLine width="w-16" height="h-8" />
                  <SkeletonLine width="w-16" height="h-8" />
                  <SkeletonLine width="w-20" height="h-8" />
                </div>
                <SkeletonBlock className="h-8 w-36 rounded-md" />
              </div>
            </div>
          </div>

          {/* Standing — 3 cards (rankings + achievements) */}
          <div className="flex flex-wrap gap-4">
            <SkeletonBlock className="h-32 w-full rounded-2xl sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.667rem)]" />
            <SkeletonBlock className="h-32 w-full rounded-2xl sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.667rem)]" />
            <SkeletonBlock className="h-32 w-full rounded-2xl sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.667rem)]" />
          </div>

          {/* Historial de torneos */}
          <SkeletonBlock className="mt-6 h-14 w-full rounded-t-2xl" />
          <div className="space-y-px">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonBlock key={i} className="h-12 w-full last:rounded-b-2xl" />
            ))}
          </div>
        </main>
        <aside className="hidden xl:block" />
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <h2 className="text-2xl font-bold text-white">Jugador no encontrado</h2>
        <p className="mt-2 text-sm text-gray-400">No existe un jugador con ese Player Tag.</p>
        <Link
          to="/"
          className="mt-6 inline-block rounded-md border border-white/20 bg-white/5 px-6 py-3 text-sm font-semibold text-white"
        >
          Volver al inicio
        </Link>
      </main>
    );
  }

  if (profile.is_private) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
        <Lock className="mb-4 text-gray-500" size={40} />
        <h2 className="text-2xl font-bold text-white">Perfil privado</h2>
        <p className="mt-2 text-sm text-gray-400">
          El perfil de <span className="font-semibold text-primary">@{profile.geek_tag}</span> es
          privado.
        </p>
        <Link
          to="/"
          className="mt-6 rounded-md border border-white/20 bg-white/5 px-6 py-3 text-sm font-semibold text-white"
        >
          Volver al inicio
        </Link>
      </main>
    );
  }

  return (
    <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-6 px-4 sm:px-6 xl:grid-cols-[160px_minmax(0,1fr)_160px]">
      <aside className="hidden xl:block">
        <AdVertical sponsor={sponsor} />
      </aside>

      <main className="min-w-0 pb-20">
        {/* Hero */}
        <section className="relative my-8 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-black/60 via-primary/10 to-black/40 p-6 sm:p-10">
          <div className="absolute -right-10 top-1/2 h-72 w-72 -translate-y-1/2 rounded-full bg-primary/20 blur-3xl" />
          <div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-center">
            {profile.avatar_url && !avatarError ? (
              <img
                src={profile.avatar_url}
                alt={profile.geek_tag}
                onError={() => setAvatarError(true)}
                className="h-20 w-20 flex-shrink-0 rounded-full border-2 border-primary/40 object-cover sm:h-24 sm:w-24"
              />
            ) : (
              <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-full border-2 border-primary/40 bg-black/40 text-3xl font-bold text-primary sm:h-24 sm:w-24">
                {profile.geek_tag.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">
                Player Tag
              </p>
              <h1 className="mt-1 break-words text-3xl font-bold text-white sm:text-5xl">
                {profile.geek_tag}
              </h1>
              <NameplateBanner
                equipped={profile.equipped_nameplate}
                isOwner={!!profile.is_owner}
                unlockedNameplates={unlockedNameplates}
                onEquip={handleEquipNameplate}
              />
              {(profile.equipped_title || profile.equipped_badge) && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  {profile.equipped_title && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-fuchsia-500/40 bg-fuchsia-500/15 px-3.5 py-1.5 text-sm font-bold uppercase tracking-wider text-fuchsia-300 shadow-[0_0_20px_-6px_rgba(217,70,239,0.6)]">
                      <Sparkles size={13} /> {profile.equipped_title}
                    </span>
                  )}
                  {profile.equipped_badge && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/15 px-3.5 py-1.5 text-sm font-semibold text-primary">
                      <Trophy size={13} /> {profile.equipped_badge}
                    </span>
                  )}
                </div>
              )}
              {profile.store_city && (
                <p className="mt-1 text-sm text-gray-400">{profile.store_city}</p>
              )}
              {profile.member_since && (
                <p className="mt-2 text-xs text-gray-500">
                  Miembro desde{" "}
                  {new Date(profile.member_since).toLocaleDateString("es-MX", {
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              )}

              {/* Headline stats: win-rate agregado, mazo/leader principal y
                  forma reciente — hoy la única forma de saber "qué tan
                  bueno es este jugador ahora mismo" era leer manualmente
                  las 10 filas del historial. */}
              {(record.total > 0 || profile.main_leader || recentForm.length > 0) && (
                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                  {record.winRate != null && (
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-gray-500">
                        Win rate
                      </p>
                      <p className="font-mono-stat text-lg font-bold text-white">
                        {record.winRate}%{" "}
                        <span className="text-xs font-normal text-gray-500">
                          ({record.wins}V-{record.losses}D)
                        </span>
                      </p>
                    </div>
                  )}
                  {profile.main_leader && (
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-gray-500">
                        Leader principal
                      </p>
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-white">
                        {profile.main_leader.image && (
                          <img
                            src={profile.main_leader.image}
                            alt=""
                            className="h-6 w-6 rounded object-cover"
                          />
                        )}
                        {profile.main_leader.name}
                      </p>
                    </div>
                  )}
                  {recentForm.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-gray-500">
                        Últimos resultados
                      </p>
                      <div className="mt-0.5 flex items-center gap-1">
                        {recentForm.map((t: any, i: number) => (
                          <span
                            key={t.id ?? i}
                            title={`#${t.placement} — ${t.date}`}
                            className={`flex h-5 w-5 items-center justify-center rounded-full font-mono-stat text-[9px] font-bold ${
                              t.placement <= 3
                                ? "bg-primary/20 text-primary"
                                : "bg-white/10 text-gray-400"
                            }`}
                          >
                            {t.placement}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={async () => {
                  const url = `https://mxntcg.lovable.app/players/${profile.geek_tag}`;
                  const topRanking = profile.rankings?.[0] as any;
                  await shareProfileWithCard({
                    url,
                    title: `${profile.geek_tag} — Nexus`,
                    text: `Mira el ranking de ${profile.geek_tag} en Nexus 🏆`,
                    cardData: {
                      geekTag: profile.geek_tag,
                      subtitle: profile.store_city ?? null,
                      rankLabel:
                        topRanking?.rank_position > 0 ? `#${topRanking.rank_position}` : null,
                      rankCaption: topRanking?.game_name ?? null,
                      statsLine: topRanking
                        ? `${Number(topRanking.total_points).toFixed(0)} pts · ${topRanking.tournaments_won} ganados`
                        : null,
                      footerLine:
                        tournaments.length > 0 ? `${tournaments.length} torneos jugados` : null,
                    },
                    onCopied: () => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    },
                  });
                }}
                className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/10"
              >
                {copied ? (
                  <>
                    <Check size={12} /> ¡Link copiado!
                  </>
                ) : (
                  <>
                    <Share2 size={12} /> Compartir perfil
                  </>
                )}
              </button>
            </div>
          </div>
        </section>

        {/* Standing & Progression — Rankings y Achievements son la misma
            pregunta ("qué tan bueno/comprometido es este jugador") y antes
            vivían en dos cards sueltas sin relación visual entre sí. Un solo
            módulo, un solo header. */}
        {(profile.rankings.length > 0 || achievements || achievementsQuery.isPending) && (
          <section className="mt-6">
            <h2 className="mb-3 text-lg font-semibold text-white">Standing</h2>
            <div className="flex flex-wrap gap-4">
              {profile.rankings.map((r: any) => (
                <div
                  key={r.game_id}
                  className="glass flex w-full flex-col gap-3 rounded-2xl border border-white/10 p-5 sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.667rem)]"
                >
                  <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-white">
                    <Crown size={14} className="text-primary" /> {r.game_name}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-gray-500">
                        <Crown size={10} /> Rank
                      </p>
                      <p className="mt-1 font-mono-stat text-3xl font-bold text-white">
                        {r.rank_position > 0 ? `#${r.rank_position}` : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-gray-500">
                        <Target size={10} className="text-primary" /> Puntos
                      </p>
                      <p className="mt-1 font-mono-stat text-3xl font-bold text-white">
                        {Number(r.total_points).toFixed(0)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span>{r.tournaments_played} jugados</span>
                    <span>·</span>
                    <span>{r.tournaments_won} ganados</span>
                  </div>
                </div>
              ))}

              {/* Achievements teaser — visible siempre (incluso en 0), no
                  solo cuando ya desbloqueó algo: a un jugador nuevo hay que
                  mostrarle que el sistema existe, no ocultarlo hasta que ya
                  lo use. Mismo ancho de card que los rankings para que lea
                  como parte del mismo grupo, no como un módulo aparte.
                  Mientras la query resuelve (es un query aparte de la del
                  perfil) va un skeleton del mismo tamaño — sin esto la card
                  aparecía de golpe y corría el layout de las cards de al
                  lado, dando la sensación de que "todo aparece de repente". */}
              {achievementsQuery.isPending ? (
                <SkeletonBlock className="h-[126px] w-full rounded-2xl sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.667rem)]" />
              ) : (
                achievements && (
                  <Link
                    to="/players/$playerTag/achievements"
                    params={{ playerTag }}
                    className="glass flex w-full flex-col justify-between gap-3 rounded-2xl border border-white/10 p-5 transition hover:border-primary/30 sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.667rem)]"
                  >
                    <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-white">
                      <Trophy size={14} className="text-primary" /> Achievements
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-xs font-bold text-primary">
                        {achievements.total_count > 0
                          ? Math.round(
                              (achievements.unlocked_count / achievements.total_count) * 100,
                            )
                          : 0}
                        %
                      </div>
                      <div>
                        <p className="font-mono-stat text-2xl font-bold text-white">
                          {achievements.unlocked_count}
                          <span className="text-base text-gray-500 font-sans">
                            {" "}
                            / {achievements.total_count}
                          </span>
                        </p>
                        <p className="text-xs text-gray-500">
                          {achievements.unlocked_count > 0
                            ? `${achievements.total_lp} Legacy Points`
                            : "Empieza a competir para desbloquear achievements"}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-primary">Ver todos →</span>
                  </Link>
                )
              )}
            </div>
          </section>
        )}

        {/* Ad horizontal mobile */}
        <AdHorizontal sponsor={sponsor} />

        {/* Historial de torneos */}
        <section className="glass mt-6 overflow-hidden rounded-2xl border border-white/10">
          <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="text-primary" size={18} />
              <h2 className="text-lg font-semibold text-white">Historial de torneos</h2>
            </div>
            <span className="text-xs uppercase tracking-wider text-gray-500">
              {filteredTournaments.length} torneos
            </span>
          </header>

          {uniqueGames.length > 1 && (
            <div className="flex overflow-x-auto border-b border-white/10 px-2">
              <button
                onClick={() => {
                  setHistoryTcg(null);
                  setPage(1);
                }}
                className={`px-4 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 -mb-px transition flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                  historyTcg === null
                    ? "border-primary text-white"
                    : "border-transparent text-gray-400 hover:text-gray-200"
                }`}
              >
                Todos ({tournaments.length})
              </button>
              {uniqueGames.map((g: any) => {
                const count = tournaments.filter((t: any) => t.game_id === g.id).length;
                if (count === 0) return null;
                return (
                  <button
                    key={g.id}
                    onClick={() => {
                      setHistoryTcg(g.id);
                      setPage(1);
                    }}
                    className={`px-4 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 -mb-px transition flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                      historyTcg === g.id
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

          {uniqueLeagues.length > 0 && (
            <div className="flex overflow-x-auto border-b border-white/10 px-2">
              <button
                onClick={() => {
                  setHistoryLeague(null);
                  setPage(1);
                }}
                className={`px-4 py-2 text-[11px] font-medium whitespace-nowrap border-b-2 -mb-px transition flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                  historyLeague === null
                    ? "border-fuchsia-400 text-white"
                    : "border-transparent text-gray-500 hover:text-gray-300"
                }`}
              >
                Todas las ligas
              </button>
              <button
                onClick={() => {
                  setHistoryLeague(NATIONAL_LEAGUE);
                  setPage(1);
                }}
                className={`px-4 py-2 text-[11px] font-medium whitespace-nowrap border-b-2 -mb-px transition flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                  historyLeague === NATIONAL_LEAGUE
                    ? "border-fuchsia-400 text-white"
                    : "border-transparent text-gray-500 hover:text-gray-300"
                }`}
              >
                Circuito Nacional
              </button>
              {uniqueLeagues.map((l: any) => (
                <button
                  key={l.id}
                  onClick={() => {
                    setHistoryLeague(l.id);
                    setPage(1);
                  }}
                  className={`px-4 py-2 text-[11px] font-medium whitespace-nowrap border-b-2 -mb-px transition flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                    historyLeague === l.id
                      ? "border-fuchsia-400 text-white"
                      : "border-transparent text-gray-500 hover:text-gray-300"
                  }`}
                >
                  {l.name}
                </button>
              ))}
            </div>
          )}

          {/* Desktop */}
          <div className="overflow-x-auto hidden sm:block">
            <table className="w-full text-sm">
              <thead className="bg-black/30 text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left">Fecha</th>
                  {/* Columna TCG solo si el jugador compite en más de un
                      juego — con un solo TCG, repetir el mismo texto en
                      todas las filas no aporta nada (el badge de liga se
                      muda a la celda de Tienda para no perderlo). */}
                  {uniqueGames.length > 1 && <th className="px-4 py-2 text-left">TCG</th>}
                  <th className="px-4 py-2 text-left">Tienda</th>
                  <th className="px-4 py-2 text-center whitespace-nowrap">V / D</th>
                  <th className="px-4 py-2 text-right">Posición</th>
                  <th
                    className="px-4 py-2 text-right"
                    title="Puntos de ranking otorgados por ese torneo — distintos de los Legacy Points de achievements."
                  >
                    Pts Arena
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedTournaments.length === 0 ? (
                  <tr>
                    <td colSpan={uniqueGames.length > 1 ? 6 : 5} className="px-4 py-16 text-center">
                      <div className="mx-auto max-w-xs">
                        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-primary/20 bg-primary/10">
                          <Trophy size={24} className="text-primary" />
                        </div>
                        <p className="text-sm font-semibold text-white">
                          Aún sin torneos registrados
                        </p>
                        <p className="mt-2 text-xs text-gray-500">
                          Participa en un torneo en tu tienda local para aparecer en el circuito.
                        </p>
                        <Link
                          to="/stores"
                          className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-bold uppercase tracking-widest text-primary-foreground hover:bg-primary/90 transition"
                        >
                          Encontrar una tienda →
                        </Link>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedTournaments.map((t: any) => (
                    <tr
                      key={t.id}
                      onClick={() => goToTournament(t.id)}
                      className="border-b border-white/5 cursor-pointer hover:bg-white/[0.03]"
                    >
                      <td className="px-4 py-3 text-gray-400 font-mono-stat text-xs">
                        {t.date !== "—"
                          ? new Date(t.date + "T12:00:00").toLocaleDateString("es-MX", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                          : "—"}
                      </td>
                      {uniqueGames.length > 1 && (
                        <td className="px-4 py-3 text-xs text-gray-400">
                          {t.tcg}
                          {t.league_name && t.store_slug && (
                            <Link
                              to="/stores/$slug"
                              params={{ slug: t.store_slug }}
                              hash="liga-interna"
                              title="Ver leaderboard de esta liga"
                              onClick={(e) => e.stopPropagation()}
                              className="ml-1.5 inline-block rounded-full bg-fuchsia-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-fuchsia-300 hover:bg-fuchsia-500/25"
                            >
                              {t.league_name}
                            </Link>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3 text-white">
                        {t.store} <span className="text-xs text-gray-500">· {t.city}</span>
                        {uniqueGames.length <= 1 && t.league_name && t.store_slug && (
                          <Link
                            to="/stores/$slug"
                            params={{ slug: t.store_slug }}
                            hash="liga-interna"
                            title="Ver leaderboard de esta liga"
                            onClick={(e) => e.stopPropagation()}
                            className="ml-1.5 inline-block rounded-full bg-fuchsia-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-fuchsia-300 hover:bg-fuchsia-500/25"
                          >
                            {t.league_name}
                          </Link>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center font-mono-stat text-xs text-gray-300 whitespace-nowrap">
                        {t.wins != null && t.losses != null ? `${t.wins} / ${t.losses}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`font-mono-stat text-sm font-semibold ${
                            t.placement <= 3 ? "text-primary" : "text-white"
                          }`}
                        >
                          #{t.placement}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono-stat font-semibold text-white">
                        +{t.pointsEarned}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="sm:hidden">
            {paginatedTournaments.length === 0 ? (
              <div className="px-4 py-16 text-center">
                <div className="mx-auto max-w-xs">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-primary/20 bg-primary/10">
                    <Trophy size={24} className="text-primary" />
                  </div>
                  <p className="text-sm font-semibold text-white">Aún sin torneos registrados</p>
                  <p className="mt-2 text-xs text-gray-500">
                    Participa en un torneo en tu tienda local para aparecer en el circuito.
                  </p>
                  <Link
                    to="/stores"
                    className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-bold uppercase tracking-widest text-primary-foreground hover:bg-primary/90 transition"
                  >
                    Encontrar una tienda →
                  </Link>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {paginatedTournaments.map((t: any) => (
                  <div
                    key={t.id}
                    onClick={() => goToTournament(t.id)}
                    className="px-4 py-3 cursor-pointer active:bg-white/[0.03]"
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-mono-stat text-sm font-semibold ${
                              t.placement <= 3 ? "text-primary" : "text-white"
                            }`}
                          >
                            #{t.placement}
                          </span>
                          {uniqueGames.length > 1 && (
                            <span className="text-xs text-gray-400">{t.tcg}</span>
                          )}
                          {t.league_name && t.store_slug && (
                            <Link
                              to="/stores/$slug"
                              params={{ slug: t.store_slug }}
                              hash="liga-interna"
                              onClick={(e) => e.stopPropagation()}
                              className="rounded-full bg-fuchsia-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-fuchsia-300"
                            >
                              {t.league_name}
                            </Link>
                          )}
                          <span className="text-xs text-gray-600">—</span>
                          <span className="text-sm font-semibold text-white truncate">
                            {t.store}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-gray-500 flex-wrap">
                          <span>{t.city}</span>
                          <span>·</span>
                          <span>
                            {t.date !== "—"
                              ? new Date(t.date + "T12:00:00").toLocaleDateString("es-MX", {
                                  day: "numeric",
                                  month: "short",
                                })
                              : "—"}
                          </span>
                          {t.wins != null && t.losses != null && (
                            <>
                              <span>·</span>
                              <span className="whitespace-nowrap">
                                {t.wins}V/{t.losses}D
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        <p className="text-xs font-mono-stat font-semibold text-white">
                          +{t.pointsEarned}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {hasMoreTournaments && (
            <div className="px-4 py-4 text-center border-t border-white/5">
              <button
                onClick={() => setPage((p) => p + 1)}
                className="text-xs text-primary hover:underline"
              >
                Ver {Math.min(PAGE_SIZE, filteredTournaments.length - page * PAGE_SIZE)} más
              </button>
            </div>
          )}
          {/* getPublicProfile trae como máximo 100 torneos — si el jugador
              tiene más, avisamos en vez de cortar en silencio. */}
          {!hasMoreTournaments && tournaments.length === 100 && (
            <p className="px-4 py-3 text-center text-[11px] text-gray-500 border-t border-white/5">
              Mostrando los 100 torneos más recientes.
            </p>
          )}
        </section>

        {/* CTA
        {!profile.is_owner && (
          <section className="glass mt-6 rounded-2xl border border-primary/20 p-6 text-center">
            <h3 className="text-lg font-bold text-white">¿Quieres ver tu propio ranking?</h3>
            <p className="mt-2 text-sm text-gray-400">
              Regístrate y accede a tu historial completo, rankings por TCG y estadísticas
              detalladas.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Link
                to="/signup"
                className="rounded-md bg-primary px-6 py-3 text-sm font-bold uppercase tracking-widest text-primary-foreground"
              >
                Crear cuenta gratis
              </Link>
              <Link
                to="/login"
                className="rounded-md border border-white/20 bg-white/5 px-6 py-3 text-sm font-bold uppercase tracking-widest text-white"
              >
                Iniciar sesión
              </Link>
            </div>
          </section>
        )} */}
      </main>

      <aside className="hidden xl:block">
        <AdVertical sponsor={sponsor} />
      </aside>
    </div>
  );
}
