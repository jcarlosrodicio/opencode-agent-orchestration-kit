# Debugger Overview — iteration-020-loop-engineering-command

## Evidencia analizada

- Petición y plan aprobado para adaptar Loop Engineering como comando manual.
- Contratos existentes de `/feature`, `/plan`, `lead`, `developer` y `reviewer`.
- Skills existentes `autonomous-loops` y `verification-loop`.
- RED/GREEN de las pruebas negativas de `check-harness`.
- `preflight-audit.json`, capturado después del RED/GREEN inicial.

## Root cause

El harness ya tenía las piezas necesarias para ejecutar un maker/checker, pero no
una entrada que las compusiera como loop manual, acotado, reanudable y con estado
durable. Usar `/feature` repetidamente dejaba el límite, el gate y la continuidad
entre invocaciones como convenciones implícitas.

La solución pertenece al nivel `command`: un prompt fino puede componer agentes y
skills existentes. Crear un agente, una skill o un motor nuevo duplicaría
responsabilidades y aumentaría el coste de orquestación.

## Fix previsto

- Añadir `/loop` con aprobación explícita antes de escrituras.
- Limitar cada invocación a tres iteraciones.
- Persistir el contrato y la evidencia en `.opencode/loops/<slug>.md`.
- Reservar la aprobación a `reviewer` y mantener `developer` como único escritor.
- Hacer worktrees opt-in y excluir automatización, auto-merge y conectores de
  escritura de la primera versión.

## Riesgos

- Un contrato largo puede añadir overhead a tareas demasiado pequeñas.
- Un checker basado en marcadores puede validar presencia sin demostrar conducta
  runtime.
- El checkout actual requiere proteger cambios locales y parar ante solapamientos.

## Atribución

El cambio es nuevo y aislado. No altera los contratos base de `/feature`, `/plan`
ni el routing por defecto; añade una entrada explícita para quien solicita este
tipo de loop.
