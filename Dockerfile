# Brim It — deploy image. better-sqlite3 is a native module, so we need
# build tooling at install time. Use a host with a persistent volume mounted at
# /app/.data (Railway/Render/Fly) and provide GEMINI_API_KEY as an env var.
FROM node:22-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*

# Install deps
COPY package.json package-lock.json* ./
RUN npm install

# Build
COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Build the SQLite DB from the bundled xlsx + seed rules, then start.
# (AI reasoning/summaries are added if GEMINI_API_KEY is set; otherwise skipped.)
CMD ["sh", "-c", "npm run db:reset && npm run start -- -p ${PORT}"]
