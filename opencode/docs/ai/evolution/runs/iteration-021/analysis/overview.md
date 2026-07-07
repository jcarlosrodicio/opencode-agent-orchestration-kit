# Debugger Overview — iteration-021

## 1. Evidencia analizada

- `preflight-audit.json` (iteration-021)
- `scripts/collect-session-evidence.mjs` (fuente completa)
- `scripts/preflight-audit.mjs` (fuente completa)
- `scripts/check-harness.mjs` (fuente completa)
- `docs/ai/harness/evidence.md`
- `docs/ai/evolution/session-sources.md`
- Confirmaciones locales:
  - `ls -lh ~/.local/share/opencode/opencode.db` → 1153.2MB
  - `sqlite3 ... "SELECT COUNT(*) FROM session/message/part"` → 695 / 13342 / 60684
  - `time sqlite3 -json ...` para cada query (sessions: <1s, messages: 7m21s, parts: 2m10s)
  - `PRAGMA journal_mode` → WAL
  - `PRAGMA mmap_size` → 0

### Separación por fuente

- El preflight audit es 100% estático: lee archivos del repo y JSONL staged.
- Los datos del DB son mediciones directas del runtime de sqlite3 en el entorno local.
- No hubo ejecución exitosa de `collect-session-evidence.mjs` en esta iteración; los datos de timing provienen de queries sqlite3 independientes.

## 2. Estado

**Listo para spec.**

El blocker principal es medible y reproducible: la query de `message` tarda 7m21s y produce 31MB de JSON serializado; la query de `part` tarda 2m10s y produce 177MB. El script usa `spawnSync` que bloquea el event loop de Node.js y acumula toda la salida en buffer. El total supera los 200MB de datos serializados que deben parsearse en memoria.

Pero hay un problema más profundo: incluso si la recolección funcionara, el `preflight-audit.mjs` no encontraría evidencia de agentes/commands porque busca campos `agent`, `agentName`, `type`, `command`, `commandName` en los JSONL, y el collector produce un esquema diferente (`root_agent`, `participating_agents`).

## 3. Patrones de fallo

1. **Cuello de botella de serialización SQLite3 → JSON**.
   Detalle: `analysis/detail/evidence-collection-blocker.md`
2. **Gap estructural entre collector y auditor**.
   Detalle: `analysis/detail/contract-vs-runtime-gap.md`

## 4. Root causes

### Patrón 1: Serialización SQLite3
- **Hecho:** La query `SELECT ... FROM message` con la columna `data` (avg 3.7KB, max 2.1MB por fila, 47MB total) produce 13,342 filas serializadas a JSON por sqlite3.
- **Hecho:** sqlite3 `-json` serializa cada fila completa incluyendo el campo `data` como string JSON escaped. El costo no es I/O (WAL permite lectura concurrente) sino la serialización CPU-bound de 200MB+ de datos con escape de Unicode.
- **Hecho:** `spawnSync` en Node.js no tiene streaming: acumula toda la stdout en un buffer antes de devolver.
- **Inferencia:** El timeout de 120s del harness no es suficiente para esta carga. Incluso con timeout ampliado (5min), la query de messages tarda 7m21s.
- **Root cause:** El collector carga los datos completos de todas las tablas en memoria sin filtrado por iteración, sin streaming, y sin selección de columnas mínimas.

### Patrón 2: Gap entre collector y auditor
- **Hecho:** `preflight-audit.mjs` parsea `execution-trees.jsonl` y busca campos `agent`, `agentName`, `type`, `command`, `commandName` en cada registro.
- **Hecho:** `collect-session-evidence.mjs` produce árboles con campos `root_agent`, `participating_agents`, `root_title` — ningún campo `agent` a nivel de raíz del árbol.
- **Hecho:** `normalized-sessions.jsonl` sí tiene campo `agent`, pero el auditor lo parsea como evidencia secundaria (solo si `execution-trees.jsonl` no tiene match).
- **Inferencia:** Incluso con evidencia staged, el auditor no encontraría agentes porque el esquema del collector no alinea con las expectativas del auditor.
- **Root cause:** El contrato entre collector y auditor no está formalizado. Cada uno evolucionó independientemente.

## 5. Fixes candidatos por nivel de componente

### Tool (collect-session-evidence.mjs)
- **Streaming o chunked processing**: Reemplazar `spawnSync` por `spawn` con `stdout.on('data')` para procesar chunks.
- **Filtrado por iteración**: Añadir filtro `WHERE time_updated > :cutoff` usando el cursor previo en la query SQL, no post-filtro en JS.
- **Selección mínima de columnas**: La query de `message` puede excluir `data` si solo se necesita `role` (extraído del JSON). La query de `part` puede traer solo `data` para la primera parte de texto, no todas.
- **mmap_size**: Activar `PRAGMA mmap_size = 268435456` (256MB) para reducir overhead de I/O en DBs grandes.

### Tool (preflight-audit.mjs)
- **Normalización de esquema**: Añadir campos `agent` y `command` como alias en la búsqueda de evidencia, o mapear los campos del collector (`root_agent`, `participating_agents`) a los campos esperados por el auditor.
- **Fallback a raw data**: Si los JSONL no tienen los campos esperados, hacer substring match sobre el contenido como fallback documentado.

### Workflow
- **Formalizar el contrato de esquema** entre collector y auditor en `docs/ai/evolution/session-sources.md` o en un schema JSON dedicado.

## 6. Riesgos y regresiones

- Si se añade filtrado SQL por iteración, el cursor incremental puede perder sesiones que se actualizaron después del último cutoff pero antes de la ejecución actual. Mitigar con `time_updated >= :previous_cursor_time - margin`.
- Si se reduce la selección de columnas, se pierde diagnóstico detallado en `normalized-sessions.jsonl`. Mantener el modo completo como opt-in.
- El fix del auditor para el gap de esquema puede generar falsos positivos si se usa substring match sobre campos no estructurados.

## 7. Atribución de cambios previos

### Iteration 020 (loop-engineering-command)
- **Atribución:** `keep`
- **Motivo:** El `/loop` se documentó correctamente y pasó check-harness. No afecta la recolección de evidencia ni el gap collector/auditor.

### Iteration 017 (AHE cycle)
- **Atribución:** `keep`
- **Motivo:** Los patrones identificados (sidecar false positive, checker time budget) siguen vigentes y son compatibles con los hallazgos de esta iteración. El problema de esta iteración es anterior al checker: es el collector el que no llega a producir evidencia.

### Estado del evaluation.md
- **Nota:** `evaluation.md` no existía al momento del preflight audit. Fue creado como parte de esta iteración. El check-harness lo requiere para cada run con archivos.

## 8. Limitaciones

- No inspeccioné el diff de implementación de iteraciones previas; solo contratos y manifest.
- No ejecuté `collect-session-evidence.mjs` con timeout ampliado porque el root cause es reproducible con queries sqlite3 independientes.
- No tengo acceso a trazas de ejecuciones previas del collector que hubieran fallado con timeout.

## 9. Handoff para specifier / evolver / reviewer

### Para `specifier`
- Tratar el problema del collector como **tool optimization**, no como bug de lógica. La funcionalidad es correcta; el rendimiento no escala.
- Tratar el gap collector/auditor como **contract alignment**: definir un esquema shared para campos de evidencia de agentes/commands.
- Priorizar: (1) fix del collector para que produzca evidencia, (2) fix del auditor para que la encuentre.

### Para `evolver`
- No pivotes sobre "harness runtime-blind" como si fuera un problema de diseño. Es un problema de operación: la DB creció más allá de lo que el script actual puede manejar.
- Si se propone cambio, que sea por nivel de componente: tool primero, contract después.

### Para `reviewer`
- Verificar que cualquier fix del collector incluya:
  - Benchmark con la DB actual (1.1GB, 60K parts).
  - Timeout explícito documentado.
  - Modo degraded para DBs que excedan el budget.
- Verificar que el gap de esquema se cierre sin romper la semántica de los campos existentes.
