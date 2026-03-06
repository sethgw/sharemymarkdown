# --- Build stage ---
FROM oven/bun:1-alpine AS build

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

# --- Runtime stage ---
FROM oven/bun:1-alpine

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY --from=build /app/dist ./dist
COPY src ./src
COPY tsconfig.json drizzle.config.ts ./

EXPOSE 3000

CMD ["sh", "-c", "bunx drizzle-kit push --force && bun src/index.ts"]
