import { it, expect } from "vitest";
import { createServer } from "node:http";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { createAuthenticator } from "../../apps/api/src/auth";
it("rejects independently signed wrong issuer/audience/expired tokens from a known JWKS", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256"),
    jwk = await exportJWK(publicKey);
  let issuer = "";
  const server = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify(
        req.url === "/jwks"
          ? { keys: [{ ...jwk, kid: "test", alg: "RS256" }] }
          : { issuer, jwks_uri: issuer + "/jwks" },
      ),
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  issuer = "http://127.0.0.1:" + (server.address() as any).port;
  try {
    let dbCalls = 0;
    const auth = await createAuthenticator({
      db: {
        query: async () => {
          dbCalls++;
          return { rows: [{ id: "owner" }] };
        },
      } as any,
      issuer,
      audience: "api",
      allowLoopbackHttp: true,
    });
    for (const scenario of ["issuer", "audience", "expired"]) {
      const token = await new SignJWT({})
        .setProtectedHeader({ alg: "RS256", kid: "test" })
        .setIssuer(scenario === "issuer" ? issuer + "/wrong" : issuer)
        .setAudience(scenario === "audience" ? "wrong" : "api")
        .setSubject("subject")
        .setIssuedAt()
        .setExpirationTime(scenario === "expired" ? 0 : "1h")
        .sign(privateKey);
      await expect(auth(token)).rejects.toThrow();
    }
    expect(dbCalls).toBe(0);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
