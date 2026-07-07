# Iteration 017 AHE debugger overview

## 1. Evidencia analizada

- `evaluation.md`
- `raw/execution-trees.jsonl`
- `raw/normalized-sessions.jsonl`
- `raw/session-sources.summary.json`
- `raw/cursor.json`
- `commands/feature.md`
- `scripts/check-harness.test.mjs`
- `scripts/check-harness.mjs`
- `docs/ai/evolution/rejected_mechanisms.jsonl`
- `docs/ai/evolution/runs/iteration-016-contract-prompt-alignment/change_manifest.json`
- confirmaciones locales mínimas:
  - `node --test --test-name-pattern "harness accepts prose evidence that mentions markdown filenames" scripts/check-harness.test.mjs`
  - `node --test scripts/check-harness.test.mjs`
  - `rtk git status --short --branch`

### Separación por fuente

- Patrón 1 usa evidencia staged de `local-opencode-db`.
- Patrón 2 usa evidencia live local + lectura de código.
- No vi cambio de interpretación entre `local-opencode-db` y `external-opencode-raw`.

## 2. Estado

**Listo para spec.**

Hay root causes suficientemente acotadas para ajustar benchmark/validación, pero la evidencia actual **no confirma** una regresión real de `/feature` hacia sidecars obligatorios en uso normal.

## 3. Patrones de fallo

1. **Falso positivo de sidecar overreach en corpus `/feature`.**  
   Detalle: `analysis/detail/pattern-1-feature-sidecar-false-positive.md`
2. **Smoke de `check-harness.test.mjs` clasificado como fallo funcional cuando el problema observable es presupuesto de tiempo.**  
   Detalle: `analysis/detail/pattern-2-checker-time-budget.md`

## 4. Root causes

### Patrón 1
- **Hecho:** el árbol `ses_21cb97bcdffeE10ri056Aeafpz` sí invocó `designer, researcher, specifier, developer, reviewer, evaluator, debugger, evolver`.
- **Hecho:** el prompt raíz ordenó explícitamente: `Habla con cada agente y dile que responda exactamente cada uno OK`.
- **Inferencia:** S3 mezcló una sesión de test coercitivo con el corpus de features normales.
- **Root cause:** problema de selección/clasificación de evidencia en el workflow de evaluación, no routing confirmado de `/feature`.

### Patrón 2
- **Hecho:** el evaluator marcó fail tras timeout 120s con mensaje `Promise resolution is still pending...`.
- **Hecho:** una rerun local con timeout amplio pasó `14/14` en `112959ms`.
- **Hecho:** cada test crea un fixture copiando todo el repo con `fs.cpSync(root, tmp, ...)`; el workspace actual tiene ~19.9k ficheros y ~260 MB.
- **Inferencia:** el mensaje final proviene de cancelación cerca del timeout, no de una regresión funcional ya reproducida.
- **Root cause:** budget de validación demasiado ajustado para una suite cuyo coste depende de copiar el repo completo en cada test.

## 5. Fixes candidatos por nivel de componente

### Workflow
- Separar corpus de **features naturales** vs **flow tests coercitivos** antes de usar árboles históricos como benchmark negativo.
- Exigir prompt classification o replay de confirmación antes de declarar “sidecar overreach”.

### Tool / workflow
- Tratar `scripts/check-harness.test.mjs` como validación larga o dividir smoke corto vs suite completa.
- Medir/registrar presupuesto temporal explícito cuando el repo staged crece.

## 6. Riesgos y regresiones

- Si se filtra demasiado agresivamente el corpus, puede ocultarse una fuga real de sidecars en `/feature`.
- Si solo se sube el timeout sin controlar coste, la suite seguirá siendo frágil al crecimiento del repo.
- El árbol de `/feature` sospechoso es de `version 1.14.30`; el harness evaluado hoy usa `1.15.12`, así que extrapolar conducta actual desde ese árbol sin replay añade riesgo de atribución incorrecta.

## 7. Atribución de cambios previos

### Iteration 016 manifest (`chg-16-1`, `chg-16-2`, `chg-16-3`)
- **Atribución:** `improve`
- **Motivo:** las coberturas funcionales del checker parecen vigentes: `node scripts/check-harness.mjs` pasa y la suite completa también pasa con tiempo suficiente. Pero el manifest previo no capturó el riesgo operacional de duración del test suite, que ahora degrada su utilidad como smoke rápido.

### Rejected mechanism `mech-sidecars-for-every-feature`
- **Atribución:** `keep`
- **Motivo:** la evidencia S3 no lo desmiente; el propio prompt pidió hablar con cada agente, incluidos sidecars.

## 8. Limitaciones

- No inspeccioné diff de implementación histórica; solo manifest previo y artefactos staged.
- El working tree ya no está limpio: `M agents/evaluator.md`, `M agents/lead.md`, `?? docs/ai/evolution/runs/iteration-017-ahe-cycle/`.
- No hubo replay estable nuevo de `/feature`; por tanto no afirmo comportamiento actual sin esa comprobación.

## 9. Handoff para specifier / evolver / reviewer

### Para `specifier`
- Tratar el problema de S3 como **benchmark hygiene / evidence classification**, no como bug confirmado de `/feature`.
- Tratar S6 como **runtime-budget regression** del sistema de validación.

### Para `evolver`
- No pivotes sobre sidecars obligatorios en `/feature` basándote solo en `ses_21cb97...`.
- Si se propone cambio, que sea uno por patrón: 1) selección de corpus/replay gates, 2) presupuesto/estrategia de validación del checker.

### Para `reviewer`
- Verificar que cualquier propuesta futura incluya falsación explícita:
  - replay o corpus natural para `/feature`;
  - rerun con budget suficiente para distinguir timeout de fallo real.
