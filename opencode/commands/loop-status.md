---
description: "Consulta el estado durable de una misión sin adquirir locks ni escribir archivos."
agent: lead
---

# Estado de misión

Usa esta consulta para inspeccionar un loop existente sin reanudarlo ni
modificarlo.

```bash
node scripts/mission-status.mjs --root /ruta/absoluta/al/repo --slug <slug>
node scripts/mission-status.mjs --root /ruta/absoluta/al/repo --slug <slug> --json
```

La salida proyecta el snapshot canónico y el último evento validado:
`status`, `iteration/planned`, último paso, causa de bloqueo, sesión, timestamp
y siguiente acción segura. `--root` debe ser una ruta absoluta y `--slug` un
identificador kebab-case válido.

Si falta el estado, el snapshot está desfasado o el historial está corrupto,
detente y reporta el código durable (`state_missing`, `snapshot_stale` o
`history_corrupt`). No ejecutes `resume`, `repair` ni `release` como sustituto
automático.
