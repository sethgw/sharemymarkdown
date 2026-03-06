import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL ?? "file:sharemymarkdown.db";
const authToken = process.env.TURSO_AUTH_TOKEN ?? process.env.TURSO_TOKEN;
const isTurso = databaseUrl.startsWith("libsql://");

export default defineConfig(
  isTurso
    ? {
        schema: "./src/server/db/schema.ts",
        out: "./drizzle",
        dialect: "turso",
        dbCredentials: {
          url: databaseUrl,
          authToken,
        },
        verbose: true,
        strict: true,
      }
    : {
        schema: "./src/server/db/schema.ts",
        out: "./drizzle",
        dialect: "sqlite",
        dbCredentials: {
          url: databaseUrl,
        },
        verbose: true,
        strict: true,
      },
);
