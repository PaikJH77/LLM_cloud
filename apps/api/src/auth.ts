import { createRemoteJWKSet, jwtVerify } from "jose";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { Principal } from "../../../packages/core/src/model";
export class AuthenticationError extends Error {}
export interface AuthConfig {
  db: Pool;
  issuer: string;
  audience: string;
  allowLoopbackHttp?: boolean;
  now?: () => Date;
  authorize?: (issuer: string, subject: string) => void;
}
export function secureUrl(value: string, allowLoopbackHttp = false): URL {
  const u = new URL(value);
  if (
    u.username ||
    u.password ||
    u.hash ||
    !(
      u.protocol === "https:" ||
      (allowLoopbackHttp &&
        u.protocol === "http:" &&
        ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname))
    )
  )
    throw new Error("HTTPS configuration required");
  return u;
}
export async function createAuthenticator(
  config: AuthConfig,
): Promise<(bearer: string) => Promise<Principal>> {
  const url = secureUrl(config.issuer, config.allowLoopbackHttp);
  if (!config.audience?.trim()) throw new Error("Audience required");
  const response = await fetch(
    url.href.replace(/\/$/, "") + "/.well-known/openid-configuration",
    { signal: AbortSignal.timeout(10000), redirect: "error" },
  );
  if (!response.ok) throw new Error("OIDC discovery failed");
  const discovery = (await response.json()) as {
    issuer: string;
    jwks_uri: string;
  };
  if (discovery.issuer !== config.issuer)
    throw new Error("OIDC issuer mismatch");
  const jwks = createRemoteJWKSet(
    secureUrl(discovery.jwks_uri, config.allowLoopbackHttp),
  );
  return async (bearer) => {
    const { payload } = await jwtVerify(bearer, jwks, {
      issuer: config.issuer,
      audience: config.audience,
      algorithms: ["RS256", "ES256"],
      requiredClaims: ["exp", "iat", "sub"],
      currentDate: config.now?.(),
    }).catch(() => {
      throw new AuthenticationError("Invalid bearer token");
    });
    if (typeof payload.sub !== "string" || !payload.sub)
      throw new AuthenticationError("Subject required");
    config.authorize?.(config.issuer, payload.sub);
    const r = await config.db.query(
      "INSERT INTO principals(id,issuer,subject) VALUES($1,$2,$3) ON CONFLICT(issuer,subject) DO UPDATE SET issuer=EXCLUDED.issuer RETURNING id",
      [randomUUID(), config.issuer, payload.sub],
    );
    return {
      ownerId: r.rows[0].id,
      issuer: config.issuer,
      subject: payload.sub,
    };
  };
}
