# MCL Platform — Arquitectura actual

> Última actualización: 2026-09-07.

## Stack

- **Frontend:** React + TanStack Router (`src/routes/*.tsx`, generado en `src/routeTree.gen.ts`).
- **UI:** componentes shadcn/ui en `src/components/ui`, componentes de dominio en `src/components/{admin,ads,layout,stores,tournament-tracker}`.
- **Backend:** Supabase (Postgres, Auth, RLS). Esquema y migraciones versionadas en `supabase/migrations/`.
- **Capa de servicios:** funciones `nexus-*.functions.ts` en `src/lib`, organizadas por dominio y por rol.

## Roles y superficies

| Rol | Rutas |
|---|---|
| Admin | `admin.*` (players, stores, tournaments-panel, publish, upload, seasons, calendar, activity, history) |
| TCG Manager | `tcg-manager.*` (tournaments-panel, stores, analytics, history, calendar) |
| Organizador / Tienda | `organizer.*` (tournaments, store, leagues, calendar, players, appeals, history) |
| Jugador | `players.$playerTag*`, `my-stats`, `sessions*`, `dashboard`, `stores*` |

## Dominios cubiertos por la capa de funciones (`src/lib`)

- Auth: `nexus-auth.functions.ts`, `nexus-auth-helpers.functions.ts`, `nexus-auth.middleware.ts`, `nexus-auth.attacher.ts`
- Admin: `nexus-admin*.functions.ts` (general, players, stores, tournaments, meta)
- Manager (TCG Manager): `nexus-manager*.functions.ts` (tournaments, stores, history, analytics, calendar)
- Organizador/tienda: `nexus-organizer*.functions.ts` (tournaments, stores, history, analytics, calendar, leagues)
- Leaderboard / standings: `nexus-leaderboard.functions.ts`, `leaderboard-queries.ts`
- Achievements / recompensas: `achievement-rewards.ts`, migraciones `player_achievements`, `equippable_*`
- Apelaciones: `nexus-appeals.functions.ts`
- Standalone tracker (sesiones fuera de torneo oficial): `nexus-standalone*.functions.ts`
- Ads: `nexus-ads.functions.ts`
- RSVP/asistencia: `nexus-rsvp.functions.ts`

## Datos (migraciones relevantes)

- `20260714072000_rls_hardening.sql` — políticas de seguridad a nivel de fila.
- `20260829000000_store_leagues.sql` y siguientes — ligas por tienda, horarios, overrides.
- `20260902100000_player_achievements.sql` y siguientes — achievements, badges, titles, nameplates equipables.
- `20260902090000_store_page_views.sql` — analytics de vistas de tienda.

## Gaps conocidos (ver roadmap.md para el detalle priorizado)

- No hay documento formal de criterios Alpha/Beta/Launch Readiness/rollback.
- No hay proceso de soporte e incidencias definido.
- Monitoreo/incident management no está formalizado (solo rate limiting + RLS).
- Corrección controlada de resultados con trazabilidad completa no está verificada end-to-end.
