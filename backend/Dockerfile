# CargoTrack backend — NestJS + Prisma + BullMQ
#
# Stages:
#   base        shared runtime setup
#   deps        full dependency install (dev + prod)
#   development hot-reload target used by docker-compose
#   build       compiles to dist/ and prunes to production deps
#   production  minimal runtime image
#
# The backend and worker services share this image and differ only by command.

# ---------------------------------------------------------------------------
FROM node:20-alpine AS base

# dumb-init gives correct signal handling so BullMQ workers shut down cleanly
# rather than being killed mid-job.
RUN apk add --no-cache dumb-init libc6-compat

WORKDIR /app
ENV NODE_ENV=development

# ---------------------------------------------------------------------------
FROM base AS deps

COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci

# ---------------------------------------------------------------------------
FROM base AS development

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Source is bind-mounted over this in compose; the copy keeps the image
# standalone-runnable.
RUN npx prisma generate

# Kept outside /app so the compose bind mount does not shadow it.
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 4000
ENTRYPOINT ["dumb-init", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["npm", "run", "start:dev"]

# ---------------------------------------------------------------------------
FROM base AS build

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Two entrypoints, two output directories: the API compiles to dist/ and the
# worker to dist-worker/. They are kept separate so the watch-mode processes
# in development cannot delete each other's output.
RUN npx prisma generate \
 && npm run build \
 && npm run build:worker \
 && npm prune --omit=dev

# ---------------------------------------------------------------------------
FROM base AS production

ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-worker ./dist-worker
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER node

EXPOSE 4000
ENTRYPOINT ["dumb-init", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
