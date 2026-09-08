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

> Borrador para validar con Dirección General. Un módulo P0 solo se considera "listo" si cumple todo lo de su etapa.

### Alpha
Uso interno + tiendas piloto, sin exposición pública amplia.

- Flujo completo registro → evento → resultado → ranking corre de punta a punta sin intervención manual del equipo técnico.
- Roles y permisos verificados para admin, tcg-manager, organizador/tienda y jugador.
- Corrección de resultados solo posible con trazabilidad (quién, cuándo, por qué) y autorización de rol correspondiente.
- Respaldo de base de datos configurado y una restauración probada al menos una vez.
- Al menos 1 tienda piloto real corrió un evento completo en la plataforma.

### Beta
Expansión a más Founding Stores, aún con soporte técnico cercano.

- Todo lo de Alpha, sostenido sin incidentes críticos durante al menos 2 semanas.
- Standings/desempates/clasificación validados por Operaciones con datos reales de al menos un evento.
- Dashboards mínimos entregados a CEO, Operaciones, Comercial y Administración.
- Proceso de soporte e incidencias documentado y en uso (ver sección 6).
- % de tiendas activadas sin intervención manual ≥ objetivo definido en el scorecard.

### Launch Readiness (arranque oficial de Season 1)
- Todos los módulos P0 completos y verificados (100%).
- Cero incidentes críticos abiertos sin plan de mitigación.
- Rollback probado (ver abajo) al menos una vez en ambiente de staging.
- Monitoreo básico activo (alertas de caída de flujo crítico).
- Aceptación explícita de Dirección General sobre alcance y fecha.

### Rollback
Condiciones que activan un rollback o congelamiento de release:

- Pérdida o corrupción de datos de resultados/standings detectada.
- Falla que impide a una tienda reportar resultados dentro del plazo operativo.
- Vulnerabilidad de seguridad activa sin mitigación inmediata.
- Bug que permite alterar resultados o rankings sin trazabilidad.

Mecanismo: revertir a la última migración/versión estable conocida (ver `supabase/migrations/`), notificar a tiendas afectadas, y no reabrir el flujo hasta que el módulo vuelva a cumplir criterios de su etapa (Alpha/Beta).

## 6. Proceso de soporte e incidencias

> Borrador para validar con Operaciones/Administración.

### Canal de reporte

- **Tiendas / organizadores:** canal único (WhatsApp/Slack de soporte o formulario dentro de la plataforma) — no reportar directo a Rodrigo por mensaje personal, para que quede trazabilidad.
- **Admins/Comercial/Administración:** mismo canal, marcado con su rol.
- Todo reporte debe incluir: quién reporta, tienda/torneo afectado, qué esperaba vs. qué pasó, hora aproximada.

### Clasificación de severidad

| Severidad | Definición | Ejemplo | Tiempo de respuesta objetivo |
|---|---|---|---|
| **Crítica (S1)** | Bloquea reportar resultados, corrompe datos, o expone datos privados | No se puede cerrar un torneo, standings incorrectos publicados | Respuesta ≤ 30 min, mitigación ≤ 4h |
| **Alta (S2)** | Afecta a una tienda/torneo pero hay workaround manual | Un jugador no aparece en standings, error en un módulo secundario | Respuesta ≤ 4h, fix en el día |
| **Media (S3)** | Molesta pero no bloquea operación | Bug visual, texto incorrecto | Respuesta ≤ 1 día hábil |
| **Baja (S4)** | Mejora/cosmético | Sugerencia de UX | Backlog (P1/Future) |

### Escalación

1. Reporte entra al canal → se clasifica severidad.
2. S1/S2: Rodrigo (o quien esté de guardia) atiende directo.
3. Si requiere decisión de alcance/reglas: escala a CEO/Operaciones según el mandato ("no define reglamentos unilateralmente").
4. Cierre: se documenta causa raíz y fix en el mismo canal, para que quede como historial (auditoría).

### Riesgo conocido

Hoy depende de una sola persona (Rodrigo) para operación/soporte — mismo riesgo que señala el mandato. Mitigación a mediano plazo: definir un segundo responsable de guardia antes de escalar a las 89 Founding Stores.

## Fecha propuesta de Platform Alpha

_Pendiente — depende de cerrar la tabla de la sección 4._
