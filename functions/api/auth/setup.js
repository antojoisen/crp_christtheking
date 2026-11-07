import { json, sameOrigin, randomToken, sha256, hashPassword } from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: "Request origin rejected." }, 403);
  if (!env.ADMIN_SETUP_TOKEN || env.ADMIN_SETUP_TOKEN.length < 32) return json({ error: "Administrator setup has not been securely enabled yet." }, 503);

  const supplied = request.headers.get("X-Setup-Token") || "";
  if (supplied.length < 32 || (await sha256(supplied)) !== (await sha256(env.ADMIN_SETUP_TOKEN))) {
    return json({ error: "Invalid setup token." }, 403);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < 14 || password.length > 256) return json({ error: "Use a password between 14 and 256 characters." }, 400);

  const reservation = await env.CHRISTTHEKING_DB.prepare(
    "SELECT username, status FROM admin_identity_reservation WHERE id=1"
  ).first();
  if (!reservation || reservation.username !== "admin" || reservation.status !== "pending_setup") {
    return json({ error: "Administrator setup has already been completed." }, 409);
  }
  const existing = await env.CHRISTTHEKING_DB.prepare("SELECT id FROM admin_users LIMIT 1").first();
  if (existing) return json({ error: "An administrator account already exists." }, 409);

  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();
  const result = await env.CHRISTTHEKING_DB.prepare(
    "INSERT INTO admin_users (username, password_hash, created_at) VALUES ('admin', ?, ?)"
  ).bind(passwordHash, now).run();
  if (!result.success) return json({ error: "Could not create administrator account." }, 500);

  await env.CHRISTTHEKING_DB.prepare(
    "UPDATE admin_identity_reservation SET status='active' WHERE id=1 AND status='pending_setup'"
  ).run();
  await env.CHRISTTHEKING_DB.prepare(
    "INSERT INTO audit_logs (actor, action, entity_type, entity_id, after_json, created_at) VALUES ('admin', 'initial_setup', 'admin_user', '1', ?, ?)"
  ).bind(JSON.stringify({ username: "admin" }), now).run();

  return json({ success: true, message: "Administrator account created. You can now sign in." }, 201, {
    "Set-Cookie": "ctk_setup=; Path=/; Secure; SameSite=Strict; Max-Age=0"
  });
}
