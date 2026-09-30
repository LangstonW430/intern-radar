/**
 * HMAC-signed, expiring tokens for feedback links in digest emails.
 * Format: base64url(payload json) + "." + base64url(hmac-sha256 signature).
 */

export interface FeedbackTokenPayload {
  userId: string;
  listingId: string;
  kind: string;
  exp: number; // ms epoch
}

export const FEEDBACK_TOKEN_TTL_MS = 14 * 86_400_000;

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signFeedbackToken(
  payload: FeedbackTokenPayload,
  secret: string,
): Promise<string> {
  const body = encoder.encode(JSON.stringify(payload));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret),
    body,
  );
  return `${toBase64Url(new Uint8Array(body))}.${toBase64Url(new Uint8Array(signature))}`;
}

/** Returns the payload only for a valid signature and unexpired token. */
export async function verifyFeedbackToken(
  token: string,
  secret: string,
  now: number,
): Promise<FeedbackTokenPayload | null> {
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  try {
    const body = fromBase64Url(token.slice(0, dot));
    const signature = fromBase64Url(token.slice(dot + 1));
    const valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      signature as unknown as ArrayBuffer,
      body as unknown as ArrayBuffer,
    );
    if (!valid) return null;
    const payload = JSON.parse(
      new TextDecoder().decode(body),
    ) as FeedbackTokenPayload;
    if (
      typeof payload.exp !== "number" ||
      payload.exp < now ||
      !payload.userId ||
      !payload.listingId ||
      !payload.kind
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
