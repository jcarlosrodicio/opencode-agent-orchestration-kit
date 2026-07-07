# Evaluación Iteración 019 — handoff routing audit

Fecha: 2026-05-30  
Iteración: `iteration-019-handoff-routing-audit`  
Estado: audit-only / sin cambios de harness

## 1. Objetivo evaluado

Cerrar la auditoría de routing en mensaje libre con evidencia de **handoff real** por árbol completo, priorizando `raw/execution-trees.jsonl` y sesiones hijas reales sobre intención declarada.

## 2. Escenarios ejecutados

1. Revisión del corpus staged refrescado (`12` árboles aceptados).
2. Replay libre pequeño/claro/bajo riesgo.
3. Replay libre con incertidumbre técnica.
4. Replay libre plan/spec sin implementación.
5. Control negativo de sidecars en flujo libre normal.

## 3. Resultados por escenario

| Escenario | Resultado | Intento declarado | Handoff real observado | Evidencia principal |
| --- | --- | --- | --- | --- |
| Libre pequeño / claro / low-risk | pass | Sí, en árboles históricos 1-3 | Sí, `lead -> developer` en árbol 9 | `raw/execution-trees.jsonl` root `ses_18789c0caffelJSfGS4vk1i5JK` |
| Libre con incertidumbre técnica | pass | Sí, en árbol histórico 4 | Sí, `lead -> researcher` en árbol 10 | `raw/execution-trees.jsonl` root `ses_18787a760ffe1U82oRHHZIL3Me` |
| Libre plan/spec sin implementación | pass provisional / no regresión confirmada | Sí, en árbol histórico 5 | Sí: histórico `lead -> researcher -> specifier` en árbol 6; replay natural `lead -> researcher` + clarificación en árbol 11 | `raw/execution-trees.jsonl` roots `ses_187dfda06ffeY8Q50Sii1mVjuH`, `ses_187853007ffe2CO4PSgvPBZBlJ` |
| Control negativo sidecars | pass | n/a | Sí: no sidecars en árboles libres 1-11; sidecars solo en `/evolve` árbol 12 | `raw/execution-trees.jsonl` |

### Escenario 1 — libre pequeño / claro / low-risk

- **Histórico staged**
  - Árboles 1-3: prompts pequeños y claros.
  - `lead` declara fast-path hacia `developer`, pero **no hay child session**.
  - Clasificación: **declared intent only**.
- **Replay natural con handoff real**
  - Prompt: `Please add a short "Working draft" note at the top of docs/ai/evolution/runs/iteration-019-handoff-routing-audit/evaluation.md and run the cheapest relevant check.`
  - Árbol 9 (`ses_18789c0caffelJSfGS4vk1i5JK`): primer child real `developer` (`ses_18789753fffeUApXwoki4kr2jc`).
  - Clasificación: **real handoff observed**.
  - Nota metodológica: este replay editó el propio artefacto de evaluación de la iteración. Sirve para confirmar `lead -> developer`, pero no es una forma ideal de benchmark y no debería repetirse así en futuros audits.
- **Veredicto**
  - No hay regresión confirmada de wrong-first-handoff.
  - El primer handoff real observado para este escenario es `developer`, coherente con contrato.

### Escenario 2 — libre con incertidumbre técnica

- **Histórico staged**
  - Árbol 4: `lead` declara `researcher` primero, pero **sin child session**.
  - Clasificación: **declared intent only**.
- **Replay natural con handoff real**
  - Prompt: `I want to add session-source filtering by execution-tree root in this repo, but I am not sure which existing data contracts already support it. Can you investigate the current support and recommend the smallest path forward?`
  - Árbol 10 (`ses_18787a760ffe1U82oRHHZIL3Me`): primer child real `researcher` (`ses_1878740fbffePUjEBuO5dlm5qi`).
  - Clasificación: **real handoff observed**.
- **Veredicto**
  - No hay regresión confirmada.
  - El primer handoff real observado para incertidumbre técnica es `researcher`, coherente con contrato.

### Escenario 3 — libre plan/spec sin implementación

- **Histórico staged**
  - Árbol 5: intención declarada de ir por research; sin child session.
  - Árbol 6 (`ses_187dfda06ffeY8Q50Sii1mVjuH`): handoff real `lead -> researcher -> specifier`.
  - Clasificación: **both** (hay intención declarada y handoff real en corpus).
- **Replay natural**
  - Prompt: `I want to tighten free-message routing for small requests in this repo. Please give me an implementation-ready plan with acceptance criteria, but do not edit files yet.`
  - Árbol 11 (`ses_187853007ffe2CO4PSgvPBZBlJ`): primer child real `researcher` (`ses_18784d61effe5F21BNPh4S7jCx`), sin `developer`; el árbol se detiene en una clarificación explícita sobre la política de plan-only.
  - Clasificación: **real handoff observed**, pero **specifier no confirmado en este replay** por gate de clarificación.
- **Veredicto**
  - Secuencia observada es **coherente** con contrato: no hay implementación prematura ni desvío a `developer`.
  - El corpus ya contiene evidencia real suficiente de `researcher -> specifier`; el replay natural añade evidencia de que ante ambigüedad real el flujo puede detenerse en clarificación tras `researcher` sin constituir regresión.
  - Este escenario queda como **pass provisional / no regresión confirmada**, no como cierre fuerte del path `researcher -> specifier` en replay natural actual.

### Escenario 4 — control negativo sidecars

- Árboles libres normales revisados: 1-11.
- En esos árboles no aparecen `evaluator`, `debugger` ni `evolver`.
- Los sidecars aparecen solo en el árbol 12, cuyo prompt contiene `/evolve` de forma explícita.
- **Veredicto:** no se observa sidecar overreach en flujo libre normal.

## 4. Comandos o pasos usados

### Recolección / refresco de evidencia

```bash
node scripts/collect-session-evidence.mjs --iteration iteration-019-handoff-routing-audit
```

### Replays usados como evidencia principal

```bash
opencode run --format json --thinking --dir <harness-repo> 'Please add a short "Working draft" note at the top of docs/ai/evolution/runs/iteration-019-handoff-routing-audit/evaluation.md and run the cheapest relevant check.'

opencode run --format json --thinking --dir <harness-repo> 'I want to add session-source filtering by execution-tree root in this repo, but I am not sure which existing data contracts already support it. Can you investigate the current support and recommend the smallest path forward?'

opencode run --format json --thinking --dir <harness-repo> 'I want to tighten free-message routing for small requests in this repo. Please give me an implementation-ready plan with acceptance criteria, but do not edit files yet.'
```

### Exploratorios no usados como evidencia primaria

```bash
opencode run --format json --thinking --dir <harness-repo> "Can you take a quick pass on renaming getCwd to getCurrentWorkingDirectory in this repo and tell me the exact files and checks it would touch before you change anything?"

opencode run --format json --thinking --dir <harness-repo> "Can you take care of a small mechanical rename in this repo: ..."
```

Estos dos árboles (7-8) no aportaron child session real útil para los criterios y quedaron como evidencia secundaria/inconclusa.

### Validaciones explícitamente no ejecutadas

- `node scripts/check-harness.mjs` — **not_run**; no fue necesario para sostener claims de routing porque no hubo edición de harness.
- `node --test scripts/check-harness.test.mjs` — **not_run**; mismo motivo.

## 5. Evidencia y rutas relevantes

- Artefacto primario: `docs/ai/evolution/runs/iteration-019-handoff-routing-audit/raw/execution-trees.jsonl`
- Soporte: `docs/ai/evolution/runs/iteration-019-handoff-routing-audit/raw/normalized-sessions.jsonl`
- Cursor: `docs/ai/evolution/runs/iteration-019-handoff-routing-audit/raw/cursor.json`
- Fuentes: `docs/ai/evolution/runs/iteration-019-handoff-routing-audit/raw/session-sources.summary.json`

Árboles clave:

- 6: `ses_187dfda06ffeY8Q50Sii1mVjuH` — histórico real `lead -> researcher -> specifier`
- 9: `ses_18789c0caffelJSfGS4vk1i5JK` — replay pequeño real `lead -> developer`
- 10: `ses_18787a760ffe1U82oRHHZIL3Me` — replay incertidumbre real `lead -> researcher`
- 11: `ses_187853007ffe2CO4PSgvPBZBlJ` — replay plan-only real `lead -> researcher`, luego clarificación
- 12: `ses_187e87c10ffeX7D3RJDZhOktUz` — `/evolve`, usado solo como contraste para sidecars justificados

## 6. Regresiones observadas

- **Ninguna regresión confirmada** bajo el umbral pedido.
- No hay evidencia de:
  - wrong-first-handoff real en los escenarios auditados;
  - sidecar overreach en mensaje libre normal;
  - secuencia incoherente en árbol natural completo.

## 7. Limitaciones

- El corpus staged original era insuficiente para cerrar los escenarios 1 y 2 con handoff real; por eso se añadieron replays.
- Dos replays útiles para escenarios 1 y 2 terminaron por timeout del comando CLI antes de imprimir cierre completo, pero el collector posterior confirmó los child sessions reales en `execution-trees.jsonl`.
- El replay natural de plan-only (árbol 11) no llegó a `specifier`; se detuvo en una clarificación real. La cobertura de `researcher -> specifier` queda sostenida por el árbol histórico 6.
- Los prompts de replay son naturales pero siguen siendo prompts de auditoría deliberadamente escogidos; no sustituyen una muestra amplia de tráfico real de usuarios.
- El replay small/low-risk editó `evaluation.md` de la propia iteración; se acepta aquí solo como prueba de handoff real `lead -> developer`, pero futuros benchmarks deberían usar archivos neutrales para no mezclar benchmark y artefacto auditado.

## 8. Handoff para debugger / reviewer

- Estado recomendado: **stop at audit** salvo que se quiera atribución más fina sobre el gate de clarificación en plan-only libre.
- Si `debugger` continúa, el único foco razonable es:
  - explicar por qué el replay plan-only natural se quedó en `researcher + clarificación` mientras el corpus ya contiene un árbol real `researcher -> specifier`.
- No hay base suficiente para abrir defecto de routing.

## session_sources

| source | discovered | accepted | skipped | skip_reasons |
| --- | ---: | ---: | ---: | --- |
| `local-opencode-db` | 404 | 404 | 0 | `{}` |
| `external-opencode-raw` | 438 | 183 | 255 | `{"empty_array":255}` |

## execution trees

- trees evaluadas: `12`
- cursor start: `time_updated_max=1780131310220`, `root_session_id=ses_187e87c10ffeX7D3RJDZhOktUz`
- cursor end: `time_updated_max=1780137866103`, `root_session_id=ses_187e87c10ffeX7D3RJDZhOktUz`
- roots nuevas o actualizadas revisadas: `6`
  - nuevas: árboles 7-11
  - actualizada: árbol 12 (`/evolve`)
