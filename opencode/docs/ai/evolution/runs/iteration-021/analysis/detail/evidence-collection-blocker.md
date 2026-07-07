# Deep dive: evidence-collection-blocker

## Problema

`collect-session-evidence.mjs` no completa en tiempo razonable cuando la DB local de OpenCode supera ~1GB.

## Evidencia medible

| Métrica | Valor |
|---|---|
| DB size | 1153.2 MB |
| Sessions | 695 |
| Messages | 13,342 |
| Parts | 60,684 |
| Message data total | ~47 MB |
| Part data total | ~156 MB |
| Session query time | <1s |
| Message query time (sqlite3 -json) | **7m 21s** |
| Part query time (sqlite3 -json) | **2m 10s** |
| Total query wall time | **~10 min** |
| Message JSON output size | 31 MB |
| Part JSON output size | 177 MB |
| Combined output | ~208 MB |
| Script maxBuffer | 256 MB |

## Cadena de causalidad

```
1. DB crece por uso acumulado (695 sesiones, 60K parts)
       ↓
2. Queries cargan columnas completas (incluyendo `data` blobs)
       ↓
3. sqlite3 -json serializa CADA fila con escape de Unicode/JSON
   → 13K messages × avg 3.7KB = 47MB de datos raw
   → serializado a JSON escaped = ~31MB stdout
   → pero la serialización CPU-bound toma 7m21s
       ↓
4. spawnSync acumula toda stdout en buffer (no streaming)
       ↓
5. Node.js parsea 208MB de JSON en un solo JSON.parse
       ↓
6. Script intenta construir Maps de 60K+ entradas en memoria
       ↓
7. Timeout o OOM antes de completar
```

## Root cause: ¿DB size, SQL queries, o processing logic?

### No es solo DB size

La DB de 1.1GB contiene datos de texto (`data` column) que son inherentemente grandes. Pero el tamaño del archivo no es el bottleneck directo: SQLite con WAL permite lectura concurrente sin locks, y el OS puede hacer mmap del archivo.

### El bottleneck principal es la serialización sqlite3 → JSON

sqlite3 CLI con `-json` flag serializa cada fila completa a JSON. Para la tabla `message`:

- 13,342 filas
- Cada fila incluye `id`, `session_id`, `time_created`, `time_updated`, `data`
- El campo `data` es un string JSON que contiene el contenido completo del mensaje
- sqlite3 debe: leer cada BLOB → detectar encoding → escape special chars → serializar a JSON format

Esto es CPU-bound, no I/O-bound. La evidencia: `time` reporta 96% CPU usage.

### El processing logic amplifica el problema

El script:
1. Usa `spawnSync` → bloquea todo, sin streaming
2. Acumula toda stdout en buffer → 208MB en heap
3. `JSON.parse` de 208MB → malloc + parse O(n²) para strings escaped
4. Construye `Map<message_id, Part[]>` con 60K entradas
5. Itera sobre 695 sessions, para cada una busca mensajes y partes
6. Para cada session, extrae `firstTextPart()` parseando cada part data

## Fix candidatos (por impacto estimado)

### Alta prioridad: Filtrado SQL por iteración

El cursor incremental ya existe (`cursor.json` con `tree_time_updated_max`). Pero el collector no lo usa como filtro SQL:

```sql
-- Actual: carga TODO
SELECT ... FROM message ORDER BY session_id, time_created, id;

-- Propuesto: filtrar por cutoff
SELECT ... FROM message 
WHERE time_created > :previous_cutoff
ORDER BY session_id, time_created, id;
```

**Impacto estimado:** Si el cutoff recorta 90% de las sesiones antiguas, la query baja de 7m21s a ~45s.

### Alta prioridad: Streaming en vez de spawnSync

```js
// Actual
const result = spawnSync("sqlite3", ["-json", dbPath, sql], { maxBuffer });

// Propuesto
const proc = spawn("sqlite3", ["-json", dbPath, sql]);
proc.stdout.on("data", (chunk) => { /* process chunk */ });
```

**Impacto estimado:** Elimina el buffer de 208MB y permite procesamiento incremental.

### Media prioridad: Selección mínima de columnas

La query de `message` trae `data` completo (avg 3.7KB) pero el script solo necesita el `role` del JSON:

```sql
-- Propuesto: extraer solo el role
SELECT id, session_id, time_created, time_updated,
       json_extract(data, '$.role') as role
FROM message ORDER BY session_id, time_created, id;
```

**Impacto estimado:** Reduce el output de 31MB a ~200KB, query de 7m21s a <5s.

### Baja prioridad: mmap_size

```sql
PRAGMA mmap_size = 268435456;  -- 256MB
```

Reduce overhead de I/O page cache para DBs grandes. Impacto marginal (~10-20% mejora).

## Riesgos del fix

1. **Filtrado por cutoff puede perder sesiones** que se actualizaron después del último cursor pero antes de la ejecución actual. Mitigar con margen temporal.
2. **Selección mínima de columnas** reduce la utilidad de `normalized-sessions.jsonl` como herramienta de diagnóstico. Mantener modo `--full-rescan` con columnas completas.
3. **Streaming** añade complejidad al manejo de errores y al parsing de JSON parcial.

## Conclusión

El blocker es **medible y reproducible**: 10 minutos de query time + 208MB de buffer para una DB de 1.1GB. No es un bug lógico sino un problema de escala operacional. El fix más efectivo es filtrado SQL por cutoff (reduce 10x) combinado con streaming (elimina buffer completo).
