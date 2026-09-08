# MCL Season 1 — Product Roadmap v1

> Entregable central del primer sprint (14 días) del mandato de Founding Director / CTO.
> Autor: Rodrigo Ramos. Última actualización: 2026-09-07.

## 1. Estado real de la plataforma (resumen de arquitectura)

- **Frontend:** React + TanStack Router (`src/routes`), componentes en `src/components`, UI basada en shadcn (`src/components/ui`).
- **Backend/datos:** Supabase (Postgres + RLS). Migraciones en `supabase/migrations/`.
- **Capa de funciones:** módulos `nexus-*.functions.ts` en `src/lib` actúan como capa de servicios por dominio (auth, admin, organizer, manager, standalone tracker, achievements, appeals, ads, calendar, etc).
- **Roles existentes:** admin, tcg-manager, organizer/tienda, jugador — cada uno con su set de rutas (`admin.*`, `tcg-manager.*`, `organizer.*`).

Detalle completo en [`architecture.md`](./architecture.md).

## 2. Inventario de módulos

| Módulo | Estado |
|---|---|
| Cuentas, autenticación, roles y permisos | Existente |
| Perfiles de jugador + historial competitivo | Existente |
| Cuentas de tienda, creación de eventos, asistencia, reporte de resultados | Existente |
| Standings, puntos, desempates, clasificación, wildcards, playoffs | Existente (falta validar wildcards/playoffs en vivo) |
| Rankings, stats, achievements, badges, titles, Legacy Points | Existente |
| Dashboard administrativo + auditoría | Existente (parcial: falta corrección controlada de resultados con trazabilidad completa) |
| Analytics de liga para Comercial | Existente (parcial) |
| Seguridad, respaldo, privacidad, monitoreo, incident management | Parcial (hay RLS hardening y rate limiting; falta monitoreo/incident management formal) |
| Soporte e incidencias (tiendas/admins) | **Faltante** |
| Criterios de Alpha/Beta/Launch Readiness/rollback | **Faltante (documento)** |

## 3. Priorización P0 / P1 / Future

### P0 — Season 1 (bloqueante para Alpha)
- Flujo completo registro → evento → resultado → ranking sin intervención manual.
- Corrección controlada de resultados con trazabilidad y autorización.
- Permisos y auditoría verificados en escenarios reales de tienda.
- Respaldo y recuperación probados.

### P1 (post-Alpha, antes de Launch)
- Dashboards de Comercial/Administración más completos.
- Proceso formal de soporte e incidencias.
- Monitoreo/incident management activo.

### Future
- Funcionalidades estéticas/nice-to-have que no bloquean Season 1.

## 4. Owners, esfuerzo, dependencias, riesgos y fecha por módulo P0

| Módulo P0 | Owner técnico | Estado | Fecha objetivo |
|---|---|---|---|
| Flujo registro→evento→resultado→ranking | Rodrigo Ramos | En validación | _pendiente definir_ |
| Corrección controlada de resultados | Rodrigo Ramos | Por construir | _pendiente definir_ |
| Auditoría de permisos | Rodrigo Ramos | Por validar | _pendiente definir_ |
| Respaldo/recuperación | Rodrigo Ramos | Por probar | _pendiente definir_ |

**Riesgos:** deuda técnica subestimada, features atractivas antes de cerrar P0, cambios de resultados sin trazabilidad, bus factor de 1 persona (ver mandato, sección Riesgos).

## 5. Criterios de Alpha / Beta / Launch Readiness / rollback

_Pendiente de definir con Dirección General — placeholder a completar en la próxima revisión._

- **Alpha:** ?
- **Beta:** ?
- **Launch Readiness:** ?
- **Rollback:** ?

## 6. Proceso de soporte e incidencias

_Pendiente de diseñar._ Debe cubrir: canal de reporte para tiendas/admins, clasificación de severidad, tiempo de respuesta objetivo, escalación.

## Fecha propuesta de Platform Alpha

_Pendiente — depende de cerrar la tabla de la sección 4._
