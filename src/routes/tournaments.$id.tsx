import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getPublicTournament } from "@/lib/nexus-public.functions";
import {
  getTournamentRsvpCount,
  getPlayerRsvpStatus,
  createRsvp,
  cancelRsvp,
} from "@/lib/nexus-rsvp.functions";
import { useNexusRole } from "@/hooks/use-nexus-role";
import { buildIcs, icsDataUri, icsFileName } from "@/lib/ics";
import {
  Trophy,
  MapPin,
  Clock,
  CalendarPlus,
  Share2,
  Check,
  ShieldQuestion,
  Heart,
  Users,
  ArrowLeft,
  Store,
} from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/tournaments/$id")({
  loader: async ({ params }) => {
    return await getPublicTournament({ data: { tournament_id: params.id } });
  },
  head: ({ loaderData, params }) => {
    const t = loaderData?.tournament;
    const title = t
      ? `${t.game_name} — ${t.store_name} · ${t.date}`
      : "Torneo — Trading Card Nexus";
    const desc = t
      ? `Resultados del torneo de ${t.game_name} en ${t.store_name}, ${t.store_city}. ${loaderData?.total_participants ?? 0} participantes.`
      : "Resultados de torneo en Trading Card Nexus";
    const url = `https://mxntcg.lovable.app/tournaments/${params.id}`;
    const image = `https://mxntcg.lovable.app/og/tournament-${params.id}.png`;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { property: "og:image", content: image },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: desc },
        { name: "twitter:image", content: image },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  errorComponent: TournamentNotFound,
  component: PublicTournamentPage,
});

function TournamentNotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <ShieldQuestion className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
      <h1 className="mb-2 text-xl font-bold text-white">Torneo no disponible</h1>
      <p className="mb-6 text-sm text-secondary-foreground">
        Este torneo no existe o aún no ha sido publicado.
      </p>
      <Link
        to="/meta"
        className="inline-flex items-center rounded-xl border border-border bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10"
      >
        Ver el ranking nacional
      </Link>
    </div>
  );
}

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function formatLongDate(d: string) {
  const dt = new Date(d + "T00:00:00");
  return `${dt.getDate()} de ${MESES[dt.getMonth()]} de ${dt.getFullYear()}`;
}

function PublicTournamentPage() {
  const data = Route.useLoaderData();
  const [copied, setCopied] = useState(false);
  const { player } = useNexusRole();
  const qc = useQueryClient();
  const router = useRouter();

  const t = data.tournament;
  const winner = data.standings[0];
  const today = new Date().toISOString().split("T")[0];
  const isFuture = t.date >= today;

  const rsvpCountQuery = useQuery({
    queryKey: ["rsvp-count", t.id],
    queryFn: () => getTournamentRsvpCount({ data: { tournament_id: t.id } }),
  });
  const rsvpStatusQuery = useQuery({
    queryKey: ["rsvp-status", t.id, player?.id],
    queryFn: () => getPlayerRsvpStatus({ data: { tournament_id: t.id } }),
    enabled: !!player && isFuture,
  });
  const isRsvped = !!rsvpStatusQuery.data?.attending;

  const createFn = useServerFn(createRsvp);
  const cancelFn = useServerFn(cancelRsvp);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["rsvp-count", t.id] });
    qc.invalidateQueries({ queryKey: ["rsvp-status", t.id, player?.id] });
  };
  const createMut = useMutation({
    mutationFn: () => createFn({ data: { tournament_id: t.id } }),
    onSuccess: () => {
      toast.success("¡Te anotaste!");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo confirmar asistencia"),
  });
  const cancelMut = useMutation({
    mutationFn: () => cancelFn({ data: { tournament_id: t.id } }),
    onSuccess: () => {
      toast.success("Asistencia cancelada");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo cancelar"),
  });
  const rsvpBusy = createMut.isPending || cancelMut.isPending;

  const handleShare = async () => {
    const shareData = {
      title: `${t.game_name} — ${t.store_name}`,
      text: "Mira los resultados de este torneo 🏆",
      url: typeof window !== "undefined" ? window.location.href : "",
    };
    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.share &&
        (!navigator.canShare || navigator.canShare(shareData))
      ) {
        await navigator.share(shareData);
        return;
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(shareData.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // noop
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          onClick={() => router.history.back()}
          className="inline-flex items-center gap-1.5 text-sm text-secondary-foreground hover:text-white transition"
        >
          <ArrowLeft className="h-4 w-4" /> Volver
        </button>
        {t.store_slug && (
          <Link
            to="/stores/$slug"
            params={{ slug: t.store_slug }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white/5 px-3 py-1.5 text-xs font-semibold text-secondary-foreground hover:bg-white/10 hover:text-white transition"
          >
            <Store className="h-3.5 w-3.5" /> Ver tienda
          </Link>
        )}
      </div>

      {/* Header card */}
      <div className="glass rounded-2xl border border-border p-6">
        <span className="inline-block rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
          {t.game_name}
        </span>
        <h1 className="mt-2 text-2xl font-bold text-white">{t.store_name}</h1>
        <div className="mt-3 flex flex-wrap gap-3 text-sm text-secondary-foreground">
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" /> {t.store_city}, {t.store_state}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> {formatLongDate(t.date)}
          </span>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px]">{t.zone}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>{data.total_participants} participantes</span>
          {isFuture ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-secondary-foreground">
              <Users className="h-3 w-3" /> {rsvpCountQuery.data?.count ?? 0} confirmados
            </span>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {isFuture && player ? (
            <button
              onClick={() => (isRsvped ? cancelMut.mutate() : createMut.mutate())}
              disabled={rsvpBusy || rsvpStatusQuery.isLoading}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition disabled:opacity-60 ${
                isRsvped
                  ? "border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20"
                  : "bg-[#F97316] text-white hover:bg-[#F97316]/90"
              }`}
            >
              <Heart className={`h-4 w-4 ${isRsvped ? "fill-current" : ""}`} />
              {isRsvped ? "Cancelar asistencia" : "Voy a ir"}
            </button>
          ) : null}
          {isFuture ? (
            <a
              href={icsDataUri(
                buildIcs({
                  title: `${t.game_name} — ${t.store_name}`,
                  description: "Torneo publicado en Trading Card Nexus.",
                  location: `${t.store_name}, ${t.store_city}, ${t.store_state}`,
                  date: t.date,
                  time: t.time,
                  durationHours: 4,
                  uid: t.id,
                }),
              )}
              download={icsFileName(`${t.game_name}-${t.store_name}-${t.date}`)}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 py-2.5 text-sm font-semibold text-primary transition hover:bg-primary/20"
            >
              <CalendarPlus className="h-4 w-4" /> Agregar a mi calendario
            </a>
          ) : null}
          <button
            onClick={handleShare}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-white/5 py-2.5 text-sm font-semibold text-secondary-foreground transition hover:bg-white/10"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4" /> ¡Link copiado!
              </>
            ) : (
              <>
                <Share2 className="h-4 w-4" /> Compartir
              </>
            )}
          </button>
        </div>
      </div>

      <Link
        to="/stores/$slug"
        params={{ slug: t.store_slug }}
        className="mt-3 inline-block text-xs text-primary hover:underline"
      >
        Ver perfil de {t.store_name} →
      </Link>

      {/* Winner highlight */}
      {winner ? (
        <div className="mt-6 flex items-center gap-4 rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 to-transparent p-4">
          {winner.leader_image ? (
            <img
              src={winner.leader_image}
              alt={winner.leader_name ?? ""}
              className="h-16 w-11 flex-shrink-0 rounded border border-white/10 object-cover"
            />
          ) : (
            <div className="flex h-16 w-11 flex-shrink-0 items-center justify-center rounded border border-white/10 bg-white/5">
              <Trophy className="h-5 w-5 text-primary" />
            </div>
          )}
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-primary">
              🏆 Campeón
            </div>
            <div className="truncate text-lg font-bold text-white">{winner.geek_tag}</div>
            {winner.leader_name ? (
              <div className="truncate text-xs text-secondary-foreground">{winner.leader_name}</div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Standings */}
      {data.standings.length > 0 ? (
        <div className="mt-6 overflow-hidden rounded-2xl border border-border glass">
          <div className="grid grid-cols-[40px_1fr_70px_60px_60px] gap-2 border-b border-white/10 px-4 py-2 text-[10px] uppercase tracking-widest text-muted-foreground">
            <div>#</div>
            <div>Jugador</div>
            <div>V/D/E</div>
            <div>OMW%</div>
            <div>PTS</div>
          </div>
          {data.standings.map((s: (typeof data.standings)[number]) => {
            const isTop3 = s.rank <= 3;
            const vde = s.wins == null ? "—" : `${s.wins}/${s.losses ?? 0}/${s.draws ?? 0}`;
            const omw =
              typeof s.omw_percentage === "number" ? `${s.omw_percentage.toFixed(1)}%` : "—";
            const pts = typeof s.points_earned === "number" ? s.points_earned.toFixed(2) : "—";
            return (
              <div
                key={`${s.rank}-${s.geek_tag}`}
                className="grid grid-cols-[40px_1fr_70px_60px_60px] items-center gap-2 border-b border-white/[0.05] px-4 py-3"
              >
                <div
                  className={`font-mono text-sm ${isTop3 ? "font-bold text-primary" : "text-muted-foreground"}`}
                >
                  {s.rank}
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  {s.leader_image ? (
                    <img
                      src={s.leader_image}
                      alt=""
                      className="h-9 w-6 flex-shrink-0 rounded border border-white/10 object-cover"
                    />
                  ) : null}
                  <div className="min-w-0">
                    {s.is_profile_public ? (
                      <Link
                        to="/players/$playerTag"
                        params={{ playerTag: s.geek_tag }}
                        className="block truncate text-sm font-medium text-white hover:text-primary"
                      >
                        {s.geek_tag}
                      </Link>
                    ) : (
                      <div className="truncate text-sm font-medium text-white">{s.geek_tag}</div>
                    )}
                    {s.leader_name ? (
                      <div className="truncate text-[10px] text-muted-foreground">
                        {s.leader_name}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="whitespace-nowrap font-mono text-xs text-secondary-foreground">
                  {vde}
                </div>
                <div className="font-mono text-xs text-muted-foreground">{omw}</div>
                <div className="font-mono text-sm font-semibold text-white">{pts}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-border bg-white/5 p-6 text-center text-sm text-secondary-foreground">
          Este torneo no tiene resultados registrados.
        </div>
      )}

      {/* Footer CTA */}
      <div className="mt-8 text-center">
        <h3 className="text-sm font-semibold text-white">¿Compites en este circuito?</h3>
        <p className="mt-1 text-xs text-secondary-foreground">
          Registra tus partidas, sigue tu ranking nacional y consulta el meta.
        </p>
        <Link
          to="/signup"
          className="mt-3 inline-flex items-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-[#0B1220] hover:bg-primary/90"
        >
          Crear mi cuenta
        </Link>
      </div>
    </div>
  );
}
