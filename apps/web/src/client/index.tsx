import { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../../desktop/src/renderer/App";
import "../../../desktop/src/renderer/styles.css";
import { createWebBridge } from "./bridge";
import type { PublicConfig } from "../server/app";
async function main() {
  const response = await fetch("/config", {
    cache: "no-store",
    redirect: "error",
  });
  if (!response.ok) throw new Error("Configuration unavailable");
  const bridge = await createWebBridge((await response.json()) as PublicConfig);
  window.planner = bridge;
  let recovered = (await bridge.recovery()?.recoveries()) ?? [];
  function Root() {
    const [drafts, setDrafts] = useState(() => {
      const initial = recovered;
      recovered = [];
      return initial;
    });
    useEffect(() => {
      const clear = () => {
        setDrafts([]);
        setRevision((v) => v + 1);
      };
      window.addEventListener("planner-session-ended", clear);
      return () => window.removeEventListener("planner-session-ended", clear);
    }, []);
    const [revision, setRevision] = useState(0),
      [error, setError] = useState("");
    return (
      <>
        {drafts.length > 0 && (
          <details className="card">
            <summary>
              이 브라우저의 보호된 변경안 선택 ({drafts.length})
            </summary>
            <p>
              같은 프로젝트의 변경안이 여러 개면 복구할 항목을 선택한 뒤
              목록에서 프로젝트를 여세요.
            </p>
            {drafts.map(({ id, draft }) => (
              <button
                key={id}
                onClick={() =>
                  void bridge
                    .recovery()!
                    .select(id)
                    .then(() => setRevision((v) => v + 1))
                    .catch(() =>
                      setError(
                        "변경안을 복구하지 못했습니다. 다시 로그인하세요.",
                      ),
                    )
                }
              >
                {draft.editedFields.kind !== "operation"
                  ? draft.editedFields.name
                  : (draft.base?.project.name ?? "미저장 변경")}{" "}
                · {new Date(draft.savedLocallyAt).toLocaleString()}
              </button>
            ))}
            {error && <p role="alert">{error}</p>}
          </details>
        )}
        <App key={revision} />
      </>
    );
  }
  createRoot(document.getElementById("root")!).render(<Root />);
}
void main().catch(() => {
  const root = document.getElementById("root")!;
  root.textContent =
    "로그인 또는 연결을 완료하지 못했습니다. 보호된 초안은 보존됩니다. ";
  const link = document.createElement("a");
  link.href = "/";
  link.textContent = "다시 로그인";
  root.append(link);
});
