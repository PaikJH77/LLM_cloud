import { spawnSync } from "node:child_process";
const action = process.argv[2] ?? "up";
if (!["up", "down", "restart", "status"].includes(action))
  throw new Error("Use up, down, restart or status");
const args =
  action === "up"
    ? ["up", "-d", "--wait", "postgres", "keycloak"]
    : action === "status"
      ? ["ps"]
      : action === "restart"
        ? ["restart", "postgres"]
        : ["down", "--volumes"];
const r = spawnSync(
  "docker",
  ["compose", "-f", "infra/compose.test.yml", ...args],
  { stdio: "inherit" },
);
if (r.status !== 0) process.exit(r.status ?? 1);
if (action === "up") {
  const { waitOidc } = await import("../tests/support/oidc");
  await waitOidc();
  console.log("Isolated PostgreSQL and Keycloak ready");
}
