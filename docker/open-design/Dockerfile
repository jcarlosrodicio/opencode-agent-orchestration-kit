FROM node:24-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d

RUN apt-get update \
  && apt-get install -y --no-install-recommends git curl ca-certificates python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash opencode
WORKDIR /app

ARG OPEN_DESIGN_REF=1592beb96134f9d49b8a90dc6a359b94a69af57e
ARG OPENCODE_AI_VERSION=1.14.31

RUN git clone https://github.com/nexu-io/open-design.git /app/open-design \
  && cd /app/open-design \
  && git checkout "$OPEN_DESIGN_REF"
WORKDIR /app/open-design

RUN corepack enable \
  && corepack prepare pnpm@10.33.2 --activate \
  && pnpm install --frozen-lockfile \
  && npm install -g "opencode-ai@$OPENCODE_AI_VERSION"

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

RUN pnpm --filter @open-design/daemon build \
  && (pnpm build || pnpm -r build)

ENV OD_HOST=0.0.0.0
ENV OD_PORT=7456
ENV OPENCODE_CONFIG_DIR=/home/opencode/.config/opencode

RUN mkdir -p /home/opencode/.config/opencode /home/opencode/.local/share/opencode /app/open-design/.od \
  && chown -R opencode:opencode /home/opencode /app/open-design

USER opencode
EXPOSE 7456

CMD ["sh", "-lc", "node apps/daemon/dist/cli.js --port ${OD_PORT:-7456} --no-open"]
