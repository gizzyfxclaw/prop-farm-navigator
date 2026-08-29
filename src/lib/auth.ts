/**
 * Session cookie helpers.
 *
 * The session token is HMAC-SHA256("gfx|<email>", AUTH_SECRET).
 * Signing happens on login; verification happens on every request in server.ts.
 * Credentials are Cloudflare Worker secrets — they are never stored in code.
 */

const COOKIE_NAME = "gfx_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

/** Produce the signed token for a given email. */
export async function signSession(email: string, secret: string): Promise<string> {
  const key = await importKey(secret);
  const message = `gfx|${email.toLowerCase()}`;
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return `${encodeURIComponent(email.toLowerCase())}.${toHex(sig)}`;
}

/** Verify token and return the email it encodes, or null if invalid. */
export async function verifySession(token: string, secret: string): Promise<string | null> {
  try {
    const dot = token.lastIndexOf(".");
    if (dot < 1) return null;
    const email = decodeURIComponent(token.slice(0, dot));
    const sigHex = token.slice(dot + 1);
    const key = await importKey(secret);
    const message = `gfx|${email}`;
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      fromHex(sigHex).buffer as ArrayBuffer,
      new TextEncoder().encode(message),
    );
    return valid ? email : null;
  } catch {
    return null;
  }
}

/** Build the Set-Cookie header value for a new session. */
export function buildSessionCookie(token: string): string {
  return `${COOKIE_NAME}=${token}; Path=/; Max-Age=${MAX_AGE_SECONDS}; HttpOnly; SameSite=Strict; Secure`;
}

/** Build the Set-Cookie header value that clears the session. */
export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict; Secure`;
}

/** Parse the session token from the Cookie request header, or null. */
export function parseSessionToken(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === COOKIE_NAME) return rest.join("=");
  }
  return null;
}
