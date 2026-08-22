---
title: "Proyección runtime de misión"
status: proposed
date: 2026-08-21
feature: mission-runtime
---

# Runtime de misión

## Autoridad

`scripts/loop-state.mjs` es la única autoridad de ejecución. El snapshot
`.opencode/loops/<slug>.json` y su historial append-only
`.opencode/loops/<slug>.history.jsonl` se leen y validan; la proyección nunca
los modifica ni mantiene un segundo estado durable.

## Proyección read-only

`mission-status.mjs` expone `slug`, `status`, `current_iteration`,
`planned_iterations`, `last_completed_step`, `blocking_cause`, `session_id`,
`updated_at` y `next_action`. `session_id` usa el lease activo cuando existe y
el último session id canónico en caso contrario. `updated_at` procede del último
evento validado del historial.

Los estados canónicos son `approved`, `running`, `paused`, `blocked` y
`completed`. La proyección no inventa transiciones: si el snapshot está
desfasado o el historial está corrupto, devuelve el error durable de
`loop-state`.

## Observación de eventos

El observador opcional usa únicamente eventos que el SDK local expone:
`session.created`, `session.status`, `tool.execute.before`,
`tool.execute.after`, `session.compacted`, `session.error` y `session.idle`.
La actividad derivada (`running`, `idle` o `blocked`) es efímera y nunca
sustituye al `status` canónico.

Las sesiones con `parentID` distinto de la sesión raíz se ignoran. Los eventos
duplicados se descartan por una clave efímera de sesión, tipo y payload; perder
esa deduplicación al reiniciar no altera el snapshot ni el historial.

La compaction conserva el session id. Un error de notificación no bloquea el
loop ni se convierte en una transición durable. Las transiciones reales siguen
requiriendo `loop-state.mjs` y sus locks, hashes, `action_id` y presupuesto.
