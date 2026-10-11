import {
  UserManager,
  WebStorageStateStore,
  InMemoryWebStorage,
} from "oidc-client-ts";
import type { PublicConfig } from "../server/app";
export class WebAuth {
  private manager: UserManager;
  private token: string | null = null;
  private expires = 0;
  private epoch = 0;
  onLogout = () => {};
  private channel = new BroadcastChannel("planner-session");
  constructor(config: PublicConfig) {
    this.manager = new UserManager({
      authority: config.issuer,
      client_id: config.clientId,
      redirect_uri: location.origin + "/auth/callback",
      post_logout_redirect_uri: location.origin + "/",
      response_type: "code",
      scope: "openid profile",
      extraQueryParams: { audience: config.audience },
      automaticSilentRenew: false,
      monitorSession: false,
      loadUserInfo: false,
      staleStateAgeInSeconds: 300,
      userStore: new WebStorageStateStore({ store: new InMemoryWebStorage() }),
      stateStore: new WebStorageStateStore({
        store: sessionStorage,
        prefix: "planner.oidc.",
      }),
    });
    this.channel.onmessage = () => this.clear();
    this.manager.events.addAccessTokenExpired(() => this.clear());
  }
  get generation() {
    return this.epoch;
  }
  getAccessToken() {
    return Date.now() < this.expires ? this.token : null;
  }
  async login() {
    await this.manager.clearStaleState();
    await this.manager.signinRedirect({ nonce: crypto.randomUUID() });
  }
  async completeCallback() {
    if (location.pathname !== "/auth/callback") return;
    const epoch = this.epoch,
      url = location.href;
    // Remove credentials from history even when validation fails.
    history.replaceState(null, "", location.origin + "/");
    await this.manager.clearStaleState();
    const user = await this.manager.signinRedirectCallback(url);
    if (this.epoch !== epoch) throw new Error("Session changed during login");
    if (!user.access_token || !user.expires_at)
      throw new Error("Access token required");
    this.token = user.access_token;
    this.expires = user.expires_at * 1000;
  }
  private clear() {
    this.token = null;
    this.expires = 0;
    this.epoch++;
    this.onLogout();
    void this.manager.removeUser();
  }
  async logout() {
    this.clear();
    this.channel.postMessage("logout");
    await this.manager.clearStaleState();
  }
}
