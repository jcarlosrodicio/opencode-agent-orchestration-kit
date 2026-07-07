# Deep dive: contract-vs-runtime-gap

## Problema

El preflight audit reporta 31 drifts, todos de tipo `missing_evidence`, y un `runtime_evidence_coverage` de 0%. ¿Es esto un problema real o un estado esperado para un harness documentation-first?

## Evidencia analizada

1. `preflight-audit.json` → 31 drifts, 0% runtime evidence
2. `preflight-audit.mjs` → lógica de detección de evidencia (líneas 96-110, 155-240)
3. `collect-session-evidence.mjs` → esquema de salida (campos por árbol y sesión)
4. `docs/ai/evolution/session-sources.md` → contrato documentado
5. Datos de timing del collector (ver blocker analysis)

## Hallazgo 1: El gap es 100% predecible

El `preflight-audit.mjs` busca evidencia de agentes/commands en JSONL staged usando:

```js
const EVIDENCE_FIELDS = ["agent", "agentName", "type", "command", "commandName"];
```

Pero el collector produce árboles con este esquema:

```json
{
  "execution_tree_id": "...",
  "root_session_id": "...",
  "root_agent": "lead",          // ← campo diferente
  "participating_agents": [...],  // ← array, no string
  "root_title": "...",
  "representative_user_prompt": "...",
  ...
}
```

**No hay campo `agent` a nivel de raíz del árbol.** El campo `root_agent` contiene el agente de la sesión raíz, y `participating_agents` es un array de todos los agentes que participaron.

El auditor también parsea `normalized-sessions.jsonl`, que sí tiene campo `agent`. Pero el flujo del auditor es:

```js
const hasRuntimeEvidence =
  hasStructuredEvidence(treesRecords, agent) ||
  hasStructuredEvidence(sessionsRecords, agent);
```

Si `treesRecords` no tiene el campo `agent`, intenta `sessionsRecords`. Pero `sessionsRecords` proviene de `normalized-sessions.jsonl`, que solo se genera si el collector ejecuta exitosamente.

**Resultado:** Sin evidencia staged → 0% coverage. Con evidencia staged → el auditor no encontraría agentes de todas formas por el mismatch de esquema.

## Hallazgo 2: Los 31 drifts son correctos pero no informativos

Los 31 drifts dicen: "Agent X is documented but has no runtime evidence in staged artifacts."

Esto es **correcto literalmente**: no hay evidencia staged. Pero no es **informativo** porque:

1. No distingue entre "nunca se usó" (e.g., `review_api` es nuevo) y "se usó pero no se capturó".
2. No distingue entre "el collector falló" y "el harness no produce evidencia de este tipo".
3. El `severity: "medium"` para todos los agentes y `severity: "low"` para todos los comandos no refleja prioridad real.

## Hallazgo 3: El gap no es un problema de diseño, es de infraestructura

La pregunta clave: **¿Es 0% runtime evidence un problema?**

### Argumento a favor de "sí es problema"
- Sin evidencia runtime, no se puede verificar que los agentes/commands documentados realmente se usan.
- El harness puede documentar flujos que nadie ejecuta.
- La brecha contract↔runtime puede crecer silenciosamente.

### Argumento a favor de "no es problema (esperado)"
- El harness es documentation-first por diseño (`docs/ai/harness/`).
- Los contratos se verifican por `check-harness.mjs` (static_contract), no por evidencia runtime.
- La evidencia runtime es opcional para la mayoría de flujos (ver `evidence.md`: "Cambio documental: `static_contract`").
- Solo se necesita evidencia runtime para cambios de routing/orquestación.

### Conclusión intermedia
**0% runtime evidence es un problema solo si el harness pretende validar routing.** Para validación de contratos documentales, `static_contract` basta. Pero para la rama AHE (evaluator → debugger → evolver), la evidencia de sesiones es el insumo principal. Sin ella, el ciclo AHE no puede atribuir cambios a evidencia real.

## Hallazgo 4: El gap de esquema es un bug de contrato no formalizado

No existe un schema JSON que defina la interfaz entre:
- `collect-session-evidence.mjs` (productor)
- `preflight-audit.mjs` (consumidor)
- `docs/ai/evolution/session-sources.md` (contrato documentado)

Cada componente evolucionó independientemente:
- El collector añadió `root_agent`, `participating_agents` para diagnóstico de árboles.
- El auditor busca `agent`, `agentName` para matching directo.
- El contrato documentado menciona campos pero no define el esquema exacto.

## Fix candidatos

### Fix 1: Mapeo en el auditor (bajo riesgo, impacto alto)

Añadir mapeo de campos del collector a campos esperados:

```js
const EVIDENCE_FIELDS = [
  "agent", "agentName", "type", "command", "commandName",
  // Campos del collector
  "root_agent",          // string: agente de sesión raíz
];

// Para participating_agents (array)
function hasStructuredEvidence(records, name) {
  for (const rec of records) {
    // ... existing checks ...
    if (Array.isArray(rec.participating_agents) && 
        rec.participating_agents.includes(name)) return true;
  }
  return false;
}
```

### Fix 2: Alineación de esquema en el collector (medio riesgo)

Añadir campos `agent` y `command` como alias en la salida:

```js
trees.push({
  // ... existing fields ...
  agent: rootSession.agent || null,  // alias de root_agent
  command: extractCommand(rootSession),  // nuevo campo
});
```

### Fix 3: Schema compartido (alto riesgo, alto valor)

Crear `docs/ai/evolution/session-evidence-schema.json` que defina:
- Campos requeridos para execution trees
- Campos requeridos para normalized sessions
- Campos de evidencia de agentes/commands
- Versionado del esquema

Esto formaliza el contrato pero requiere synchronizar ambos scripts.

## Impacto de cada fix

| Fix | Riesgo | Impacto en coverage | Esfuerzo |
|---|---|---|---|
| Fix 1: Mapeo en auditor | Bajo | 0% → ~30-50% (si hay evidencia staged) | Bajo |
| Fix 2: Alineación en collector | Medio | Depende de que el collector funcione | Medio |
| Fix 3: Schema compartido | Alto | Cierre definitivo del gap | Alto |

## ¿Los 31 drifts deben existir?

**Sí, pero con severidad recalibrada.** Actualmente:

- 15 agentes × `severity: "medium"` = 15 drifts medium
- 15 commands × `severity: "low"` = 15 drifts low
- 1 session_sources × `severity: "medium"` = 1 drift medium

Propuesta:
- Agentes que solo se usan en flujos AHE (evaluator, debugger, evolver): `severity: "low"` — son sidecars, no se esperan en evidencia normal.
- Agentes core (lead, developer, reviewer, researcher, specifier, designer): `severity: "medium"` — se esperan en evidencia de features normales.
- Agentes de review orquestado (review_*): `severity: "low"` — solo aparecen bajo `/review-orchestrated`.
- Commands: `severity: "info"` — la evidencia de commands es implícita (aparecen en el prompt del usuario, no en el agente activo).

## Conclusión

El gap contract↔runtime es **real pero no crítico** para el harness actual. Es un problema de infraestructura (collector no completa + auditor no encuentra) que se puede cerrar con fixes de bajo-medio riesgo. Los 31 drifts son correctos como inventario pero no informativos como diagnóstico.

La prioridad debe ser: (1) arreglar el collector para que produzca evidencia, (2) alinear el auditor con el esquema del collector, (3) recalibrar severidades.
