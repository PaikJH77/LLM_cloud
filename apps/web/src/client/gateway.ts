import { ApiClient, GatewayError } from "../../../desktop/src/main/api-client";
import type { WebAuth } from "./auth";
export class WebGateway extends ApiClient {
  constructor(private auth: WebAuth) {
    super(location.origin + "/api", () => auth.getAccessToken());
  }
  override async request<T>(path: string, body?: unknown): Promise<T> {
    const epoch = this.auth.generation;
    let result: T;
    try {
      result = await super.request<T>(path, body);
    } catch (error) {
      if (
        error instanceof GatewayError &&
        error.code === "expired" &&
        epoch === this.auth.generation
      )
        await this.auth.logout();
      throw error;
    }
    if (epoch !== this.auth.generation)
      throw new GatewayError("expired", "로그인이 변경되었습니다");
    return result;
  }
}
