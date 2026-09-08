# Nexus TCG — Documento de Diseño de Alto Nivel (Frontend)

> Formaliza el sistema de diseño y la arquitectura frontend del proyecto actual. No es un rewrite: es la especificación que el stack ya instalado (TanStack Start, React Query, Tailwind v4, Radix/shadcn, Framer Motion) debe seguir de aquí en adelante.
> Público objetivo: jugadores, organizadores de tienda, TCG Managers y Admin — los cuatro con el mismo nivel de cuidado visual.
> Vibra: gaming/TCG vibrante — energía de carta y liga competitiva, no un dashboard SaaS genérico.

---

## 1. Visión general y arquitectura

Nexus TCG es una plataforma multi-rol (jugador, organizador, manager, admin) sobre un solo dominio de datos compartido (torneos → resultados → standings → stats/meta). El frontend debe reflejar esa realidad: **una sola app, cuatro experiencias**, no cuatro apps separadas.

### Patrón recomendado: **Feature-Sliced por rol, con capa de datos compartida**

```
src/
  routes/            # TanStack Router — ya organizado por prefijo de rol (admin.*, organizer.*, tcg-manager.*, players.*)
  lib/
    nexus-*.functions.ts   # capa de servicios por dominio — MANTENER, es el patrón correcto
    *-queries.ts            # hooks de lectura con React Query
  components/
    ui/               # primitivos shadcn — agnósticos de rol
    {admin,organizer,tournament-tracker,layout,ads,stores}/  # componentes de dominio, ya segmentados por rol
  context/            # estado global mínimo (tcg.context.tsx)
```

Esta estructura **ya existe** en el repo — el HLD no pide reestructurar carpetas, pide dos cosas:

1. **Congelar el patrón** `nexus-*.functions.ts` como la única puerta de entrada a Supabase — ningún componente llama a Supabase directo.
2. **Un design system compartido** (sección 3) consumido por los cuatro roles, con variantes de acento por rol (organizer=verde, manager=azul, admin=morado, player=dorado — como ya aparece en el artefacto de documentación interna) en vez de temas completamente distintos.

### Por qué este patrón y no otro

- Un monolito de rutas por rol (lo que ya existe) escala mejor que microfrontends separados: los cuatro roles comparten el mismo motor de datos (standings, achievements, meta) y separarlos en apps distintas duplicaría lógica.
- La capa `*.functions.ts` ya actúa como anti-corruption layer contra Supabase — es el patrón correcto para un backend que puede migrar (RLS, políticas, funciones RPC) sin romper componentes.

---

## 2. Stack tecnológico y librerías

| Capa | Elección (ya instalada) | Por qué se mantiene |
|---|---|---|
| Framework | **TanStack Start + React** | SSR/streaming nativo, file-based routing tipado, ya es la base del proyecto — no hay razón para migrar a Next.js. |
| Ruteo | **TanStack Router** | Type-safe end-to-end con los loaders; el árbol de rutas ya modela los 4 roles limpiamente. |
| Estado servidor | **TanStack Query (React Query)** | Cache, invalidación y estados de carga para las ~120 funciones de Supabase — evita reinventar loading/error states. |
| Estado UI local | **React Context** (ya usado en `tcg.context.tsx`) + estado de componente | No se necesita Redux/Zustand: el estado compartido real (juego activo, sesión) es pequeño. |
| Validación | **Zod** | Ya en uso; debe ser la única fuente de verdad de shape de formularios y de las respuestas de `nexus-*.functions.ts`. |
| Animación | **Framer Motion** | Encaja con la vibra "gaming vibrante" (transiciones de standings, reveals de resultados, achievement pop-ins) sin salir del ecosistema React. |
| Componentes | **shadcn/ui sobre Radix** | Accesibilidad (foco, ARIA, teclado) resuelta por Radix; shadcn da control total del código, no es una dependencia de caja negra. |
| Estilos | **Tailwind CSS v4** | Utility-first, ya integrado vía `@tailwindcss/vite`; es la base de la sección 4. |

No se agrega ninguna librería nueva — el ladder de "usa lo que ya está instalado" aplica: todo lo que pide un HLD estándar (routing, data fetching, validación, animación, componentes) ya está resuelto por el stack actual.

---

## 3. Sistema de diseño (UI/UX)

### 3.1 Paleta de colores

Base neutra tipo papel/carta (no blanco puro — se siente más "playmat" que "SaaS"), con un acento primario de marca y cuatro acentos de rol ya sugeridos por la documentación interna.

**Fondos y neutros**

| Token | Uso | HEX (light) | HEX (dark) |
|---|---|---|---|
| `--paper` | Fondo base | `#F6F3EC` | `#181613` |
| `--card` | Superficie de tarjetas | `#FFFDF8` | `#211E19` |
| `--line` | Bordes/divisores | `#DDD6C7` | `#3A352C` |
| `--ink` | Texto principal | `#1C1A17` | `#F2EDE2` |
| `--ink-soft` | Texto secundario | `#4A453D` | `#C4BCAC` |

**Acento primario (marca)**

| Token | HEX (light) | HEX (dark) |
|---|---|---|
| `--accent` | `#C8501F` | `#E8763F` |
| `--accent-soft` (fondo suave) | `#F0D9C8` | `#3A2417` |

**Acentos de rol** (ya validados en la doc interna del proyecto)

| Rol | Color | HEX (light) | Soft (light) |
|---|---|---|---|
| Organizador | Verde | `#1F6F5C` | `#DCECE5` |
| TCG Manager | Azul | `#2A5A9E` | `#DBE6F4` |
| Admin | Morado | `#7A3FA0` | `#E9DCF2` |
| Jugador | Dorado | `#B8890C` | `#F2E6C6` |

**Estados**

| Estado | HEX (light) | HEX (dark) | Uso |
|---|---|---|---|
| Éxito | `#1F7A4D` | `#4FD98A` | Resultado publicado, torneo aprobado |
| Advertencia | `#B8890C` | `#E0B846` | Pendiente de revisión, RSVP por confirmar |
| Error | `#C0392B` | `#E8574A` | Rechazo, torneo despublicado, fallo de carga |
| Info | `#2A5A9E` | `#7AA9E8` | Notificaciones neutrales |

> Los acentos de rol y de estado deben poder convivir en la misma pantalla (ej. un TCG Manager viendo un torneo "pendiente" de una tienda) — por eso los estados usan su propia paleta y no reusan los colores de rol.

### 3.2 Tipografía

- **Encabezados:** `Fraunces` (serif con variable optical size) — da el punto "editorial/liga deportiva" en vez de look genérico de dashboard, se lee bien en tamaños grandes (hero, nombres de jugador destacados).
- **Cuerpo y UI:** `IBM Plex Sans` — neutral, muy legible en tablas de standings y formularios densos.
- **Datos/mono:** `IBM Plex Mono` — para tags de jugador, IDs de torneo, timestamps, badges de rol. Refuerza la sensación "de sistema" sin perder calidez.

Jerarquía sugerida: H1 40-58px (clamp), H2 28-32px, body 14-15.5px, mono/labels 11-13px con letter-spacing +0.06–0.12em.

### 3.3 Formas, sombras y accesibilidad

- **Bordes:** mayormente rectos/levemente redondeados (4-6px) en tarjetas y tablas — refuerza el look "playmat/ficha de torneo". Pills totalmente redondeados (100px) reservados para badges de rol, tags de estado y navegación por rol (ya usado en el artefacto de referencia).
- **Sombras:** mínimas, casi planas (`0 1px 0 rgba(...)`) — el peso visual lo dan los bordes de 1px y el color, no el drop-shadow. Encaja con la vibra "carta física sobre mesa" en vez de "flotando en Material Design".
- **Accesibilidad (no negociable):**
  - Contraste AA mínimo en texto sobre fondo (verificar los `-soft` de cada acento, que están pensados como fondo, no como texto).
  - Todo estado interactivo con `:focus-visible` visible (outline 2px con el color de acento).
  - Los cuatro colores de rol y los cuatro de estado deben diferenciarse también por texto/ícono, no solo por color (daltonismo).
  - Componentes Radix ya resuelven teclado/ARIA — no reimplementar dropdowns, dialogs o tabs a mano.

---

## 4. Estrategia de estilos y componentes

**Tailwind CSS v4 + shadcn/ui (Radix) — mantener, no reemplazar.**

Justificación puntual para este proyecto:

- El repo ya tiene ~30 componentes shadcn en `src/components/ui` — introducir Material UI o Chakra ahora sería una migración completa sin beneficio, contra el criterio de "ya instalado resuelve el problema".
- Tailwind v4 permite mapear la paleta de la sección 3 directamente a tokens CSS (`--paper`, `--accent`, etc.) vía `@theme` — un solo lugar de verdad para light/dark, consumible tanto por Tailwind como por CSS plano en componentes que lo necesiten (ej. gráficas).
- Los acentos de rol (organizer/manager/admin/player) se implementan como **data-attribute + variables CSS scoped**, no como temas Tailwind separados — así un mismo componente `<RoleBadge>` cambia de color según `data-role`, sin duplicar componentes por rol.

### Siguiente paso concreto

1. Portar la paleta de la sección 3.1 a `:root` / `@theme` en el CSS global (ya existe el patrón en el artefacto de referencia, solo falta moverlo del artifact al proyecto real).
2. Auditar `src/components/ui` contra esta paleta — reemplazar cualquier color hardcodeado por los tokens.
3. Definir `RoleBadge`/`RoleTag` como componente único parametrizado por rol, reusable en las 4 secciones de rol.
