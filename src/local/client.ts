import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

import type { DocumentVisibility } from "@/server/db/schema";
import { env } from "@/server/env";

const serverUrl = env.cliServerUrl.replace(/\/$/, "");
const sessionDir = process.env.HOME
  ? path.join(process.env.HOME, ".config", "sharemymarkdown")
  : path.join(process.cwd(), ".sharemymarkdown");
const sessionFile = path.join(sessionDir, "session.json");
const configFile = path.join(sessionDir, "config.json");

export type LocalCliConfig = {
  defaultVisibility?: DocumentVisibility;
};

export const localClientConfig = {
  serverUrl,
  sessionDir,
  sessionFile,
  configFile,
};

export const readSessionToken = async () => {
  const file = Bun.file(sessionFile);
  if (!(await file.exists())) return null;

  try {
    const data = (await file.json()) as { token?: string };
    return data.token ?? null;
  } catch {
    return null;
  }
};

export const saveSessionToken = async (token: string) => {
  await mkdir(sessionDir, { recursive: true });
  await Bun.write(sessionFile, JSON.stringify({ token }, null, 2));
};

export const clearSessionToken = async () => {
  const file = Bun.file(sessionFile);
  if (await file.exists()) {
    await rm(sessionFile, { force: true });
  }
};

export const readLocalCliConfig = async (): Promise<LocalCliConfig> => {
  const file = Bun.file(configFile);
  if (!(await file.exists())) {
    return {};
  }

  try {
    return (await file.json()) as LocalCliConfig;
  } catch {
    return {};
  }
};

export const saveLocalCliConfig = async (config: LocalCliConfig) => {
  await mkdir(sessionDir, { recursive: true });
  await Bun.write(configFile, JSON.stringify(config, null, 2));
};

export const apiFetch = async <T,>(pathname: string, init?: RequestInit, authRequired = true): Promise<T> => {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  if (authRequired) {
    const token = await readSessionToken();
    if (!token) {
      throw new Error("Not logged in. Run `sharemymarkdown auth login` first.");
    }
    headers.set("authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${serverUrl}${pathname}`, {
    ...init,
    headers,
  });

  const data = (await response.json().catch(() => null)) as { error?: string } | null;

  if (!response.ok) {
    throw new Error(data?.error ?? response.statusText);
  }

  return data as T;
};
