# syntax=docker/dockerfile:1

ARG NODE_IMAGE=node:26-trixie-slim

# --- all dependencies, for the build ---------------------------------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# No install scripts: better-sqlite3 and sharp ship prebuilt binaries, so the image
# needs no compiler. (Without the flag npm would try to compile better-sqlite3.)
RUN npm ci --ignore-scripts

# --- build the Astro server and the client bundle --------------------------
FROM deps AS build
COPY . .
RUN npm run build

# --- runtime dependencies only ---------------------------------------------
FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# --- the image that runs on the home server --------------------------------
FROM ${NODE_IMAGE} AS runtime

# Text recognition runs locally in this container: Tesseract with the German language pack.
RUN apt-get update \
  && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-deu \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
  HOST=0.0.0.0 \
  PORT=3000 \
  DATA_DIR=/data

WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY drizzle ./drizzle
COPY scripts/start.mjs ./scripts/start.mjs
COPY src/server/config.mjs ./src/server/config.mjs
COPY docker/entrypoint.sh /usr/local/bin/splitti-entrypoint

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --start-interval=2s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["splitti-entrypoint"]
CMD ["node", "scripts/start.mjs"]
