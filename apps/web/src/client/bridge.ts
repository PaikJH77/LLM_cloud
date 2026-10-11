import type { PlannerBridge } from "../../../desktop/src/bridge";
import type {
  DraftStore,
  Principal,
} from "../../../../packages/core/src/model";
import { principalKey } from "../../../../packages/core/src/contracts";
import { WebAuth } from "./auth";
import { WebGateway } from "./gateway";
import { BrowserDraftStore } from "./draft-store";
import type { PublicConfig } from "../server/app";
export async function createWebBridge(
  config: PublicConfig,
): Promise<PlannerBridge & { recovery: () => BrowserDraftStore | null }> {
  const auth = new WebAuth(config);
  await auth.completeCallback();
  const gateway = new WebGateway(auth);
  let principal: Principal | null = null,
    store: BrowserDraftStore | null = null;
  auth.onLogout = () => {
    principal = null;
    store = null;
    window.dispatchEvent(new Event("planner-session-ended"));
  };
  if (auth.getAccessToken()) {
    principal = await gateway.session();
    const epoch = auth.generation;
    try {
      const payload = await gateway.request<{
        key: string;
        keyVersion: number;
        environment: string;
      }>("/draft-key", {});
      const key = await crypto.subtle.importKey(
        "raw",
        Uint8Array.from(atob(payload.key), (c) => c.charCodeAt(0)),
        "AES-GCM",
        false,
        ["encrypt", "decrypt"],
      );
      if (auth.generation !== epoch) throw new Error("Session changed");
      const identity = principalKey(principal);
      store = new BrowserDraftStore({
        namespace: JSON.stringify([
          location.origin,
          payload.environment,
          principal.issuer,
          principal.subject,
        ]),
        principalKey: identity,
        key,
        keyVersion: payload.keyVersion,
        isCurrent: () => auth.generation === epoch && !!auth.getAccessToken(),
      });
      await store.records();
    } catch {
      store = null;
    }
  }
  const protectedStore = () => {
    if (!store)
      throw new Error("보호 저장소를 사용할 수 없어 편집이 잠겼습니다.");
    return store;
  };
  const drafts: DraftStore = {
    save: (d) => protectedStore().save(d),
    load: (p) => protectedStore().load(p),
    remove: (p, id) => protectedStore().remove(p, id),
  };
  return {
    listProjects: (f) => gateway.listProjects(f),
    getProject: (id) => gateway.getProject(id),
    mutate: (c) => gateway.mutate(c),
    requestStatus: (id) => gateway.requestStatus(id),
    login: async () => {
      await auth.login();
      return new Promise<Principal>(() => {});
    },
    session: async () => {
      if (!auth.getAccessToken()) return null;
      principal = await gateway.session();
      return principal;
    },
    protection: async () => !!store && !!auth.getAccessToken(),
    drafts,
    recovery: () => store,
    logout: async (choice) => {
      if (choice === "discard" && store) await store.discardOwned();
      if (choice === "keep" && store) await store.flush();
      await auth.logout();
    },
  };
}
