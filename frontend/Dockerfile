# CargoTrack frontend — Next.js (App Router)
#
# The production stage expects `output: "standalone"` in next.config.
# If you scaffold without it, swap the production stage for a plain
# `npm run start` over the full node_modules.

# ---------------------------------------------------------------------------
FROM node:20-alpine AS base

RUN apk add --no-cache libc6-compat

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---------------------------------------------------------------------------
FROM base AS deps

COPY package.json package-lock.json* ./
RUN npm ci

# ---------------------------------------------------------------------------
FROM base AS development

ENV NODE_ENV=development

COPY --from=deps /app/node_modules ./node_modules
COPY . .

EXPOSE 3000
CMD ["npm", "run", "dev"]

# ---------------------------------------------------------------------------
FROM base AS build

ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* values are inlined at build time, so the API base URL must be
# supplied as a build arg for production images.
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}

RUN npm run build

# ---------------------------------------------------------------------------
FROM base AS production

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=build /app/public ./public
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static

USER node

EXPOSE 3000
CMD ["node", "server.js"]
