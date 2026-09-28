/**
 * Minimal OAuth 1.0a user-context client for the X API v2, ported to Web
 * Crypto. Each person brings their own developer app, so every request is
 * signed with their own four values. Server-only.
 */
export interface XCredentials {
  readonly apiKey: string;
  readonly apiSecret: string;
  readonly accessToken: string;
  readonly accessSecret: string;
}

export interface XPostResult {
  readonly id: string;
}

export class XApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "XApiError";
    this.status = status;
  }
}

function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

async function hmacSha1Base64(key: string, data: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

function randomHex(bytes: number): string {
  return [...crypto.getRandomValues(new Uint8Array(bytes))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function buildAuthorizationHeader(
  method: "GET" | "POST",
  url: string,
  credentials: XCredentials,
  queryParams: Record<string, string> = {},
): Promise<string> {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: credentials.apiKey,
    oauth_nonce: randomHex(16),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: credentials.accessToken,
    oauth_version: "1.0",
  };

  const allParams = { ...oauthParams, ...queryParams };
  const parameterString = Object.keys(allParams)
    .map((key) => [percentEncode(key), percentEncode(allParams[key] ?? "")] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  const baseString = [method, percentEncode(url), percentEncode(parameterString)].join("&");
  const signingKey = `${percentEncode(credentials.apiSecret)}&${percentEncode(credentials.accessSecret)}`;
  const signature = await hmacSha1Base64(signingKey, baseString);

  const headerParams: Record<string, string> = { ...oauthParams, oauth_signature: signature };
  return `OAuth ${Object.keys(headerParams)
    .sort()
    .map((key) => `${percentEncode(key)}="${percentEncode(headerParams[key] ?? "")}"`)
    .join(", ")}`;
}

function friendlyError(status: number, body: string): XApiError {
  if (status === 401) {
    return new XApiError(status, "X rejected these keys. Check all four values and try again.");
  }
  if (status === 403) {
    if (body.toLowerCase().includes("duplicate")) {
      return new XApiError(status, "X refused this as a duplicate of a recent post.");
    }
    return new XApiError(
      status,
      "X refused the request. Your app needs Read and write permission, and the access token must be regenerated after changing it.",
    );
  }
  if (status === 429) {
    return new XApiError(status, "X rate limit reached. This will be retried later.");
  }
  return new XApiError(status, `X returned an error (${status}). ${body.slice(0, 200)}`);
}

export async function verifyXCredentials(
  credentials: XCredentials,
): Promise<{ username: string; name: string }> {
  const url = "https://api.x.com/2/users/me";
  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: await buildAuthorizationHeader("GET", url, credentials) },
  });

  const body = await response.text();
  if (!response.ok) throw friendlyError(response.status, body);

  const parsed = JSON.parse(body) as { data?: { username?: string; name?: string } };
  return {
    username: parsed.data?.username ?? "",
    name: parsed.data?.name ?? "",
  };
}

export async function postToX(credentials: XCredentials, text: string): Promise<XPostResult> {
  const url = "https://api.x.com/2/tweets";
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: await buildAuthorizationHeader("POST", url, credentials),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  const body = await response.text();
  if (!response.ok) throw friendlyError(response.status, body);

  const parsed = JSON.parse(body) as { data?: { id?: string } };
  if (!parsed.data?.id) throw new XApiError(502, "X accepted the post but returned no id.");
  return { id: parsed.data.id };
}

/** X counts characters generously, but 280 is the safe practical ceiling. */
export const X_MAX_CHARACTERS = 280;

export function fitToX(text: string): string {
  if (Array.from(text).length <= X_MAX_CHARACTERS) return text;
  return `${Array.from(text).slice(0, X_MAX_CHARACTERS - 1).join("")}…`;
}
