# Justificación del manifest — iteration-021

Fecha: 2026-07-06
Estado: listo para developer

## Resumen de cambios

### chg-1: Optimización del collector (tool)

**Problema:** `collect-session-evidence.mjs` no completa en tiempo razonable con DBs >1GB. La query de messages tarda 7m21s y produce 31MB de JSON serializado; la query de parts tarda 2m10s y produce 177MB. El script usa `spawnSync` que bloquea el event loop y acumula 208MB en buffer.

**Root cause:** El collector carga datos completos de todas las tablas sin filtrado por iteración, sin streaming, y sin selección de columnas mínimas. El bottleneck es CPU-bound (serialización sqlite3 → JSON), no I/O.

**Fix propuesto:**
1. **Filtrado SQL por cutoff:** Usar el cursor previo (`tree_time_updated_max`) como filtro `WHERE time_created > :cutoff` en las queries SQL. Impacto estimado: si el cutoff recorta 90% de sesiones antiguas, la query baja de 7m21s a ~45s.
2. **Streaming con spawn:** Reemplazar `spawnSync` por `spawn` con `stdout.on('data')` para procesar chunks incrementalmente. Elimina el buffer de 208MB.
3. **Selección mínima de columnas:** La query de messages puede extraer solo `role` del JSON (`json_extract(data, '$.role')`) en vez de traer `data` completo. Reduce output de 31MB a ~200KB.

**Por qué a nivel tool:** El root cause es un problema de implementación del script, no de contrato ni de flujo. El fix a nivel tool resuelve el cuello de botella sin cambiar la interfaz de salida ni los flujos de orquestación.

### chg-2: Alineación de esquema collector↔auditor (tool)

**Problema:** `preflight-audit.mjs` busca campos `agent`, `agentName`, `type`, `command`, `commandName` en los JSONL staged. Pero el collector produce árboles con campos `root_agent`, `participating_agents`. Resultado: aunque el collector produzca evidencia, el auditor no la encuentra.

**Root cause:** El contrato entre collector y auditor no está formalizado. Cada uno evolucionó independientemente con esquemas diferentes.

**Fix propuesto:** Añadir `root_agent` y `participating_agents` como campos de evidencia válidos en `EVIDENCE_FIELDS` del auditor, y modificar `hasStructuredEvidence` para detectar arrays (participating_agents).

**Por qué a nivel tool:** El auditor es un tool que consume evidencia. El fix a nivel tool (añadir campos de mapeo) cierra el gap sin cambiar la interfaz del collector ni los flujos de orquestación. Es el fix de menor riesgo y mayor impacto inmediato.

## Predicciones

1. **chg-1** debería reducir el tiempo de ejecución del collector de ~10min a <1min en la DB actual.
2. **chg-2** debería elevar la cobertura de runtime evidence de 0% a ~30-50% una vez que el collector funcione.
3. Ambos fixes juntos deberían permitir que el ciclo AHE (evaluator → debugger → evolver) tenga evidencia real para atribuir cambios.

## Riesgos

1. **Filtrado por cutoff** puede perder sesiones que se actualizaron después del último cursor. Mitigar con margen temporal.
2. **Selección mínima de columnas** reduce la utilidad de `normalized-sessions.jsonl` como herramienta de diagnóstico. Mantener modo `--full-rescan` con columnas completas.
3. **Streaming** añade complejidad al manejo de errores y al parsing de JSON parcial.

## Criterios de evaluación para la próxima iteración

1. Ejecutar `node scripts/collect-session-evidence.mjs --iteration iteration-021` y verificar que completa en <2min.
2. Verificar que `execution-trees.jsonl` se genera con el esquema esperado.
3. Ejecutar `node scripts/preflight-audit.mjs --iteration iteration-021` y verificar que la cobertura de runtime evidence es >0%.
4. Verificar que no hay falsos positivos en la detección de agentes/commands.
