# syntax=docker/dockerfile:1
# Node 24 to match package.json "engines" (>=24 <25).
FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH HUSKY=0 NEXT_TELEMETRY_DISABLED=1
RUN corepack enable

# --- build: toolchain for the better-sqlite3-multiple-ciphers native addon ---
FROM base AS build
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY . .
# Vendor MediaPipe WASM + model weights into public/models (no runtime network calls).
RUN bash scripts/fetch-fashion-models.sh
# allowedOrigins for Server Actions is baked in at build time.
ARG APP_PUBLIC_ORIGIN
ARG GIT_SHA
ENV APP_PUBLIC_ORIGIN=$APP_PUBLIC_ORIGIN GIT_SHA=$GIT_SHA
RUN pnpm build
# devDependencies are kept: next.config.ts is transpiled at runtime and needs `typescript`.

# --- runtime ---
FROM base AS runtime
ENV NODE_ENV=production APP_DATA_DIR=/app/data
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json /app/next.config.ts ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/drizzle ./drizzle
RUN mkdir -p /app/data && chown node:node /app/data
VOLUME /app/data
# Non-root. Binding 0.0.0.0 is safe ONLY because the container sits on a private
# network and the reverse proxy is the only published service.
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node_modules/.bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
