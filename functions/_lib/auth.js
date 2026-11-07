const encoder = new TextEncoder();
const SESSION_SECONDS = 60 * 60 * 12;
// Cloudflare Workers currently caps PBKDF2 at 100,000 iterations.
const PBKDF2_ITERATIONS = 100000;

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers }
  });
}

export function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; }
  catch { return false; }
}

export function randomToken(bytes = 32) {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(data, b => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS }, key, 256);
  const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${hex(salt)}$${hex(bits)}`;
}

export async function verifyPassword(password, encoded) {
  try {
    const [scheme, iterationsText, saltHex, expectedHex] = encoded.split("$");
    const iterations = Number(iterationsText);
    if (scheme !== "pbkdf2-sha256" || !Number.isInteger(iterations) || iterations < 100000 || iterations > 1000000) return false;
    const fromHex = value => new Uint8Array(value.match(/.{2}/g).map(x => parseInt(x, 16)));
    const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromHex(saltHex), iterations }, key, 256);
    const actual = Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2, "0")).join("");
    return actual.length === expectedHex.length && actual === expectedHex;
  } catch { return false; }
}

export function cookieValue(request, name) {
  const raw = request.headers.get("Cookie") || "";
  for (const part of raw.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}

export function sessionCookie(token, maxAge = SESSION_SECONDS) {
  return `__Host-ctk_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}
export function csrfCookie(token, maxAge = SESSION_SECONDS) {
  return `ctk_csrf=${token}; Path=/; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}
export function clearCookies() {
  return [
    "__Host-ctk_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0",
    "ctk_csrf=; Path=/; Secure; SameSite=Strict; Max-Age=0"
  ];
}

export async function getSession(request, env) {
  const token = cookieValue(request, "__Host-ctk_session");
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await env.CHRISTTHEKING_DB.prepare(
    "SELECT s.id, s.admin_user_id, s.csrf_hash, s.expires_at, u.username FROM admin_sessions s JOIN admin_users u ON u.id=s.admin_user_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at > ?"
  ).bind(tokenHash, new Date().toISOString()).first();
  return row || null;
}

export async function requireCsrf(request, session) {
  const cookie = cookieValue(request, "ctk_csrf");
  const header = request.headers.get("X-CSRF-Token");
  if (!cookie || !header || cookie !== header) return false;
  return (await sha256(cookie)) === session.csrf_hash;
}

export function getClientKey(request) {
  return request.headers.get("CF-Connecting-IP") || "unknown";
}

export { SESSION_SECONDS };
