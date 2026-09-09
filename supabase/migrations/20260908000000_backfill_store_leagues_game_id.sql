-- Backfill de game_id para ligas creadas antes de la regla "un TCG por
-- liga" (ver 20260906000000_store_leagues_game_id.sql — se agregó nullable
-- a propósito para no romper ligas existentes).
--
-- Problema real: el dropdown "a qué liga pertenece" al subir un torneo
-- (getActiveLeaguesForStore en nexus-organizer-leagues.functions.ts) filtra
-- con `.eq("game_id", data.game_id)`, y en Postgres/PostgREST eso nunca
-- matchea NULL — las ligas legacy sin game_id quedaban invisibles ahí,
-- bloqueando agregar resultados a una liga ya corriendo hasta que el
-- organizador entrara a editarla manualmente y le pusiera un TCG.
--
-- Se infiere el game_id del torneo MÁS RECIENTE ya vinculado a cada liga
-- (store_league_tournaments) — es la señal más confiable de "para qué TCG
-- se está usando esta liga hoy". Una liga legacy que mezcló torneos de
-- varios TCGs (permitido antes de esta regla) queda con el juego de su
-- torneo más reciente; si eso no es lo que el organizador quiere, sigue
-- pudiendo corregirlo a mano desde la edición de la liga, igual que antes.
--
-- ponytail: ligas sin NINGÚN torneo vinculado no tienen de dónde inferir
-- el juego — quedan en NULL, sin cambio; el organizador las setea la
-- primera vez que suba un torneo para ellas.
update public.store_leagues sl
set game_id = sub.game_id
from (
  select distinct on (slt.league_id)
    slt.league_id,
    t.game_id
  from public.store_league_tournaments slt
  join public.tournaments t on t.id = slt.tournament_id
  order by slt.league_id, slt.added_at desc
) sub
where sl.id = sub.league_id
  and sl.game_id is null;
