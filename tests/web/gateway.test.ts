import { it, expect, vi, afterEach } from "vitest";
import { WebGateway } from "../../apps/web/src/client/gateway";
import type { WebAuth } from "../../apps/web/src/client/auth";
afterEach(() => vi.unstubAllGlobals());
it("401 clears current auth and drafts through logout, while late old responses cannot clear a new session", async () => {
  vi.stubGlobal("location", { origin: "https://planner.test" });
  let generation = 1;
  const logout = vi.fn(async () => {
    generation++;
  });
  const auth = {
    get generation() {
      return generation;
    },
    getAccessToken: () => "fixture",
    logout,
  } as unknown as WebAuth;
  vi.stubGlobal("fetch", async () => new Response("{}", { status: 401 }));
  await expect(new WebGateway(auth).session()).rejects.toMatchObject({
    code: "expired",
  });
  expect(logout).toHaveBeenCalledTimes(1);
  let release!: (r: Response) => void;
  vi.stubGlobal(
    "fetch",
    () =>
      new Promise<Response>((r) => {
        release = r;
      }),
  );
  const pending = new WebGateway(auth).session();
  generation++;
  release(new Response("{}", { status: 401 }));
  await expect(pending).rejects.toMatchObject({ code: "expired" });
  expect(logout).toHaveBeenCalledTimes(1);
});
