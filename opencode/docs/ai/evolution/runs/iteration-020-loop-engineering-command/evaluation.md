# Evaluación Iteración 020 — loop command

Fecha: 2026-06-29
Estado: implementado / validación estática completa

## Escenarios

| Escenario | Evidencia | Resultado |
| --- | --- | --- |
| Falta gate antes de escrituras | Prueba negativa del checker | pass |
| Falta límite de tres iteraciones | Prueba negativa del checker | pass |
| `developer` puede autoaprobar | Prueba negativa del checker | pass |
| Estado durable y worktree opt-in | Contrato estático del checker | pass |
| Objetivo nuevo no escribe antes del gate | Contrato del comando + marker mecánico | pass |
| Aprobación crea estado y respeta maker/checker | Contrato `developer -> reviewer -> developer (state sync)` | pass estático |
| Tres rechazos no abren una cuarta iteración | Límite contractual + prueba negativa | pass estático |
| Ruta sensible escala sin editar | Denylist y `ESCALATE_HUMAN` en el comando | pass estático |
| `resume <slug>` conserva historial | Interfaz y esquema de estado | pass estático |
| Checkout sucio protege cambios no solapados y para ante solapamiento | Preflight del comando | pass estático |
| Worktree omitido no se crea; explícito activa opt-in | Interfaz + marker mecánico | pass estático |
| Smoke completo del harness | `rtk node scripts/check-harness.mjs` | pass |
| Suite completa | `rtk node --test scripts/check-harness.test.mjs` | pass, 43/43 en 8,55 s |
| Replay runtime interactivo | Requiere gate humano dentro de otra sesión OpenCode | not_run |

## TDD

RED: las tres pruebas nuevas fallaron porque el checker devolvía exit code 0 para
contratos inválidos.
GREEN: tras añadir `checkLoopContract`, las tres pasaron en 718 ms.

## Preflight

`preflight-audit.json` se generó después del RED/GREEN inicial y reportó confianza
baja por ausencia de evidencia runtime. Se conserva esa limitación; no se presenta
como baseline previo a la edición.

## Validación final

- `rtk node --check scripts/check-harness.mjs`: pass.
- `rtk node scripts/check-harness.mjs`: pass.
- `rtk node --test scripts/check-harness.test.mjs`: pass, 43 tests y 0 fallos.
- `rtk git diff --check`: pass.
- Revisión manual de alcance: solo comando, contratos, checker, tests y artefactos
  AHE; `.codegraph/daemon.pid` y `data/memories.json` quedaron fuera.

Los escenarios multi-turn no se ejecutaron contra un modelo vivo: automatizar la
respuesta de aprobación invalidaría precisamente el gate que se quiere probar.
Quedan como primera validación de uso real cuando el usuario invoque el comando.
