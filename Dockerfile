# better-sqlite3 ships prebuilt binaries for both architectures, but the build
# stage keeps the toolchain available in case a version lands without one.
FROM node:22-bookworm-slim AS deps
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY scripts ./scripts

# The database lives here, so it must outlive the container.
RUN mkdir -p /app/data && chown -R node:node /app
VOLUME /app/data
USER node

CMD ["node", "src/index.js"]
