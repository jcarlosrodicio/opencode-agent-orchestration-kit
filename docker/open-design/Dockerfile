FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends git curl ca-certificates python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash opencode
WORKDIR /app

RUN git clone https://github.com/nexu-io/open-design.git /app/open-design
WORKDIR /app/open-design

RUN corepack enable \
  && corepack prepare pnpm@10.33.2 --activate \
  && pnpm install --frozen-lockfile=false \
  && npm install -g opencode-ai@latest

# Make the daemon listen on OD_HOST when upstream exposes host/port constants.
# This is intentionally best-effort because upstream may change file layout.
RUN node - <<'NODE'
const fs = require('fs')
const candidates = ['apps/daemon/cli.js', 'apps/daemon/server.js', 'daemon/cli.js', 'daemon/server.js']
for (const file of candidates) {
  if (!fs.existsSync(file)) continue
  let text = fs.readFileSync(file, 'utf8')
  text = text.replace(/127\.0\.0\.1/g, "process.env.OD_HOST || '0.0.0.0'")
  text = text.replace(/localhost/g, "process.env.OD_HOST || '0.0.0.0'")
  fs.writeFileSync(file, text)
}
NODE

RUN pnpm build || pnpm -r build

ENV OD_HOST=0.0.0.0
ENV OD_PORT=7456
ENV OPENCODE_CONFIG_DIR=/home/opencode/.config/opencode

RUN mkdir -p /home/opencode/.config/opencode /home/opencode/.local/share/opencode /app/open-design/.od \
  && chown -R opencode:opencode /home/opencode /app/open-design

USER opencode
EXPOSE 7456

CMD ["sh", "-lc", "node apps/daemon/cli.js --host ${OD_HOST:-0.0.0.0} --port ${OD_PORT:-7456} --no-open || node daemon/cli.js --host ${OD_HOST:-0.0.0.0} --port ${OD_PORT:-7456} --no-open"]
