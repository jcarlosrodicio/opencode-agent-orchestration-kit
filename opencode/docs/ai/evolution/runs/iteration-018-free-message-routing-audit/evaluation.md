# Evaluation — iteration-018-free-message-routing-audit

## 1. Objetivo evaluado

Evaluar el comportamiento de OpenCode en mensaje libre sin `/comando`, centrado en cómo `lead` enruta:

- requests pequeños/claros/de bajo riesgo,
- requests con incertidumbre técnica real,
- requests de plan/spec sin implementación,
- árboles con varias delegaciones,
- y si aparecen sidecars fuera de `/evolve` o fallos reales.

No se modificó código/config del harness. Esta evaluación usa `execution-trees.jsonl` como corpus primario y replays naturales solo para cubrir huecos del corpus staged.

## 2. Escenarios ejecutados

| Escenario | Evidencia principal | Resultado |
| --- | --- | --- |
| 1. Free-message small, clear, low-risk | replay `ses_187e1aa61ffeMK45edC9BUcADi` | pass |
| 2. Free-message technical uncertainty | histórico `ses_18807423fffey1ToAgBg9YtyaI` + replay `ses_187e12da9ffeyRjc2fNrgNb7Y7` | pass |
| 3. Free-message plan/spec sin implementación | replay `ses_187e0a2d6ffe40q84bHbdIiEWW` | pass |
| 4. Free-message complex request with multiple delegations | replay tree root `ses_187dfda06ffeY8Q50Sii1mVjuH` | pass |
| 5. Negative control: no sidecars in normal flow | replays `ses_187e1aa61ffeMK45edC9BUcADi`, `ses_187e12da9ffeyRjc2fNrgNb7Y7`, `ses_187e0a2d6ffe40q84bHbdIiEWW`, `ses_187dfda06ffeY8Q50Sii1mVjuH` | pass |

## 3. Resultados por escenario

### 3.1 Histórico: corpus staged por árbol completo

**Trees evaluadas:** `3`

- `ses_18807423fffey1ToAgBg9YtyaI`
- `ses_1880e3155ffeS87I6VQB6W9YHZ`
- `ses_187e87c10ffeX7D3RJDZhOktUz`

**Cursor start/end**

- `cursor_start.time_updated_max`: `1780128847905`
- `cursor_start.root_session_id`: `ses_1880e3155ffeS87I6VQB6W9YHZ`
- `cursor_end.time_updated_max`: `1780131310220`
- `cursor_end.root_session_id`: `ses_187e87c10ffeX7D3RJDZhOktUz`

**Roots nuevas o actualizadas revisadas:** `3`

**Hallazgo principal del corpus:** el staged corpus es demasiado pequeño para baseline histórico robusto. Solo `1` árbol staged es free-message sin slash y además es **sintético/coercitivo**, no baseline natural.

#### Tree `ses_18807423fffey1ToAgBg9YtyaI`

- Tipo: free-message **sintético/coercitivo**.
- Root agent: `lead`.
- Child sessions: `1`.
- Participating agents: `lead`, `researcher`.
- Evidencia: `docs/ai/evolution/runs/iteration-018-free-message-routing-audit/raw/execution-trees.jsonl`, `normalized-sessions.jsonl:3-4`.
- Observación: el prompt ordena explícitamente “feature técnica con incertidumbre de API” y “detente tras el primer handoff útil”; `lead` delega a `researcher` primero. Esto **sí** confirma que el routing a `researcher` existe, pero **no** sirve por sí solo como baseline natural.

#### Tree `ses_1880e3155ffeS87I6VQB6W9YHZ`

- Tipo: `/evolve` explícito.
- Participating agents: `lead`, `evaluator`, `debugger`, `evolver`, `developer`, `reviewer`.
- Observación: no cuenta como flujo normal libre; sí confirma que los sidecars aparecen cuando el comando AHE lo pide.

#### Tree `ses_187e87c10ffeX7D3RJDZhOktUz`

- Tipo: `/evolve` explícito.
- Observación: irrelevante como baseline de free-message normal.

### 3.2 Replay actual: prompts naturales y breves

#### Escenario 1 — small / clear / low-risk

- Session: `ses_187e1aa61ffeMK45edC9BUcADi`
- Prompt exacto: `I need a small, low-risk change in this repo: rename the helper getCwd to getCurrentWorkingDirectory consistently and run the relevant checks. Before making any changes, tell me what you would do first.`
- Resultado observado: `lead` clasifica el trabajo como “cambio pequeño, localizado y de bajo riesgo” y declara que, tras una inspección ligera de referencias, lo enrutaría a `developer`.
- Evidencia: replay output; SQLite local `~/.local/share/opencode/opencode.db` root session `ses_187e1aa61ffeMK45edC9BUcADi`.
- Veredicto: **pass** para criterio de routing. No hubo child session porque el prompt pidió explícitamente “tell me what you would do first”, así que observamos intención de handoff, no handoff ejecutado.

#### Escenario 2 — technical uncertainty

- Replay session: `ses_187e12da9ffeyRjc2fNrgNb7Y7`
- Prompt exacto: `I want to add session-source filtering by execution-tree root in this repo, but I'm not sure which existing data contracts already support it. Before making changes, tell me what you'd do first.`
- Resultado observado: `lead` declara explícitamente `researcher primero, no developer` y formula el objetivo de discovery.
- Evidencia: replay output; SQLite local root session `ses_187e12da9ffeyRjc2fNrgNb7Y7`.
- Veredicto: **pass**.

#### Escenario 3 — plan/spec sin implementación

- Session: `ses_187e0a2d6ffe40q84bHbdIiEWW`
- Prompt exacto: `I need a plan for tightening free-message routing around small requests in this repo. Don't implement anything yet; before making changes, tell me what you'd do first.`
- Resultado observado: `lead` dice `I would not implement first`, hace una revisión ligera de contexto y propone `researcher` discovery antes de proponer cambios.
- Evidencia: replay output; SQLite local root session `ses_187e0a2d6ffe40q84bHbdIiEWW`.
- Veredicto: **pass** para “sin implementación prematura”.
- Nota: aquí `lead` sí hizo lectura ligera de docs antes del handoff; eso parece permitido por contrato, pero es el patrón más cercano a posible ambigüedad intake-vs-research.

#### Escenario 4 — complex request with multiple delegations

- Root session: `ses_187dfda06ffeY8Q50Sii1mVjuH`
- Prompt exacto: `I want to tighten free-message routing for small requests in this repo. Please do the normal multi-agent process needed to get me to an implementation-ready plan with acceptance criteria, but do not edit any files yet.`
- Child sessions observadas por árbol completo:
  - `ses_187df49b6ffeJcXh1P6Utj6jMg` — `researcher`
  - `ses_187dca489ffevGugk2VeHlStq8` — `specifier`
- Secuencia observada: `lead -> researcher -> specifier`.
- Evidencia: SQLite local `session.parent_id` tree inspection; researcher prompt y specifier prompt confirman handoffs autocontenidos.
- Veredicto: **pass**.
- Observación: secuencia coherente para request complejo de plan; no se observaron `developer`, `reviewer` ni sidecars, consistente con “no edits yet”.

#### Escenario 5 — negative control: no sidecars in normal flow

- Replays observados:
  - `ses_187e1aa61ffeMK45edC9BUcADi` → agents: `lead`
  - `ses_187e12da9ffeyRjc2fNrgNb7Y7` → agents: `lead`
  - `ses_187e0a2d6ffe40q84bHbdIiEWW` → agents: `lead`
  - `ses_187dfda06ffeY8Q50Sii1mVjuH` → agents: `lead`, `researcher`, `specifier`
- Resultado observado: ningún replay natural activó `evaluator`, `debugger` ni `evolver`.
- Veredicto: **pass**.

## 4. Comandos o pasos usados

### Lectura de artefactos staged

- `read docs/ai/evolution/runs/iteration-018-free-message-routing-audit/raw/`
- `read .../session-sources.summary.json`
- `read .../cursor.json`
- `read .../execution-trees.jsonl`
- consultas Python/SQLite locales contra `docs/ai/evolution/runs/iteration-018-free-message-routing-audit/raw/*.jsonl`

### Replays ejecutados

- `opencode run --format json --thinking --dir <harness-repo> "I need a small, low-risk change in this repo: rename the helper getCwd to getCurrentWorkingDirectory consistently and run the relevant checks. Before making any changes, tell me what you would do first."`
- `opencode run --format json --thinking --dir <harness-repo> "I want to add session-source filtering by execution-tree root in this repo, but I'm not sure which existing data contracts already support it. Before making changes, tell me what you'd do first."`
- `opencode run --format json --thinking --dir <harness-repo> "I need a plan for tightening free-message routing around small requests in this repo. Don't implement anything yet; before making changes, tell me what you'd do first."`
- `opencode run --format json --thinking --dir <harness-repo> "I want to tighten free-message routing for small requests in this repo. Please do the normal multi-agent process needed to get me to an implementation-ready plan with acceptance criteria, but do not edit any files yet."`

### Soporte diagnóstico de replay

- consultas SQLite sobre `~/.local/share/opencode/opencode.db` para reconstruir árboles completos por `parent_id` y confirmar agentes participantes.

## 5. Evidencia y rutas relevantes

- Staged corpus:
  - `docs/ai/evolution/runs/iteration-018-free-message-routing-audit/raw/execution-trees.jsonl`
  - `docs/ai/evolution/runs/iteration-018-free-message-routing-audit/raw/normalized-sessions.jsonl`
  - `docs/ai/evolution/runs/iteration-018-free-message-routing-audit/raw/session-sources.summary.json`
  - `docs/ai/evolution/runs/iteration-018-free-message-routing-audit/raw/cursor.json`
- Replay/diagnóstico local:
  - `~/.local/share/opencode/opencode.db`

## 6. Hallazgos separados por nivel de certeza

### Observado en corpus histórico staged

- El corpus staged de esta iteración **no** basta por sí solo para juzgar baseline histórico de free-message normal.
- El único árbol free-message staged relevante (`ses_18807423fffey1ToAgBg9YtyaI`) es sintético/coercitivo y muestra `researcher` primero.
- Los sidecars observados en staged pertenecen a `/evolve`, no a flujo libre normal.

### Confirmado por replay actual

- En small/clear/low-risk, `lead` mantiene el fast-path conceptual hacia `developer`.
- En incertidumbre técnica real, `lead` elige `researcher` primero.
- En plan/spec sin implementación, `lead` evita implementación prematura y favorece discovery/spec flow.
- En un request complejo de plan, el árbol completo observado fue coherente: `lead -> researcher -> specifier`.
- En flujo libre normal no aparecieron `evaluator`, `debugger` ni `evolver`.

### Hipótesis / punto no resuelto todavía

- Hay una posible zona gris en el umbral entre **inspección ligera permitida** y **research que ya debería delegarse**. Esto aparece en los replays de plan-only/complex y además ya tenía antecedente documental en `docs/ai/evolution/runs/iteration-006-lead-delegation-audit/evaluation.md`, pero esta iteración no aporta corpus histórico natural suficiente para declararlo regresión por sí solo.

## 7. Regresiones observadas

- **Regresión confirmada:** ninguna.
- **Patrón a atribuir si se continúa a debugger:** `lead` tiende a hacer una capa de intake/document reading propia antes del primer handoff en prompts de planificación, incluso cuando luego enruta correctamente. Esto puede ser correcto según contrato actual, o puede indicar que el límite “light intake vs substantive research” sigue subespecificado.

## 8. Limitaciones

- `execution-trees.jsonl` staged solo contiene `3` árboles aceptados por cursor; solo `1` es free-message sin slash y no es natural.
- Los replays fueron necesarios para cubrir escenarios obligatorios; por tanto, los hallazgos de baseline descansan más en replay actual que en corpus histórico.
- Los prompts de replay usaron la forma natural “Before making changes, tell me what you would do first”, lo que reduce el riesgo de edición pero también hace más frecuente observar **intención de handoff** en vez de subagente ya invocado.
- El replay complejo excedió el timeout shell de `240000ms`; la reconstrucción completa del árbol se hizo luego vía SQLite local. El árbol sí mostró `researcher` y `specifier`.

## 9. Fuentes staged (`session_sources`)

### `local-opencode-db`

- discovered: `385`
- accepted: `385`
- skipped: `0`
- skip_reasons: `{}`

### `external-opencode-raw`

- discovered: `416`
- accepted: `171`
- skipped: `245`
- skip_reasons: `{ "empty_array": 245 }`

## 10. Handoff para debugger / reviewer

### Para debugger

La evidencia **sí es suficiente** para una fase **debugger-only** acotada, pero **no** para saltar a manifest/apply.

Foco recomendado:

1. Atribuir si el patrón observado es realmente un problema o solo refleja el contrato actual:
   - `agents/lead.md`
   - `docs/ai/harness/commands.md`
   - `docs/ai/harness/agents.md`
2. Resolver si free-message plan-only debe:
   - ir siempre `researcher -> specifier`, o
   - permitir `specifier` directo cuando ya hay contexto suficiente.
3. Precisar el umbral observable entre:
   - intake ligero permitido,
   - versus discovery que ya debería pertenecer a `researcher`.

### Para reviewer

- No hay diff del harness en esta tarea; no procede review de cambios.
- Sí hay evidencia suficiente para revisar la **calidad del diagnóstico** si el lead decide abrir debugger-only.

## 11. Decisión recomendada para la rama

**Continuar solo a `debugger-only`**, no a `evolver` ni `developer`.

Motivo:

- el audit ya confirma que el baseline actual **no** muestra sidecar overreach en flujo libre normal;
- también confirma que el routing principal (`developer` para small, `researcher` para uncertainty, `research/spec` para plan-only) funciona;
- el único punto con señal suficiente para atribución es la ambigüedad **intake ligero vs primer handoff**, no una regresión cerrada.
