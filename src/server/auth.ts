import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { mcp } from "@better-auth/mcp";
import { betterAuth } from "better-auth";
import { bearer, jwt } from "better-auth/plugins";

import { db } from "@/server/db/client";
import { env, githubConfigured, isProduction } from "@/server/env";
import {
  account,
  jwks,
  oauthAccessToken,
  oauthClient,
  oauthClientAssertion,
  oauthClientResource,
  oauthConsent,
  oauthRefreshToken,
  oauthResource,
  session,
  user,
  verification,
} from "@/server/db/schema";

const appOrigin = new URL(env.appUrl).origin;

export const mcpResource = `${appOrigin}/mcp`;

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
      jwks,
      oauthClient,
      oauthResource,
      oauthClientResource,
      oauthRefreshToken,
      oauthAccessToken,
      oauthConsent,
      oauthClientAssertion,
    },
  }),
  plugins: [
    bearer(),
    jwt(),
    mcp({
      loginPage: `${appOrigin}/mcp/login`,
      consentPage: `${appOrigin}/mcp/consent`,
      resource: mcpResource,
      // The in-core MCP plugin this replaces accepted open dynamic client registration.
      // Keep it so MCP clients that predate Client ID Metadata Documents can still connect.
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      // MCP clients register loopback or custom-scheme redirects without sending application_type.
      clientRegistrationDefaultApplicationType: "infer",
    }),
    cimd({
      fetchClientMetadataResource,
      metadataProfile: "mcp-2026-07-28",
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
