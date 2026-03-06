import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import { env } from "@/server/env";
import { schema } from "@/server/db/schema";

export const libsql = createClient({
  url: env.databaseUrl,
  authToken: env.tursoAuthToken,
});

export const db = drizzle({
  client: libsql,
  schema,
});
