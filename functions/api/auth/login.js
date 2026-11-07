import { json, sameOrigin, randomToken, sha256, verifyPassword, sessionCookie, csrfCookie, SESSION_SECONDS, getClientKey } from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: "Request origin rejected." }, 403);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (username !== "admin" || password.length > 256 || !password) return json({ error: "Invalid username or password." }, 401);

  const ipHash = await sha256(getClientKey(request));
  const now = new Date();
  const windowStart = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
  const attempts = await env.CHRISTTHEKING_DB.prepare(
    "SELECT COUNT(*) AS total FROM auth_attempts WHERE username=? AND ip_hash=? AND attempted_at > ? AND succeeded=0"
  ).bind("admin", ipHash, windowStart).first();
  if ((attempts?.total || 0) >= 5) return json({ error: "Too many sign-in attempts. Try again in 15 minutes." }, 429);

  const user = await env.CHRISTTHEKING_DB.prepare(
    "SELECT id, username, password_hash FROM admin_users WHERE username='admin' LIMIT 1"
  ).first();
  const valid = user ? await verifyPassword(password, user.password_hash) : false;
  await env.CHRISTTHEKING_DB.prepare(
    "INSERT INTO auth_attempts (username, ip_hash, attempted_at, succeeded) VALUES ('admin', ?, ?, ?)"
  ).bind(ipHash, now.toISOString(), valid ? 1 : 0).run();

  if (!valid) return json({ error: "Invalid username or password." }, 401);

  const sessionToken = randomToken(32);
  const csrfToken = randomToken(32);
  const expires = new Date(now.getTime() + SESSION_SECONDS * 1000).toISOString();
  await env.CHRISTTHEKING_DB.prepare(
    "INSERT INTO admin_sessions (admin_user_id, token_hash, csrf_hash, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(user.id, await sha256(sessionToken), await sha256(csrfToken), now.toISOString(), expires, now.toISOString()).run();
  await env.CHRISTTHEKING_DB.prepare(
    "UPDATE admin_users SET last_login_at=? WHERE id=?"
  ).bind(now.toISOString(), user.id).run();
  await env.CHRISTTHEKING_DB.prepare(
    "INSERT INTO audit_logs (actor, action, entity_type, entity_id, created_at) VALUES ('admin', 'login', 'admin_session', ?, ?)"
  ).bind(await sha256(sessionToken), now.toISOString()).run();

  const headers = new Headers();
  headers.append("Set-Cookie", sessionCookie(sessionToken));
  headers.append("Set-Cookie", csrfCookie(csrfToken));
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify({ success: true, username: "admin", csrfToken }), { status: 200, headers });
}
