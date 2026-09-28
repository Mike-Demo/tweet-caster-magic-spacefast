/**
 * Fetch-based client for the SpaceFast Functions API. Mirrors the signatures
 * of the original TanStack Start server functions so the dashboard UI can be
 * reused with minimal changes.
 */

export interface DashboardSettings {
  tweetUsername: string | null;
  tweetDisplayName: string | null;
  tweetAvatarUrl: string | null;
  autoPost: boolean;
  skipReplies: boolean;
  skipQuotes: boolean;
  longPostMode: string;
  lastSyncedAt: string | null;
}

export interface QueueItem {
  id: string;
  sourceText: string;
  sourceCreatedAt: string;
  status: string;
  xPostId: string | null;
  error: string | null;
  postedAt: string | null;
}

export const X_ENVIRONMENTS = ["development", "staging", "production"] as const;
export type XEnvironment = (typeof X_ENVIRONMENTS)[number];

export interface CredentialSlot {
  environment: XEnvironment;
  connected: boolean;
  hint: string | null;
  xUsername: string | null;
}

export interface TweetAppConnection {
  connected: boolean;
  hint: string | null;
  needsReconnect: boolean;
}

export interface DashboardData {
  settings: DashboardSettings;
  credentials: CredentialSlot[];
  activeEnvironment: XEnvironment | null;
  tweetApp: TweetAppConnection;
  posts: QueueItem[];
}

async function api(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (response.status === 401) {
    window.location.href = "/";
    throw new Error("Session expired. Please sign in again.");
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // ignore
  }
  if (!response.ok) {
    const message =
      (body as { error?: string } | null)?.error ?? `Request failed (${response.status}).`;
    throw new Error(message);
  }
  return body;
}

export async function login(password: string): Promise<void> {
  await api("/api/auth/login", { method: "POST", body: JSON.stringify({ password }) });
}

export async function logout(): Promise<void> {
  await api("/api/auth/logout", { method: "POST" });
}

export async function checkSession(): Promise<boolean> {
  try {
    const body = (await api("/api/auth/me")) as { authenticated?: boolean };
    return body.authenticated === true;
  } catch {
    return false;
  }
}

export async function getDashboard(): Promise<DashboardData> {
  return (await api("/api/dashboard")) as DashboardData;
}

export async function saveSourceAccount(args: {
  data: { username: string };
}): Promise<{ username: string; displayName: string }> {
  return (await api("/api/settings/source-account", {
    method: "POST",
    body: JSON.stringify(args.data),
  })) as { username: string; displayName: string };
}

export async function saveAutomationSettings(args: {
  data: { autoPost: boolean; skipReplies: boolean; skipQuotes: boolean; longPostMode: string };
}): Promise<{ ok: true }> {
  return (await api("/api/settings/automation", {
    method: "POST",
    body: JSON.stringify(args.data),
  })) as { ok: true };
}

export async function saveXCredentials(args: {
  data: {
    environment: string;
    apiKey: string;
    apiSecret: string;
    accessToken: string;
    accessSecret: string;
  };
}): Promise<{ xUsername: string; environment: string }> {
  return (await api("/api/x-credentials", {
    method: "POST",
    body: JSON.stringify(args.data),
  })) as { xUsername: string; environment: string };
}

export async function removeXCredentials(args: {
  data: { environment: string };
}): Promise<{ ok: true }> {
  return (await api(`/api/x-credentials?environment=${encodeURIComponent(args.data.environment)}`, {
    method: "DELETE",
  })) as { ok: true };
}

export async function setActiveXEnvironment(args: {
  data: { environment: string };
}): Promise<{ environment: string }> {
  return (await api("/api/x-credentials/active", {
    method: "POST",
    body: JSON.stringify(args.data),
  })) as { environment: string };
}

export async function saveTweetAppToken(args: {
  data: { token: string };
}): Promise<{ ok: true }> {
  return (await api("/api/tweet-app/token", {
    method: "POST",
    body: JSON.stringify(args.data),
  })) as { ok: true };
}

export async function clearTweetAppToken(): Promise<{ ok: true }> {
  return (await api("/api/tweet-app/token", { method: "DELETE" })) as { ok: true };
}

export async function testTweetAppConnection(): Promise<{
  ok: true;
  username: string | null;
  message: string;
}> {
  return (await api("/api/tweet-app/test", { method: "POST" })) as {
    ok: true;
    username: string | null;
    message: string;
  };
}

export async function syncNow(): Promise<{
  imported: number;
  posted: number;
  failed: number;
  message: string;
}> {
  return (await api("/api/sync", { method: "POST" })) as {
    imported: number;
    posted: number;
    failed: number;
    message: string;
  };
}

export async function postNow(args: { data: { id: string } }): Promise<{ xPostId: string }> {
  return (await api(`/api/posts/${encodeURIComponent(args.data.id)}/publish`, {
    method: "POST",
  })) as { xPostId: string };
}

export async function setPostStatus(args: {
  data: { id: string; status: string };
}): Promise<{ ok: true }> {
  return (await api(`/api/posts/${encodeURIComponent(args.data.id)}/status`, {
    method: "POST",
    body: JSON.stringify({ status: args.data.status }),
  })) as { ok: true };
}
