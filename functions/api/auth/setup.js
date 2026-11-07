import { json, sameOrigin, sha256, hashPassword } from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  let stage = "request validation";
  try {
    if (!sameOrigin(request)) return json({ error: "Request origin rejected." }, 403);
    stage = "setup secret validation";
    if (!env.ADMIN_SETUP_TOKEN || env.ADMIN_SETUP_TOKEN.length < 32) return json({ error: "Administrator setup has not been securely enabled yet." }, 503);

    const supplied = request.headers.get("X-Setup-Token") || "";
    if (supplied.length < 32 || (await sha256(supplied)) !== (await sha256(env.ADMIN_SETUP_TOKEN))) {
      return json({ error: "Invalid setup token." }, 403);
    }

    stage = "reading submitted password";
    let body;
    try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
    const password = typeof body.password === "string" ? body.password : "";
    if (password.length < 14 || password.length > 256) return json({ error: "Use a password between 14 and 256 characters." }, 400);

    stage = "checking administrator reservation";
    const reservation = await env.CHRISTTHEKING_DB.prepare(
      "SELECT username, status FROM admin_identity_reservation WHERE id=1"
    ).first();
    if (!reservation || reservation.username !== "admin" || reservation.status !== "pending_setup") {
      return json({ error: "Administrator setup has already been completed." }, 409);
    }

    stage = "checking existing administrator";
    const existing = await env.CHRISTTHEKING_DB.prepare("SELECT id FROM admin_users LIMIT 1").first();
    if (existing) return json({ error: "An administrator account already exists." }, 409);

    stage = "hashing password";
    const passwordHash = await hashPassword(password);
    const now = new Date().toISOString();

    stage = "creating administrator account";
    const result = await env.CHRISTTHEKING_DB.prepare(
      "INSERT INTO admin_users (username, password_hash, created_at) VALUES ('admin', ?, ?)"
    ).bind(passwordHash, now).run();
    if (!result.success) throw new Error("Database did not confirm administrator insert.");

    stage = "activating administrator reservation";
    const activation = await env.CHRISTTHEKING_DB.prepare(
      "UPDATE admin_identity_reservation SET status='active' WHERE id=1 AND status='pending_setup'"
    ).run();
    if (!activation.success || activation.meta?.changes !== 1) {
      throw new Error("Administrator reservation could not be activated; check database state before retrying.");
    }

    stage = "writing audit log";
    await env.CHRISTTHEKING_DB.prepare(
      "INSERT INTO audit_logs (actor, action, entity_type, entity_id, after_json, created_at) VALUES ('admin', 'initial_setup', 'admin_user', '1', ?, ?)"
    ).bind(JSON.stringify({ username: "admin" }), now).run();

    return json({ success: true, message: "Administrator account created. You can now sign in." }, 201);
  } catch (error) {
    console.error("Administrator setup failed", { stage, message: String(error?.message || error), stack: error?.stack });
    return json({ error: "Setup failed during " + stage + ". Please share this message with the site administrator." }, 500);
  }
}
