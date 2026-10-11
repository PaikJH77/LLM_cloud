import type {
  PlannerGateway,
  Command,
  MutationResult,
  ProjectListFilter,
  Snapshot,
  ProjectListItem,
  Principal,
} from "../../../../packages/core/src/model";
export class GatewayError extends Error {
  constructor(
    public code: "offline" | "expired" | "failed",
    message: string,
  ) {
    super(message);
  }
}
export class ApiClient implements PlannerGateway {
  constructor(
    private baseUrl: string,
    private token: () => string | null,
  ) {}
  async request<T>(path: string, body?: unknown): Promise<T> {
    const token = this.token();
    if (!token) throw new GatewayError("expired", "로그인이 필요합니다");
    let r: Response;
    try {
      r = await fetch(this.baseUrl + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
        redirect: "error",
      });
    } catch {
      throw new GatewayError("offline", "서버에 연결할 수 없습니다");
    }
    if (r.status === 401)
      throw new GatewayError("expired", "로그인이 만료되었습니다");
    const data = await r.json();
    if (
      !r.ok &&
      !(path === "/commands" && [404, 409, 422].includes(r.status) && data.kind)
    )
      throw new GatewayError(
        "failed",
        r.status === 404 ? "NOT_FOUND" : "서버 요청에 실패했습니다",
      );
    return data as T;
  }
  listProjects(filter: ProjectListFilter) {
    return this.request<ProjectListItem[]>(
      "/projects?" + new URLSearchParams(filter),
    );
  }
  getProject(id: string) {
    return this.request<Snapshot>("/projects/" + encodeURIComponent(id));
  }
  mutate(c: Command) {
    return this.request<MutationResult>("/commands", c);
  }
  requestStatus(id: string) {
    return this.request<MutationResult | null>(
      "/requests/" + encodeURIComponent(id),
    );
  }
  session() {
    return this.request<Principal>("/session");
  }
}
