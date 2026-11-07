import { json, sameOrigin, getSession, requireCsrf, clearCookies, sha256 } from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: "Request origin rejected." }, 403);
  const session = await getSession(request, env);
  if (session && !(await requireCsrf(request, session))) return json({ error: "CSRF validation failed." }, 403);
  if (session) {
    const token = request.headers.get("Cookie")?.match(/(?:^|;\s*)__Host-ctk_session=([^;]+)/)?.[1];
    if (token) await env.CHRISTTHEKING_DB.prepare(
      "UPDATE admin_sessions SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL"
    ).bind(new Date().toISOString(), await sha256(token)).run();
  }
  return json({ success: true }, 200, { "Set-Cookie": clearCookies() });
}
