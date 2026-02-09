# nobodyreads — self-hosted blog engine
# Build: docker build -t nobodyreads .
# Run:   docker run -p 3000:3000 nobodyreads

FROM node:20-alpine AS base
WORKDIR /app

# --- Install dependencies ---
FROM base AS deps
COPY package*.json ./
RUN npm ci

# --- Build TypeScript ---
FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- Final image ---
FROM base AS app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY public ./public
COPY content ./content
COPY schema.sql ./schema.sql
COPY robots.txt ./robots.txt
COPY scripts ./scripts

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist/standalone.js"]
