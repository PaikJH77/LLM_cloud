import type { SyncState } from "./types";
const labels = {
  loading: "확인 중",
  saved: "저장됨",
  editing: "미저장 변경안",
  saving: "저장 중",
  failed: "저장 실패 · 편집 잠김",
  offline: "연결 끊김 · 편집 잠김",
  expired: "로그인 만료 · 편집 잠김",
  conflict: "충돌 · 확인 필요",
};
export function StatusBar({
  state,
  onRefresh,
}: {
  state: SyncState;
  onRefresh: () => void;
}) {
  return (
    <div className={"status " + state.status} role="status">
      <span>
        {state.status === "saved" ? "✓" : "⚠"} {labels[state.status]}
      </span>
      <small>
        마지막 확인:{" "}
        {state.lastConfirmedAt
          ? new Date(state.lastConfirmedAt).toLocaleTimeString("ko-KR")
          : "없음"}
      </small>
      {state.error && <span className="error-text">{state.error}</span>}
      <button onClick={onRefresh} disabled={state.status === "saving"}>
        다시 연결 확인
      </button>
    </div>
  );
}
