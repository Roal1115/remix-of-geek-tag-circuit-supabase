import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { TrendingUp, Shield, Calendar, Swords } from "lucide-react";
import { useTCG } from "@/context/tcg.context";
import { getMetaMatchups } from "@/lib/nexus-meta.functions";
import { metaFilterOptionsQuery, metaQuery, type MetaFilters } from "@/lib/meta-queries";
import { SkeletonBlock } from "@/components/ui/skeleton-loader";
import { BlockSelect } from "@/components/ui/block-select";
import { shortLeaderName, setBadge } from "@/lib/leader-display";

const DEFAULT_GAME_ID = "5b608762-d0a3-4a93-9739-e5cd150b01cd";
const DEFAULT_FILTERS: MetaFilters = {
  game_id: DEFAULT_GAME_ID,
  zone: null,
  store_id: null,
  date_from: null,
  date_to: null,
};

export const Route = createFileRoute("/meta")({
  // Best effort (no relanza): calienta la caché para cuando el usuario
  // llega por hover/intent desde la nav. Usa los filtros por default —
  // si el TCG activo global difiere, el efecto de sync del componente
  // dispara su propio fetch, igual que el comportamiento anterior.
  //
  // Devuelve los datos (no solo los precarga): en SSR, este loader corre
  // contra el QueryClient del servidor, así que el server renderiza con
  // datos reales. El cliente hidrata con un QueryClient nuevo y vacío — sin
  // pasarle esto como initialData, la primera pintada del cliente mostraría
  // el skeleton mientras el server mostró la tabla → hydration mismatch
  // (se detectó así, con Playwright, antes de dar el fix por terminado).
  loader: async ({ context }) => {
    try {
      const [options, meta] = await Promise.all([
        context.queryClient.ensureQueryData(metaFilterOptionsQuery(DEFAULT_GAME_ID)),
        context.queryClient.ensureQueryData(metaQuery(DEFAULT_FILTERS)),
      ]);
      return { options, meta };
    } catch {
      return undefined;
    }
  },
  head: () => ({ meta: [{ title: "Meta — Nexus" }] }),
  component: MetaPage,
});

type MatchupData = Awaited<ReturnType<typeof getMetaMatchups>>;

const COLOR_MAP: Record<string, string> = {
  Red: "bg-red-500",
  Blue: "bg-blue-500",
  Green: "bg-green-500",
  Yellow: "bg-yellow-400",
  Purple: "bg-purple-500",
  Black: "bg-gray-900 border border-white/20",
};

function ColorDots({ colors }: { colors: string[] }) {
  return (
    <div className="flex items-center gap-1">
      {colors.map((c) => (
        <span
          key={c}
          title={c}
          className={`h-2.5 w-2.5 rounded-full ${COLOR_MAP[c] ?? "bg-gray-600"}`}
        />
      ))}
    </div>
  );
}

function wrColor(wr: number | null): string {
  if (wr === null) return "text-gray-500";
  if (wr >= 55) return "text-emerald-400";
  if (wr >= 45) return "text-white";
  return "text-red-400";
}

function sameFilters(a: MetaFilters, b: MetaFilters): boolean {
  return (
    a.game_id === b.game_id &&
    a.zone === b.zone &&
    a.store_id === b.store_id &&
    a.date_from === b.date_from &&
    a.date_to === b.date_to
  );
}

function MetaPage() {
  const { activeTcg } = useTCG();
  const loaderData = Route.useLoaderData();

  // `filters` = draft (lo que el usuario está editando); `appliedFilters` =
  // lo que realmente dispara la query — reproduce el patrón "Aplicar/Limpiar
  // filtros" que ya existía (zona/tienda/fechas no auto-aplican). game_id es
  // la excepción: lo controla el TcgSwitcher global, no un select de esta
  // página, así que sí aplica de inmediato (igual que antes).
  const [filters, setFilters] = useState<MetaFilters>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<MetaFilters>(DEFAULT_FILTERS);

  const optionsQuery = useQuery({
    ...metaFilterOptionsQuery(filters.game_id),
    initialData: filters.game_id === DEFAULT_GAME_ID ? loaderData?.options : undefined,
  });
  const metaQ = useQuery({
    ...metaQuery(appliedFilters),
    initialData: sameFilters(appliedFilters, DEFAULT_FILTERS) ? loaderData?.meta : undefined,
  });
  const filterOptions = optionsQuery.data;
  // isPending (no isFetching): con keepPreviousData, cambiar un filtro no
  // vuelve a mostrar el skeleton — la tabla anterior queda visible mientras
  // llegan los datos nuevos, igual que el leaderboard desde P0-04.
  const loading = metaQ.isPending;

  const handleGameChange = (gameId: string) => {
    setFilters((f) => ({ ...f, game_id: gameId }));
    setAppliedFilters((f) => ({ ...f, game_id: gameId }));
  };

  useEffect(() => {
    if (!activeTcg?.id || activeTcg.id === filters.game_id) return;
    handleGameChange(activeTcg.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTcg?.id]);

  const applyFilters = () => setAppliedFilters(filters);
  const clearFilters = () => {
    const reset: MetaFilters = { ...DEFAULT_FILTERS, game_id: filters.game_id };
    setFilters(reset);
    setAppliedFilters(reset);
  };

  const metaData = metaQ.data?.stats;
  const matchupData = metaQ.data?.matchups;
  const leaders = metaData?.leaders ?? [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 pb-20">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary inline-flex items-center gap-2">
          <TrendingUp size={12} /> Meta
        </p>
        <h1 className="mt-1 text-3xl font-bold text-white">Meta Leaderboard</h1>
        <p className="mt-1 text-sm text-gray-400">
          Win rates y play rates calculados desde torneos oficiales publicados.
        </p>
      </header>

      {/* Filters */}
      <div className="glass mb-6 rounded-2xl p-4 space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="min-w-0 w-full max-w-full">
            <label className="mb-1 block text-[10px] uppercase tracking-widest text-gray-500">
              Zona
            </label>
            <BlockSelect
              value={filters.zone}
              onChange={(v) => setFilters((f) => ({ ...f, zone: v }))}
              options={(filterOptions?.zones ?? []).map((z: string) => ({ value: z, label: z }))}
              placeholder="Todas las zonas"
            />
          </div>
          <div className="min-w-0 w-full max-w-full">
            <label className="mb-1 block text-[10px] uppercase tracking-widest text-gray-500">
              Tienda
            </label>
            <BlockSelect
              value={filters.store_id}
              onChange={(v) => setFilters((f) => ({ ...f, store_id: v }))}
              options={(filterOptions?.stores ?? [])
                .filter((s: any) => !filters.zone || s.zone === filters.zone)
                .map((s: any) => ({ value: s.id, label: s.name }))}
              placeholder="Todas las tiendas"
            />
          </div>
          <div className="min-w-0 w-full max-w-full">
            <label className="mb-1 block text-[10px] uppercase tracking-widest text-gray-500">
              Desde
            </label>
            <div className="relative min-w-0 w-full max-w-full">
              <Calendar
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
              />
              <input
                type="date"
                value={filters.date_from ?? ""}
                onChange={(e) => setFilters((f) => ({ ...f, date_from: e.target.value || null }))}
                placeholder="mm/dd/yy"
                style={{ colorScheme: "dark", minWidth: 0 }}
                className="block w-full min-w-0 max-w-full appearance-none rounded-lg border border-white/10 bg-white/[0.03] py-2 pl-9 pr-3 text-sm text-white focus:border-primary focus:outline-none"
              />
            </div>
          </div>
          <div className="min-w-0 w-full max-w-full">
            <label className="mb-1 block text-[10px] uppercase tracking-widest text-gray-500">
              Hasta
            </label>
            <div className="relative min-w-0 w-full max-w-full">
              <Calendar
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
              />
              <input
                type="date"
                value={filters.date_to ?? ""}
                onChange={(e) => setFilters((f) => ({ ...f, date_to: e.target.value || null }))}
                placeholder="mm/dd/yy"
                style={{ colorScheme: "dark", minWidth: 0 }}
                className="block w-full min-w-0 max-w-full appearance-none rounded-lg border border-white/10 bg-white/[0.03] py-2 pl-9 pr-3 text-sm text-white focus:border-primary focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={clearFilters}
            className="rounded-md border border-white/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-gray-300 hover:bg-white/[0.05] transition"
          >
            Limpiar filtros
          </button>
          <button
            onClick={applyFilters}
            className="rounded-md bg-primary px-4 py-2 text-xs font-bold uppercase tracking-widest text-primary-foreground hover:bg-primary/90 transition"
          >
            Aplicar filtros
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            <div className="grid grid-cols-[32px_1fr_80px_80px_90px_90px_70px_70px_70px] gap-2 px-4 py-2 text-[10px] uppercase tracking-widest text-gray-500 border-b border-white/10">
              <div>#</div>
              <div>Leader</div>
              <div>Set</div>
              <div>Colores</div>
              <div className="text-right">Play Rate</div>
              <div className="text-right">Win Rate</div>
              <div className="text-right">1st WR</div>
              <div className="text-right">2nd WR</div>
              <div className="text-right">Rondas</div>
            </div>

            {loading ? (
              <div className="space-y-2 p-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <SkeletonBlock key={i} className="h-12 rounded-lg" />
                ))}
              </div>
            ) : leaders.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-sm text-gray-400">Sin datos suficientes para mostrar el meta.</p>
                <p className="mt-2 text-xs text-gray-600">
                  Se requieren mínimo 5 rondas por leader.
                </p>
              </div>
            ) : (
              leaders.map((leader, index) => (
                <div
                  key={leader.leader_id}
                  className="grid grid-cols-[32px_1fr_80px_80px_90px_90px_70px_70px_70px] gap-2 px-4 py-3 items-center border-b border-white/[0.05] hover:bg-white/[0.02] transition"
                >
                  <div
                    className={`font-mono text-sm ${
                      index < 3 ? "text-primary font-bold" : "text-gray-400"
                    }`}
                  >
                    #{index + 1}
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    {leader.leader_image ? (
                      <img
                        src={leader.leader_image}
                        alt={leader.leader_name}
                        className="h-10 w-7 rounded-md border border-white/10 object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="flex h-10 w-7 items-center justify-center rounded-md border border-white/10 bg-black/30 flex-shrink-0">
                        <Shield size={12} className="text-gray-600" />
                      </div>
                    )}
                    <span className="text-sm font-semibold text-white truncate">
                      {leader.leader_name}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 truncate">{leader.card_set_id ?? "—"}</div>
                  <ColorDots colors={leader.colors} />
                  <div className="text-right font-mono text-sm font-bold text-primary">
                    {leader.play_rate}%
                  </div>
                  <div
                    className={`text-right font-mono text-sm font-bold ${wrColor(leader.win_rate)}`}
                  >
                    {leader.win_rate}%
                  </div>
                  <div className={`text-right font-mono text-xs ${wrColor(leader.first_win_rate)}`}>
                    {leader.first_win_rate != null ? `${leader.first_win_rate}%` : "—"}
                  </div>
                  <div
                    className={`text-right font-mono text-xs ${wrColor(leader.second_win_rate)}`}
                  >
                    {leader.second_win_rate != null ? `${leader.second_win_rate}%` : "—"}
                  </div>
                  <div className="text-right font-mono text-xs text-gray-400">
                    {leader.total_rounds}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <p className="mt-4 text-center text-[11px] text-gray-600">
        Solo se muestran leaders con mínimo 5 rondas registradas (torneos oficiales + sessions).
        {" · "}
        {metaData?.total_rounds ?? 0} rondas totales en el meta.
      </p>

      {/* Matchups heatmap */}
      {!loading && matchupData && matchupData.leaders.length >= 2 && (
        <MatchupHeatmap data={matchupData} />
      )}
    </div>
  );
}

function heatColor(wr: number): string {
  // rojo (0%) → gris (50%) → verde (100%), con alpha según distancia al 50
  const dist = Math.abs(wr - 50) / 50;
  const alpha = 0.12 + dist * 0.55;
  return wr >= 50 ? `rgba(52,211,153,${alpha})` : `rgba(248,113,113,${alpha})`;
}

function MatchupHeatmap({ data }: { data: MatchupData }) {
  const { leaders, matchups } = data;
  // Foco desktop: click en una fila/columna "pinea" ese líder — resalta su
  // fila+columna y atenúa el resto, así el ojo no tiene que sostener dos
  // posiciones en memoria mientras traza la intersección.
  const [activeId, setActiveId] = useState<string | null>(null);
  const toggleActive = (id: string) => setActiveId((cur) => (cur === id ? null : id));

  // Mobile: explorador enfocado en un líder (lista, no matriz) — a 375px de
  // ancho ni siquiera 6 columnas caben a tamaño legible, así que en vez de
  // encoger la matriz mostramos la fila de un líder como lista ordenada.
  const [selectedId, setSelectedId] = useState<string>(leaders[0]?.leader_id ?? "");
  const selectedLeader = leaders.find((l) => l.leader_id === selectedId) ?? leaders[0];
  const selectedRow = selectedLeader
    ? leaders
        .filter((l) => l.leader_id !== selectedLeader.leader_id)
        .map((opp) => ({ opp, cell: matchups[`${selectedLeader.leader_id}|${opp.leader_id}`] }))
        .filter((r): r is { opp: (typeof leaders)[number]; cell: NonNullable<typeof r.cell> } =>
          Boolean(r.cell),
        )
        .sort((a, b) => b.cell.win_rate - a.cell.win_rate)
    : [];

  return (
    <section className="mt-10">
      <header className="mb-4">
        <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-primary">
          <Swords size={12} /> Matchups
        </p>
        <h2 className="mt-1 text-xl font-bold text-white">Matriz de enfrentamientos</h2>
        <p className="mt-1 text-sm text-gray-400">
          Win rate del líder de la fila contra el líder de la columna. Mínimo 3 rondas por matchup.
        </p>
      </header>

      {/* Desktop: matriz completa con foco fila/columna al hacer click */}
      <div className="glass hidden overflow-x-auto rounded-2xl p-4 md:block">
        <table className="border-separate border-spacing-1">
          <thead>
            <tr>
              <th />
              {leaders.map((l) => (
                <th
                  key={l.leader_id}
                  className={`h-20 cursor-pointer pb-1 align-bottom transition-opacity ${
                    activeId && activeId !== l.leader_id ? "opacity-35" : "opacity-100"
                  }`}
                  title={l.leader_name}
                  onClick={() => toggleActive(l.leader_id)}
                >
                  <div className="flex flex-col items-center gap-1">
                    {l.leader_image ? (
                      <img
                        src={l.leader_image}
                        alt={l.leader_name}
                        className="mx-auto h-12 w-9 rounded-md border border-white/10 object-cover"
                      />
                    ) : (
                      <div className="mx-auto flex h-12 w-9 items-center justify-center rounded-md border border-white/10 bg-black/30">
                        <Shield size={12} className="text-gray-600" />
                      </div>
                    )}
                    <span
                      className="max-h-14 w-3 truncate text-[9px] text-gray-400"
                      style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                    >
                      {shortLeaderName(l.leader_name)}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leaders.map((row) => (
              <tr key={row.leader_id}>
                <th
                  className={`cursor-pointer pr-2 text-right text-xs font-semibold whitespace-nowrap transition-opacity ${
                    activeId && activeId !== row.leader_id ? "opacity-35" : "opacity-100"
                  } ${activeId === row.leader_id ? "text-primary" : "text-white"}`}
                  title={row.leader_name}
                  onClick={() => toggleActive(row.leader_id)}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span className="max-w-[90px] truncate">
                      {shortLeaderName(row.leader_name)}
                    </span>
                    {setBadge(row.card_set_id) && (
                      <span className="flex-shrink-0 rounded border border-white/10 bg-white/5 px-1 py-0.5 font-mono text-[9px] uppercase tracking-wide text-gray-400">
                        {setBadge(row.card_set_id)}
                      </span>
                    )}
                    {row.colors && row.colors.length > 0 && <ColorDots colors={row.colors} />}
                    {row.leader_image ? (
                      <img
                        src={row.leader_image}
                        alt=""
                        className="h-10 w-7 rounded-md border border-white/10 object-cover"
                      />
                    ) : null}
                  </span>
                </th>
                {leaders.map((col) => {
                  const dimmed =
                    !!activeId && activeId !== row.leader_id && activeId !== col.leader_id;
                  if (row.leader_id === col.leader_id) {
                    return (
                      <td
                        key={col.leader_id}
                        className={`h-12 w-14 rounded-md bg-white/[0.03] text-center text-xs text-gray-700 transition-opacity ${dimmed ? "opacity-35" : ""}`}
                      >
                        —
                      </td>
                    );
                  }
                  const cell = matchups[`${row.leader_id}|${col.leader_id}`];
                  if (!cell) {
                    return (
                      <td
                        key={col.leader_id}
                        className={`h-12 w-14 rounded-md bg-white/[0.02] text-center text-xs text-gray-700 transition-opacity ${dimmed ? "opacity-35" : ""}`}
                        title={`${row.leader_name} vs ${col.leader_name}: sin datos suficientes`}
                      >
                        ·
                      </td>
                    );
                  }
                  return (
                    <td
                      key={col.leader_id}
                      className={`h-12 w-14 rounded-md text-center align-middle transition-opacity ${dimmed ? "opacity-35" : ""}`}
                      style={{ backgroundColor: heatColor(cell.win_rate) }}
                      title={`${row.leader_name} vs ${col.leader_name}: ${cell.win_rate}% (${cell.wins}-${cell.total - cell.wins}, ${cell.total} rondas)`}
                    >
                      <div className="font-mono text-xs font-bold text-white">{cell.win_rate}%</div>
                      <div className="text-[9px] text-white/60">{cell.total}</div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-center text-[11px] text-gray-600">
          Click en un líder para resaltar su fila y columna · verde: favorable para la fila · rojo:
          desfavorable · número inferior: rondas del matchup.
        </p>
      </div>

      {/* Mobile: explorador por líder — una fila de la matriz como lista */}
      <div className="glass rounded-2xl p-4 md:hidden">
        <label className="mb-2 block text-[10px] uppercase tracking-widest text-gray-500">
          Líder
        </label>
        <BlockSelect
          value={selectedId || null}
          onChange={(v) => v && setSelectedId(v)}
          options={leaders.map((l) => ({
            value: l.leader_id,
            label: shortLeaderName(l.leader_name),
          }))}
          placeholder="Elegí un líder"
        />
        {selectedLeader && (
          <div className="mt-4 space-y-2">
            {selectedRow.length === 0 ? (
              <p className="py-6 text-center text-xs text-gray-500">
                Sin matchups con datos suficientes para {selectedLeader.leader_name}.
              </p>
            ) : (
              selectedRow.map(({ opp, cell }) => (
                <div
                  key={opp.leader_id}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3"
                >
                  {opp.leader_image ? (
                    <img
                      src={opp.leader_image}
                      alt={opp.leader_name}
                      className="h-12 w-9 flex-shrink-0 rounded-md border border-white/10 object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-9 flex-shrink-0 items-center justify-center rounded-md border border-white/10 bg-black/30">
                      <Shield size={12} className="text-gray-600" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-white">
                      <span className="truncate">{shortLeaderName(opp.leader_name)}</span>
                      {setBadge(opp.card_set_id) && (
                        <span className="flex-shrink-0 rounded border border-white/10 bg-white/5 px-1 py-0.5 font-mono text-[9px] uppercase tracking-wide text-gray-400">
                          {setBadge(opp.card_set_id)}
                        </span>
                      )}
                      {opp.colors && opp.colors.length > 0 && <ColorDots colors={opp.colors} />}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      {cell.wins}-{cell.total - cell.wins} · {cell.total} rondas
                    </p>
                  </div>
                  <div
                    className="rounded-lg px-3 py-1.5 text-right font-mono text-sm font-bold text-white"
                    style={{ backgroundColor: heatColor(cell.win_rate) }}
                  >
                    {cell.win_rate}%
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </section>
  );
}
