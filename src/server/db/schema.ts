import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { documentVisibilityValues, type DocumentVisibility } from "@/shared/document-visibility";

export const roleValues = ["owner", "editor", "viewer"] as const;
export const revisionStatusValues = ["draft", "review", "applied"] as const;

export type Role = (typeof roleValues)[number];
export type RevisionStatus = (typeof revisionStatusValues)[number];

const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" }).notNull();
const optionalTimestamp = (name: string) => integer(name, { mode: "timestamp_ms" });

export const user = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
    image: text("image"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  table => [uniqueIndex("users_email_unique").on(table.email)],
);

export const session = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at"),
    token: text("token").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  table => [uniqueIndex("sessions_token_unique").on(table.token), index("sessions_user_id_idx").on(table.userId)],
);

export const account = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    providerId: text("provider_id").notNull(),
    accountId: text("account_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: optionalTimestamp("access_token_expires_at"),
    refreshTokenExpiresAt: optionalTimestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  table => [
    uniqueIndex("accounts_provider_account_unique").on(table.providerId, table.accountId),
    index("accounts_user_id_idx").on(table.userId),
  ],
);

export const verification = sqliteTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  table => [
    uniqueIndex("verifications_value_unique").on(table.value),
    index("verifications_identifier_idx").on(table.identifier),
  ],
);

export const jwks = sqliteTable("jwks", {
  id: text("id").primaryKey(),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  createdAt: timestamp("created_at"),
  expiresAt: optionalTimestamp("expires_at"),
  alg: text("alg"),
  crv: text("crv"),
});

export const oauthClient = sqliteTable(
  "oauth2_clients",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull(),
    clientSecret: text("client_secret"),
    clientDiscoveryId: text("client_discovery_id"),
    disabled: integer("disabled", { mode: "boolean" }).default(false),
    skipConsent: integer("skip_consent", { mode: "boolean" }),
    enableEndSession: integer("enable_end_session", { mode: "boolean" }),
    subjectType: text("subject_type"),
    scopes: text("scopes"),
    clientCredentialsScopes: text("client_credentials_scopes").default("[]"),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    createdAt: optionalTimestamp("created_at"),
    updatedAt: optionalTimestamp("updated_at"),
    name: text("name"),
    uri: text("uri"),
    icon: text("icon"),
    contacts: text("contacts"),
    tos: text("tos"),
    policy: text("policy"),
    softwareId: text("software_id"),
    softwareVersion: text("software_version"),
    softwareStatement: text("software_statement"),
    redirectUris: text("redirect_uris").notNull(),
    postLogoutRedirectUris: text("post_logout_redirect_uris"),
    backchannelLogoutUri: text("backchannel_logout_uri"),
    backchannelLogoutSessionRequired: integer("backchannel_logout_session_required", { mode: "boolean" }),
    tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
    applicationType: text("application_type"),
    jwks: text("jwks"),
    jwksUri: text("jwks_uri"),
    grantTypes: text("grant_types"),
    responseTypes: text("response_types"),
    requirePKCE: integer("require_pkce", { mode: "boolean" }),
    dpopBoundAccessTokens: integer("dpop_bound_access_tokens", { mode: "boolean" }).default(false),
    referenceId: text("reference_id"),
    metadata: text("metadata"),
  },
  table => [uniqueIndex("oauth2_clients_client_id_unique").on(table.clientId), index("oauth2_clients_user_id_idx").on(table.userId)],
);

export const oauthResource = sqliteTable(
  "oauth2_resources",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    name: text("name").notNull(),
    accessTokenTtl: integer("access_token_ttl"),
    refreshTokenTtl: integer("refresh_token_ttl"),
    signingAlgorithm: text("signing_algorithm"),
    signingKeyId: text("signing_key_id"),
    allowedScopes: text("allowed_scopes"),
    customClaims: text("custom_claims"),
    dpopBoundAccessTokensRequired: integer("dpop_bound_access_tokens_required", { mode: "boolean" }).default(false),
    disabled: integer("disabled", { mode: "boolean" }).default(false),
    createdAt: optionalTimestamp("created_at"),
    updatedAt: optionalTimestamp("updated_at"),
    policyVersion: integer("policy_version").default(1),
    metadata: text("metadata"),
  },
  table => [uniqueIndex("oauth2_resources_identifier_unique").on(table.identifier)],
);

export const oauthClientResource = sqliteTable(
  "oauth2_client_resources",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    resourceId: text("resource_id")
      .notNull()
      .references(() => oauthResource.identifier, { onDelete: "cascade" }),
    metadata: text("metadata"),
    createdAt: optionalTimestamp("created_at"),
  },
  table => [
    uniqueIndex("oauth2_client_resources_client_resource_unique").on(table.clientId, table.resourceId),
    index("oauth2_client_resources_client_id_idx").on(table.clientId),
    index("oauth2_client_resources_resource_id_idx").on(table.resourceId),
  ],
);

export const oauthRefreshToken = sqliteTable(
  "oauth2_refresh_tokens",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => session.id, { onDelete: "set null" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    authorizationCodeId: text("authorization_code_id"),
    resources: text("resources"),
    requestedUserInfoClaims: text("requested_user_info_claims"),
    expiresAt: optionalTimestamp("expires_at"),
    createdAt: optionalTimestamp("created_at"),
    revoked: optionalTimestamp("revoked"),
    rotatedAt: optionalTimestamp("rotated_at"),
    rotationReplayResponse: text("rotation_replay_response"),
    rotationReplayExpiresAt: optionalTimestamp("rotation_replay_expires_at"),
    authTime: optionalTimestamp("auth_time"),
    confirmation: text("confirmation"),
    scopes: text("scopes").notNull(),
  },
  table => [
    uniqueIndex("oauth2_refresh_tokens_token_unique").on(table.token),
    index("oauth2_refresh_tokens_client_id_idx").on(table.clientId),
    index("oauth2_refresh_tokens_session_id_idx").on(table.sessionId),
    index("oauth2_refresh_tokens_user_id_idx").on(table.userId),
    index("oauth2_refresh_tokens_authorization_code_id_idx").on(table.authorizationCodeId),
  ],
);

export const oauthAccessToken = sqliteTable(
  "oauth2_access_tokens",
  {
    id: text("id").primaryKey(),
    token: text("token"),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => session.id, { onDelete: "set null" }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    authorizationCodeId: text("authorization_code_id"),
    resources: text("resources"),
    requestedUserInfoClaims: text("requested_user_info_claims"),
    refreshId: text("refresh_id").references(() => oauthRefreshToken.id, { onDelete: "cascade" }),
    expiresAt: optionalTimestamp("expires_at"),
    createdAt: optionalTimestamp("created_at"),
    revoked: optionalTimestamp("revoked"),
    confirmation: text("confirmation"),
    scopes: text("scopes").notNull(),
  },
  table => [
    uniqueIndex("oauth2_access_tokens_token_unique").on(table.token),
    index("oauth2_access_tokens_client_id_idx").on(table.clientId),
    index("oauth2_access_tokens_session_id_idx").on(table.sessionId),
    index("oauth2_access_tokens_user_id_idx").on(table.userId),
    index("oauth2_access_tokens_authorization_code_id_idx").on(table.authorizationCodeId),
    index("oauth2_access_tokens_refresh_id_idx").on(table.refreshId),
  ],
);

export const oauthConsent = sqliteTable(
  "oauth2_consents",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    resources: text("resources"),
    requestedUserInfoClaims: text("requested_user_info_claims"),
    scopes: text("scopes").notNull(),
    createdAt: optionalTimestamp("created_at"),
    updatedAt: optionalTimestamp("updated_at"),
  },
  table => [index("oauth2_consents_client_id_idx").on(table.clientId), index("oauth2_consents_user_id_idx").on(table.userId)],
);

export const oauthClientAssertion = sqliteTable("oauth2_client_assertions", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at"),
});

// Tables written by the Better Auth 1.5 in-core MCP plugin. Better Auth 1.7 moved MCP onto
// @better-auth/oauth-provider (the oauth2_* tables below) and no longer reads these. They stay
// declared so the startup `drizzle-kit push --force` does not drop them or stop at a rename prompt.
export const legacyOauthApplication = sqliteTable(
  "oauth_applications",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull(),
    clientSecret: text("client_secret"),
    name: text("name").notNull(),
    icon: text("icon"),
    metadata: text("metadata"),
    redirectUrls: text("redirect_urls").notNull(),
    type: text("type").notNull(),
    authenticationScheme: text("authentication_scheme"),
    disabled: integer("disabled", { mode: "boolean" }).notNull().default(false),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  table => [uniqueIndex("oauth_applications_client_id_unique").on(table.clientId), index("oauth_applications_user_id_idx").on(table.userId)],
);

export const legacyOauthAccessToken = sqliteTable(
  "oauth_access_tokens",
  {
    id: text("id").primaryKey(),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token").notNull(),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    clientId: text("client_id")
      .notNull()
      .references(() => legacyOauthApplication.clientId, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    scopes: text("scopes").notNull(),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  table => [
    uniqueIndex("oauth_access_tokens_access_token_unique").on(table.accessToken),
    uniqueIndex("oauth_access_tokens_refresh_token_unique").on(table.refreshToken),
    index("oauth_access_tokens_client_id_idx").on(table.clientId),
    index("oauth_access_tokens_user_id_idx").on(table.userId),
  ],
);

export const legacyOauthConsent = sqliteTable(
  "oauth_consents",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => legacyOauthApplication.clientId, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    scopes: text("scopes").notNull(),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
    consentGiven: integer("consent_given", { mode: "boolean" }).notNull(),
  },
  table => [
    index("oauth_consents_client_id_idx").on(table.clientId),
    index("oauth_consents_user_id_idx").on(table.userId),
  ],
);

export const documents = sqliteTable(
  "documents",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    visibility: text("visibility").$type<DocumentVisibility>().notNull().default("unlisted"),
    shareId: text("share_id").notNull(),
    currentMarkdown: text("current_markdown").notNull().default(""),
    sourcePath: text("source_path"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  table => [
    index("documents_owner_id_idx").on(table.ownerId),
    index("documents_visibility_idx").on(table.visibility),
    uniqueIndex("documents_share_id_unique").on(table.shareId),
  ],
);

export const documentMembers = sqliteTable(
  "document_members",
  {
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").$type<Role>().notNull(),
    createdAt: timestamp("created_at"),
  },
  table => [
    primaryKey({ columns: [table.documentId, table.userId] }),
    index("document_members_user_id_idx").on(table.userId),
    index("document_members_role_idx").on(table.role),
  ],
);

export const versions = sqliteTable(
  "versions",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    parentVersionId: text("parent_version_id"),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    message: text("message").notNull(),
    markdown: text("markdown").notNull(),
    createdAt: timestamp("created_at"),
  },
  table => [index("versions_document_id_idx").on(table.documentId), index("versions_author_id_idx").on(table.authorId)],
);

export const documentCollaborationStates = sqliteTable(
  "document_collaboration_states",
  {
    documentId: text("document_id")
      .primaryKey()
      .references(() => documents.id, { onDelete: "cascade" }),
    yjsState: text("yjs_state").notNull().default(""),
    updatedByUserId: text("updated_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  table => [index("document_collaboration_states_updated_by_user_id_idx").on(table.updatedByUserId)],
);

export const documentRevisions = sqliteTable(
  "document_revisions",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").$type<RevisionStatus>().notNull().default("draft"),
    baseMarkdown: text("base_markdown").notNull(),
    markdown: text("markdown").notNull(),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
    appliedAt: optionalTimestamp("applied_at"),
  },
  table => [
    index("document_revisions_document_id_idx").on(table.documentId),
    index("document_revisions_author_id_idx").on(table.authorId),
    index("document_revisions_status_idx").on(table.status),
  ],
);

export const cliLoginRequests = sqliteTable(
  "cli_login_requests",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    token: text("token"),
    createdAt: timestamp("created_at"),
    expiresAt: timestamp("expires_at"),
    completedAt: optionalTimestamp("completed_at"),
  },
  table => [index("cli_login_requests_expires_at_idx").on(table.expiresAt)],
);

export const schema = {
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
  legacyOauthApplication,
  legacyOauthAccessToken,
  legacyOauthConsent,
  documents,
  documentMembers,
  versions,
  documentCollaborationStates,
  documentRevisions,
  cliLoginRequests,
};
