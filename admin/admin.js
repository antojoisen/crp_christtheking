const $ = id => document.getElementById(id);
const message = text => { $("message").textContent = text; };
async function api(path, options = {}) {
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store", ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}
async function initialize() {
  try {
    const session = await api("../api/auth/me");
    if (session.authenticated) {
      message("You are signed in as admin. The calendar management dashboard is the next module to be enabled.");
      return;
    }
  } catch {}
  // Setup state is deliberately not disclosed by a public status endpoint.
  $("login-panel").hidden = false;
  $("setup-panel").hidden = false;
  message("If this is the first visit, complete the one-time setup. Otherwise, sign in.");
}
$("setup-form").addEventListener("submit", async event => {
  event.preventDefault();
  const token = $("setup-token").value;
  const password = $("setup-password").value;
  if (password !== $("setup-confirm").value) return message("The passwords do not match.");
  try {
    const result = await api("../api/auth/setup", { method: "POST", headers: { "Content-Type": "application/json", "X-Setup-Token": token }, body: JSON.stringify({ password }) });
    message(result.message || "Account created. Please sign in.");
    $("setup-form").reset();
  } catch (error) { message(error.message); }
});
$("login-form").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    await api("../api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: $("username").value, password: $("password").value }) });
    $("password").value = "";
    message("Signed in successfully. Calendar management features will appear here when enabled.");
  } catch (error) { message(error.message); }
});
initialize();
