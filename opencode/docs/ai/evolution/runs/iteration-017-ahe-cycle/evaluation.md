# Evaluación Iteración 017 — AHE Cycle

**Fecha:** 2026-05-30  
**Iteración:** 017 (`ahe-cycle`)  
**Estado:** evidencia suficiente para `debugger`; no procede propuesta de cambios todavía

## 1. Objetivo evaluado

Evaluar el estado actual del harness para `/evolve` y routing relacionado usando:

- artefactos staged de `session_sources`;
- evidencia primaria por `execution trees`;
- validaciones locales del harness;
- muestreo de árboles históricos para detectar fallos/riesgos de routing.

## 2. Scenarios ejecutados

| ID | Escenario | Tipo | Resultado |
| --- | --- | --- | --- |
| S1 | Integridad de staging `session_sources` + cursor incremental | static_contract | pass |
| S2 | Contrato documental actual de `/evolve` y sidecars opcionales | static_contract | pass |
| S3 | Corpus histórico: `/feature` no debe hacer sidecars obligatorios | transcript_replay sobre trees staged | fail |
| S4 | Corpus histórico: feature técnica con incertidumbre delega primero a `researcher` | transcript_replay sobre trees staged | pass |
| S5 | `node scripts/check-harness.mjs` | live_smoke | pass |
| S6 | `node --test scripts/check-harness.test.mjs` | live_smoke | fail |
| S7 | Replay live nuevo con `opencode run` para routing técnico | transcript_replay | not_run |

## 3. Resultados por escenario

### S1 — Integridad de staging `session_sources` + cursor incremental

**Resultado:** pass

**Comandos/pasos usados:**

- lectura de `raw/session-sources.summary.json`
- lectura de `raw/cursor.json`
- lectura parcial de `raw/execution-trees.jsonl`

**Evidencia:**

- `raw/session-sources.summary.json:4-22`
  - `local-opencode-db`: discovered `375`, accepted `375`, skipped `0`
  - `external-opencode-raw`: discovered `406`, accepted `164`, skipped `242`, `skip_reasons.empty_array=242`
- `raw/cursor.json:2-19`
  - `cursor_mode=execution_tree_incremental`
  - `cursor_start=null`
  - `trees_discovered=129`, `trees_accepted=129`, `trees_skipped=0`
  - supplemental raw: `matched=132`, `unmatched=32`

**Conclusión observable:** el staging requerido por `session-sources.md` existe, tiene conteos coherentes y el cursor incremental por árbol está presente.

### S2 — Contrato documental actual de `/evolve` y sidecars opcionales

**Resultado:** pass

**Comandos/pasos usados:**

- lectura de `commands/evolve.md`
- lectura de `docs/ai/harness/commands.md`
- lectura de `docs/ai/harness/checks.md`

**Evidencia:**

- `commands/evolve.md:76-111` documenta ramas `evaluation-only`, `debugger-only` / `no-apply` / `no-manifest` y bloquea `developer` sin manifest/aprobación.
- `docs/ai/harness/commands.md:157-201` replica el contrato de `/evolve`, incluyendo `session_sources`, `execution trees` y stop conditions.
- `docs/ai/harness/checks.md:36-43` declara que un run con `evaluation.md` pero sin `analysis/overview.md` ni `change_manifest.json` es un estado intermedio válido.

**Conclusión observable:** el contrato está escrito de forma compatible con auditorías sin aplicación y con sidecars no obligatorios fuera de `/evolve`.

### S3 — Corpus histórico: `/feature` no debe hacer sidecars obligatorios

**Resultado:** fail

**Comandos/pasos usados:**

- inspección de `raw/normalized-sessions.jsonl`

**Evidencia:**

- `raw/normalized-sessions.jsonl:101-109`
  - root `ses_21cb97bcdffeE10ri056Aeafpz`
  - prompt: `"/feature Prueba Test para probar todo el flujo..."`
  - summary: `Agentes contactados: designer, researcher, specifier, developer, reviewer, evaluator, debugger, evolver.`

**Conclusión observable:** existe al menos un árbol aceptado donde `/feature` contactó `evaluator`, `debugger` y `evolver`, contradiciendo la regla de sidecars opcionales y el mecanismo rechazado `mech-sidecars-for-every-feature`.

### S4 — Corpus histórico: feature técnica con incertidumbre delega primero a `researcher`

**Resultado:** pass

**Comandos/pasos usados:**

- inspección de `raw/normalized-sessions.jsonl`

**Evidencia:**

- `raw/normalized-sessions.jsonl:110-111`
  - root `ses_21ba737f5ffeKn3KgWOiw704wo` describe feature técnica con APIs de Polymarket
  - child inmediato `ses_21ba6d31fffeKitYG0px0vpxUi` = `Research Polymarket APIs (@researcher subagent)`

**Conclusión observable:** el corpus también contiene un control positivo donde el routing técnico sí delega discovery sustantivo a `researcher` antes de la especificación/implementación.

### S5 — `node scripts/check-harness.mjs`

**Resultado:** pass

**Comando usado:**

```bash
node scripts/check-harness.mjs
```

**Evidencia:**

- salida observada: `Harness check passed.`

**Conclusión observable:** la estructura/documentación actual del harness supera el checker local en el estado actual del repo.

### S6 — `node --test scripts/check-harness.test.mjs`

**Resultado:** fail

**Comando usado:**

```bash
node --test scripts/check-harness.test.mjs
```

**Evidencia:**

- la ejecución no terminó dentro del timeout de 120s;
- salida final:
  - `cancelled 1`
  - `Promise resolution is still pending but the event loop has already resolved`

**Conclusión observable:** la suite de tests del checker no está estable en este entorno/estado y actualmente no puede usarse como validación verde de baseline.

### S7 — Replay live nuevo con `opencode run` para routing técnico

**Resultado:** not_run

**Comando usado:**

```bash
opencode run --format json --thinking --dir <harness-repo> --command feature "..."
```

**Evidencia:**

- el replay excedió el timeout de 180s antes de completar un primer handoff útil verificable;
- solo quedó evidencia parcial de skill loading e inspección inicial, insuficiente para un veredicto honesto de routing.

**Conclusión observable:** no se usa este replay como prueba concluyente en esta iteración.

## 4. Comandos usados

```bash
node scripts/check-harness.mjs
node --test scripts/check-harness.test.mjs
rtk git status --short --branch
opencode run --format json --thinking --dir <harness-repo> --command feature "..."
```

Además se hicieron lecturas directas de:

- `commands/evolve.md`
- `docs/ai/harness/commands.md`
- `docs/ai/harness/checks.md`
- `docs/ai/evolution/session-sources.md`
- `docs/ai/evolution/benchmarks/manual-scenarios.md`
- `docs/ai/evolution/benchmarks/router-scenarios.jsonl`
- `docs/ai/evolution/mechanisms.jsonl`
- `docs/ai/evolution/rejected_mechanisms.jsonl`
- artefactos staged bajo `raw/`

## 5. Evidencia y rutas relevantes

- `docs/ai/evolution/runs/iteration-017-ahe-cycle/raw/session-sources.summary.json`
- `docs/ai/evolution/runs/iteration-017-ahe-cycle/raw/cursor.json`
- `docs/ai/evolution/runs/iteration-017-ahe-cycle/raw/execution-trees.jsonl`
- `docs/ai/evolution/runs/iteration-017-ahe-cycle/raw/normalized-sessions.jsonl`
- `commands/evolve.md`
- `docs/ai/harness/commands.md`
- `docs/ai/harness/checks.md`
- `docs/ai/evolution/rejected_mechanisms.jsonl`

## 6. Regresiones observadas

1. **Riesgo real de sidecar overreach en `/feature`.**
   - Evidencia directa en `normalized-sessions.jsonl:101-109`.
   - Impacto: contradice la regla de sidecars opcionales y puede inflar coste/contexto del flujo normal.

2. **Suite de tests del checker no fiable como smoke verde.**
   - Evidencia: `node --test scripts/check-harness.test.mjs` cancelado por promesa pendiente.
   - Impacto: reduce confianza en la red de seguridad automática del checker.

## 7. Limitaciones

- El working tree observado durante la evaluación ya no coincide con el intake declarado: `rtk git status --short --branch` mostró `* master`, `M agents/lead.md` y `?? docs/ai/evolution/runs/iteration-017-ahe-cycle/`. No atribuyo ese diff al objetivo evaluado salvo este artefacto `evaluation.md`.
- El replay live nuevo con `opencode run` no produjo un primer handoff verificable dentro del timeout; por honestidad queda como `not_run`.
- No se inspeccionaron directorios externos directamente; se usó el staging existente en `raw/`.

## 8. Handoff para debugger/reviewer

### Para `debugger`

- Prioridad 1: atribuir por qué el corpus aún contiene un `/feature` con sidecars obligatorios (`ses_21cb97bcdffeE10ri056Aeafpz`).
- Prioridad 2: atribuir la causa del fallo/hang de `scripts/check-harness.test.mjs`.
- Falsificación mínima sugerida:
  - encontrar evidencia de que `ses_21cb97...` es un test artificial ya mitigado por reglas posteriores y no representa comportamiento actual; o
  - demostrar con replay estable que el routing actual ya no reproduce ese patrón.

### Para `reviewer`

- No revisar cambios de harness todavía.
- Revisar después cualquier propuesta de cambio contra estos dos focos y contra `rejected_mechanisms.jsonl` para evitar introducir sidecars obligatorios por accidente.

## 9. Recomendación de continuidad

**Proceed:** sí, hay evidencia suficiente para pasar a `debugger`.

Motivo:

- hay un fallo observable de routing/proceso en corpus aceptado;
- hay un fallo observable en validación automática local;
- el contrato actual de `/evolve` y el staging de `execution trees` están suficientemente documentados y verificables para soportar atribución.

## 10. Session sources

### Por fuente

- `local-opencode-db`
  - discovered: `375`
  - accepted: `375`
  - skipped: `0`
  - skip_reasons: `{}`

- `external-opencode-raw`
  - discovered: `406`
  - accepted: `164`
  - skipped: `242`
  - skip_reasons: `{ "empty_array": 242 }`

## 11. Execution trees

- trees evaluadas: `129` staged
- cursor start: `null`
- cursor end: `time_updated_max=1780128847905`, `root_session_id=ses_1880e3155ffeS87I6VQB6W9YHZ`
- roots nuevas o actualizadas revisadas en detalle: `4`
  - `ses_1883bebdbffeDVUV69GzTZVo9H`
  - `ses_1880e3155ffeS87I6VQB6W9YHZ`
  - `ses_21cb97bcdffeE10ri056Aeafpz`
  - `ses_21ba737f5ffeKn3KgWOiw704wo`

---

# Addendum post-apply — 2026-05-30

Este bloque reevalúa la misma iteración **después** de aplicar los cambios
documentales aprobados. No sustituye la evidencia pre-apply; la complementa.

## 12. Objetivo evaluado

Verificar si los cambios aplicados en:

- `commands/evolve.md`
- `docs/ai/harness/commands.md`
- `docs/ai/harness/checks.md`
- `docs/ai/evolution/README.md`

respaldan a nivel de evidencia las predicted fixes del manifest para:

1. clasificación consistente de evidencia natural vs sintética/coercitiva;
2. distinción consistente entre smoke rápido y suite larga del checker;
3. límites de lo aún no verificable sin corpus/replay futuro.

## 13. Escenarios ejecutados

| ID | Escenario | Tipo | Resultado |
| --- | --- | --- | --- |
| PA1 | Consistencia documental: natural vs sintético/coercitivo | static_contract | pass |
| PA2 | Consistencia documental: smoke rápido vs suite larga con presupuesto explícito | static_contract | pass |
| PA3 | Validación local del checker en estado post-apply sin `change_evaluation.json` | live_smoke | pass |
| PA4 | Confirmación conductual con corpus/replay futuro | transcript_replay | not_run |

## 14. Resultados post-apply por escenario

### PA1 — Consistencia documental: natural vs sintético/coercitivo

**Resultado:** pass

**Comandos/pasos usados:**

- lectura de `commands/evolve.md`
- lectura de `docs/ai/harness/commands.md`
- lectura de `docs/ai/evolution/README.md`
- búsqueda textual por `sintético|coercitivo|segunda prueba|sidecar-overreach`

**Evidencia:**

- `commands/evolve.md:117-125`
  - clasifica prompts coercitivos como tests sintéticos/coercitivos de routing;
  - exige una segunda prueba antes de afirmar sidecar-overreach;
  - preserva la legalidad de requests donde el usuario sí pide sidecars.
- `docs/ai/harness/commands.md:206-214`
  - replica la misma regla dentro del contrato general de `/evolve`.
- `docs/ai/evolution/README.md:69-79`
  - fija la misma higiene mínima de evidencia a nivel de guía AHE.

**Conclusión observable:** la clasificación synthetic-vs-natural quedó documentada
de forma consistente en las tres superficies objetivo del cambio `chg-17-1`.

### PA2 — Consistencia documental: smoke rápido vs suite larga con presupuesto explícito

**Resultado:** pass

**Comandos/pasos usados:**

- lectura de `commands/evolve.md`
- lectura de `docs/ai/harness/commands.md`
- lectura de `docs/ai/harness/checks.md`
- lectura de `docs/ai/evolution/README.md`
- búsqueda textual por `smoke rápido|suite larga|presupuesto|runtime observado|timeout`

**Evidencia:**

- `commands/evolve.md:31-39`
  - distingue smoke local vs suite larga y exige presupuesto temporal explícito.
- `docs/ai/harness/commands.md:181-188`
  - replica la misma expectativa para AHE.
- `docs/ai/harness/checks.md:11-24,79-83`
  - define el smoke barato, la suite larga y la regla operativa de registrar presupuesto/runtime.
- `docs/ai/evolution/README.md:188-196`
  - documenta el mismo split en el criterio de listo.

**Conclusión observable:** la distinción smoke-vs-full-checker-budget quedó
documentada de forma consistente en las cuatro superficies objetivo del cambio
`chg-17-2`.

### PA3 — Validación local del checker en estado post-apply sin `change_evaluation.json`

**Resultado:** pass

**Comandos usados:**

```bash
rtk git status --short --branch
node scripts/check-harness.mjs
node --test scripts/check-harness.test.mjs
```

**Evidencia:**

- `rtk git status --short --branch`
  - working tree con cambios locales y `?? docs/ai/evolution/runs/iteration-017-ahe-cycle/`.
- `node scripts/check-harness.mjs`
  - falla con: `docs/ai/evolution/runs/iteration-017-ahe-cycle: manifest exists without change_evaluation.json`.
- `node --test scripts/check-harness.test.mjs`
  - `pass 13`, `fail 1`, `duration_ms 83166.062`;
  - el único fallo replica exactamente el mismo gating de lifecycle:
    `manifest exists without change_evaluation.json`.

**Conclusión observable:** en el estado actual del repo, ambos checks quedan en
rojo por la dependencia de lifecycle ya esperada cuando existe manifest sin
`change_evaluation.json`. Esta evidencia **no contradice** las predicted fixes
aplicadas; tampoco demuestra por sí sola una regresión nueva del harness.

### PA4 — Confirmación conductual con corpus/replay futuro

**Resultado:** not_run

**Motivo:** la petición pidió evaluar las surfaces documentales aplicadas y no
crear `change_evaluation.json`. La confirmación fuerte de comportamiento exigiría
una nueva medición sobre corpus/replay posterior a estas reglas, no solo
inspección estática.

**Qué queda pendiente verificar:**

- que el evaluator futuro deje de tratar un árbol coercitivo como baseline natural sin segunda prueba;
- que el clasificador no sea tan amplio que capture requests legítimas donde el usuario sí pide sidecars;
- que una nueva corrida AHE con `change_evaluation.json` ya presente devuelva el checker al estado esperado para ese lifecycle;
- que el budget documentado siga siendo suficiente cuando el repo crezca.

## 15. Evaluación de predicted fixes del manifest

### `chg-17-1`

- `feature-sidecar-false-positive`: **supported (documentation evidence)**
- `synthetic-routing-test-misclassified-as-natural-feature`: **supported (documentation evidence)**

Motivo observable:

- las superficies cambiadas ahora alinean la regla de clasificación;
- la claim de sidecar-overreach requiere segunda prueba independiente;
- se preserva la legalidad de requests explícitas del usuario.

Límite:

- aún no está verificado con nueva medición de corpus natural o replay estable.

### `chg-17-2`

- `checker-suite-timeout-misclassification`: **supported (documentation evidence)**
- `ahe-validation-budget-underreported`: **supported (documentation evidence)**

Motivo observable:

- las superficies cambiadas distinguen explícitamente smoke rápido vs suite larga;
- exigen presupuesto temporal superior al default y registro de runtime observado;
- la rerun actual del suite ya no falla por timeout sino por lifecycle gating conocido.

Límite:

- aún no está verificado que futuros evaluators reporten siempre esa diferencia correctamente;
- tampoco queda falsado aquí el risk task de hidden async leak, aunque la evidencia actual no lo reactiva.

## 16. Regresiones observadas post-apply

- No vi regresiones nuevas en las superficies objetivo evaluadas.
- Persiste una dependencia de lifecycle: con manifest presente, el checker exige
  `change_evaluation.json`. Dado el contexto de esta tarea, se trata como
  limitación/estado esperado y no como regresión automática del cambio aplicado.

## 17. Limitaciones post-apply

- Esta reevaluación se centró en inspección estática y checks locales mínimos.
- No se creó `change_evaluation.json` por restricción explícita de la tarea.
- No se hizo replay nuevo ni nueva curación de corpus natural; por tanto la
  confirmación fuerte de comportamiento queda diferida.
- El working tree no está limpio y contiene cambios fuera de las cuatro
  superficies objetivo; no los atribuyo a esta evaluación salvo el propio
  `evaluation.md`.

## 18. Handoff para debugger/reviewer

### Para `debugger`

- Si hace falta confirmación fuerte, la siguiente pieza útil es una medición con
  corpus/replay posterior que pruebe que la regla de segunda evidencia se aplica
  de verdad y no solo está escrita.

### Para `reviewer`

- A nivel de evidencia documental, las predicted fixes del manifest quedan
  soportadas.
- Lo todavía no verificado pertenece a risk tasks de comportamiento futuro, no a
  inconsistencia textual de las surfaces cambiadas.
