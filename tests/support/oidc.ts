export const issuer = "http://127.0.0.1:58080/realms/planner-test";
export async function waitOidc() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(issuer + "/.well-known/openid-configuration");
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Isolated Keycloak unavailable");
}
export async function testToken(username = "alice") {
  const r = await fetch(issuer + "/protocol/openid-connect/token", {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "password",
      client_id: "planner-desktop",
      username,
      password: "test-only-" + username,
    }),
  });
  if (!r.ok) throw new Error("Fixture authentication failed " + r.status);
  return ((await r.json()) as { access_token: string }).access_token;
}
