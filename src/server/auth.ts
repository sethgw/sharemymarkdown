import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { bearer, mcp } from "better-auth/plugins";

import { db } from "@/server/db/client";
import { env, githubConfigured, isProduction } from "@/server/env";
import { account, oauthAccessToken, oauthApplication, oauthConsent, session, user, verification } from "@/server/db/schema";

const appOrigin = new URL(env.appUrl).origin;

export const auth = betterAuth({
  baseURL: env.appUrl,
  basePath: "/api/auth",
  secret: env.betterAuthSecret,
  trustedOrigins: [env.appUrl],
  advanced: {
    useSecureCookies: isProduction,
  },
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: {
      user,
      session,
      account,
      verification,
      oauthApplication,
      oauthAccessToken,
      oauthConsent,
    },
  }),
  plugins: [
    bearer(),
    mcp({
      loginPage: `${appOrigin}/mcp/login`,
      resource: `${appOrigin}/mcp`,
      oidcConfig: {
        requirePKCE: true,
      },
    }),
  ],
  socialProviders: githubConfigured
    ? {
        github: {
          clientId: env.githubClientId!,
          clientSecret: env.githubClientSecret!,
        },
      }
    : undefined,
});
