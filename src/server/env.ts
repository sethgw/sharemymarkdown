const defaultPort = 3000;

const parsePort = (value: string | undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultPort;
};

export const env = {
  port: parsePort(process.env.PORT),
  appUrl: process.env.BETTER_AUTH_URL ?? `http://localhost:${parsePort(process.env.PORT)}`,
  databaseUrl: process.env.DATABASE_URL ?? "file:sharemymarkdown.db",
  tursoAuthToken: process.env.TURSO_AUTH_TOKEN || process.env.TURSO_TOKEN || process.env.TURBO_TOKEN || undefined,
  betterAuthSecret:
    process.env.BETTER_AUTH_SECRET ?? "development-secret-change-me-please-set-a-real-secret",
  githubClientId: process.env.GITHUB_CLIENT_ID,
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET,
  cliServerUrl: process.env.SMM_SERVER_URL ?? process.env.BETTER_AUTH_URL ?? `http://localhost:${parsePort(process.env.PORT)}`,
};

export const githubConfigured = Boolean(env.githubClientId && env.githubClientSecret);
export const isProduction = process.env.NODE_ENV === "production";
