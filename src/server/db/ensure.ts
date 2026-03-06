import { libsql } from "@/server/db/client";

const statements = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    email_verified INTEGER NOT NULL DEFAULT 0,
    image TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email)`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    token TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_unique ON sessions(token)`,
  `CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id)`,
  `CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY NOT NULL,
    provider_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    access_token TEXT,
    refresh_token TEXT,
    id_token TEXT,
    access_token_expires_at INTEGER,
    refresh_token_expires_at INTEGER,
    scope TEXT,
    password TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS accounts_provider_account_unique ON accounts(provider_id, account_id)`,
  `CREATE INDEX IF NOT EXISTS accounts_user_id_idx ON accounts(user_id)`,
  `CREATE TABLE IF NOT EXISTS verifications (
    id TEXT PRIMARY KEY NOT NULL,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS verifications_value_unique ON verifications(value)`,
  `CREATE INDEX IF NOT EXISTS verifications_identifier_idx ON verifications(identifier)`,
  `CREATE TABLE IF NOT EXISTS oauth_applications (
    id TEXT PRIMARY KEY NOT NULL,
    client_id TEXT NOT NULL,
    client_secret TEXT,
    name TEXT NOT NULL,
    icon TEXT,
    metadata TEXT,
    redirect_urls TEXT NOT NULL,
    type TEXT NOT NULL,
    authentication_scheme TEXT,
    disabled INTEGER NOT NULL DEFAULT 0,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS oauth_applications_client_id_unique ON oauth_applications(client_id)`,
  `CREATE INDEX IF NOT EXISTS oauth_applications_user_id_idx ON oauth_applications(user_id)`,
  `CREATE TABLE IF NOT EXISTS oauth_access_tokens (
    id TEXT PRIMARY KEY NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    access_token_expires_at INTEGER NOT NULL,
    refresh_token_expires_at INTEGER NOT NULL,
    client_id TEXT NOT NULL REFERENCES oauth_applications(client_id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    scopes TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS oauth_access_tokens_access_token_unique ON oauth_access_tokens(access_token)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS oauth_access_tokens_refresh_token_unique ON oauth_access_tokens(refresh_token)`,
  `CREATE INDEX IF NOT EXISTS oauth_access_tokens_client_id_idx ON oauth_access_tokens(client_id)`,
  `CREATE INDEX IF NOT EXISTS oauth_access_tokens_user_id_idx ON oauth_access_tokens(user_id)`,
  `CREATE TABLE IF NOT EXISTS oauth_consents (
    id TEXT PRIMARY KEY NOT NULL,
    client_id TEXT NOT NULL REFERENCES oauth_applications(client_id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scopes TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    consent_given INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS oauth_consents_client_id_idx ON oauth_consents(client_id)`,
  `CREATE INDEX IF NOT EXISTS oauth_consents_user_id_idx ON oauth_consents(user_id)`,
  `CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    current_markdown TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS documents_owner_id_idx ON documents(owner_id)`,
  `CREATE TABLE IF NOT EXISTS document_members (
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY(document_id, user_id)
  )`,
  `CREATE INDEX IF NOT EXISTS document_members_user_id_idx ON document_members(user_id)`,
  `CREATE INDEX IF NOT EXISTS document_members_role_idx ON document_members(role)`,
  `CREATE TABLE IF NOT EXISTS versions (
    id TEXT PRIMARY KEY NOT NULL,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    parent_version_id TEXT,
    author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    markdown TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS versions_document_id_idx ON versions(document_id)`,
  `CREATE INDEX IF NOT EXISTS versions_author_id_idx ON versions(author_id)`,
  `CREATE TABLE IF NOT EXISTS document_collaboration_states (
    document_id TEXT PRIMARY KEY NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    yjs_state TEXT NOT NULL DEFAULT '',
    updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS document_collaboration_states_updated_by_user_id_idx ON document_collaboration_states(updated_by_user_id)`,
  `CREATE TABLE IF NOT EXISTS document_revisions (
    id TEXT PRIMARY KEY NOT NULL,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    base_markdown TEXT NOT NULL,
    markdown TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    applied_at INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS document_revisions_document_id_idx ON document_revisions(document_id)`,
  `CREATE INDEX IF NOT EXISTS document_revisions_author_id_idx ON document_revisions(author_id)`,
  `CREATE INDEX IF NOT EXISTS document_revisions_status_idx ON document_revisions(status)`,
  `CREATE TABLE IF NOT EXISTS cli_login_requests (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    token TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    completed_at INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS cli_login_requests_expires_at_idx ON cli_login_requests(expires_at)`,
];

let ready = false;

const getTableInfo = async (tableName: string) => {
  const result = await libsql.execute(`PRAGMA table_info(${tableName})`);
  return result.rows.map(row => ({
    name: String(row.name),
    notNull: Number(row.notnull) === 1,
  }));
};

const rebuildOauthApplicationsTable = async () => {
  await libsql.execute(`DROP TABLE IF EXISTS oauth_applications__new`);
  await libsql.execute(`
    CREATE TABLE oauth_applications__new (
      id TEXT PRIMARY KEY NOT NULL,
      client_id TEXT NOT NULL,
      client_secret TEXT,
      name TEXT NOT NULL,
      icon TEXT,
      metadata TEXT,
      redirect_urls TEXT NOT NULL,
      type TEXT NOT NULL,
      authentication_scheme TEXT,
      disabled INTEGER NOT NULL DEFAULT 0,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  await libsql.execute(`
    INSERT INTO oauth_applications__new (
      id,
      client_id,
      client_secret,
      name,
      icon,
      metadata,
      redirect_urls,
      type,
      authentication_scheme,
      disabled,
      user_id,
      created_at,
      updated_at
    )
    SELECT
      lower(hex(randomblob(16))),
      client_id,
      client_secret,
      name,
      icon,
      metadata,
      redirect_urls,
      type,
      CASE WHEN type = 'public' THEN 'none' ELSE 'client_secret_basic' END,
      disabled,
      user_id,
      created_at,
      updated_at
    FROM oauth_applications
  `);
  await libsql.execute(`DROP TABLE oauth_applications`);
  await libsql.execute(`ALTER TABLE oauth_applications__new RENAME TO oauth_applications`);
  await libsql.execute(`CREATE UNIQUE INDEX IF NOT EXISTS oauth_applications_client_id_unique ON oauth_applications(client_id)`);
  await libsql.execute(`CREATE INDEX IF NOT EXISTS oauth_applications_user_id_idx ON oauth_applications(user_id)`);
};

const rebuildOauthAccessTokensTable = async () => {
  await libsql.execute(`DROP TABLE IF EXISTS oauth_access_tokens__new`);
  await libsql.execute(`
    CREATE TABLE oauth_access_tokens__new (
      id TEXT PRIMARY KEY NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      access_token_expires_at INTEGER NOT NULL,
      refresh_token_expires_at INTEGER NOT NULL,
      client_id TEXT NOT NULL REFERENCES oauth_applications(client_id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      scopes TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  await libsql.execute(`
    INSERT INTO oauth_access_tokens__new (
      id,
      access_token,
      refresh_token,
      access_token_expires_at,
      refresh_token_expires_at,
      client_id,
      user_id,
      scopes,
      created_at,
      updated_at
    )
    SELECT
      lower(hex(randomblob(16))),
      access_token,
      refresh_token,
      access_token_expires_at,
      refresh_token_expires_at,
      client_id,
      user_id,
      scopes,
      created_at,
      updated_at
    FROM oauth_access_tokens
  `);
  await libsql.execute(`DROP TABLE oauth_access_tokens`);
  await libsql.execute(`ALTER TABLE oauth_access_tokens__new RENAME TO oauth_access_tokens`);
  await libsql.execute(`CREATE UNIQUE INDEX IF NOT EXISTS oauth_access_tokens_access_token_unique ON oauth_access_tokens(access_token)`);
  await libsql.execute(`CREATE UNIQUE INDEX IF NOT EXISTS oauth_access_tokens_refresh_token_unique ON oauth_access_tokens(refresh_token)`);
  await libsql.execute(`CREATE INDEX IF NOT EXISTS oauth_access_tokens_client_id_idx ON oauth_access_tokens(client_id)`);
  await libsql.execute(`CREATE INDEX IF NOT EXISTS oauth_access_tokens_user_id_idx ON oauth_access_tokens(user_id)`);
};

const rebuildOauthConsentsTable = async () => {
  await libsql.execute(`DROP TABLE IF EXISTS oauth_consents__new`);
  await libsql.execute(`
    CREATE TABLE oauth_consents__new (
      id TEXT PRIMARY KEY NOT NULL,
      client_id TEXT NOT NULL REFERENCES oauth_applications(client_id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      scopes TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      consent_given INTEGER NOT NULL
    )
  `);
  await libsql.execute(`
    INSERT INTO oauth_consents__new (
      id,
      client_id,
      user_id,
      scopes,
      created_at,
      updated_at,
      consent_given
    )
    SELECT
      lower(hex(randomblob(16))),
      client_id,
      user_id,
      scopes,
      created_at,
      updated_at,
      consent_given
    FROM oauth_consents
  `);
  await libsql.execute(`DROP TABLE oauth_consents`);
  await libsql.execute(`ALTER TABLE oauth_consents__new RENAME TO oauth_consents`);
  await libsql.execute(`CREATE INDEX IF NOT EXISTS oauth_consents_client_id_idx ON oauth_consents(client_id)`);
  await libsql.execute(`CREATE INDEX IF NOT EXISTS oauth_consents_user_id_idx ON oauth_consents(user_id)`);
};

const ensureOauthPluginSchema = async () => {
  const oauthApplicationInfo = await getTableInfo("oauth_applications");
  const oauthApplicationColumns = new Set(oauthApplicationInfo.map(column => column.name));
  const oauthApplicationAuthScheme = oauthApplicationInfo.find(column => column.name === "authentication_scheme");
  if (
    oauthApplicationColumns.size > 0 &&
    (!oauthApplicationColumns.has("id") ||
      !oauthApplicationColumns.has("authentication_scheme") ||
      oauthApplicationAuthScheme?.notNull)
  ) {
    await rebuildOauthApplicationsTable();
  }

  const oauthAccessTokenColumns = new Set((await getTableInfo("oauth_access_tokens")).map(column => column.name));
  if (oauthAccessTokenColumns.size > 0 && !oauthAccessTokenColumns.has("id")) {
    await rebuildOauthAccessTokensTable();
  }

  const oauthConsentColumns = new Set((await getTableInfo("oauth_consents")).map(column => column.name));
  if (oauthConsentColumns.size > 0 && !oauthConsentColumns.has("id")) {
    await rebuildOauthConsentsTable();
  }
};

export const ensureDatabase = async () => {
  if (ready) return;

  for (const statement of statements) {
    await libsql.execute(statement);
  }

  await ensureOauthPluginSchema();

  ready = true;
};
