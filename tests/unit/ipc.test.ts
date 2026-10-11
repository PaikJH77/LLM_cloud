import { it, expect, vi } from "vitest";
import { registerIpc } from "../../apps/desktop/src/main/ipc";
import { owner, other } from "../support/fixtures";
const { capture } = vi.hoisted(() => ({ capture: { handler: null as any } }));
vi.mock("electron", () => ({
  ipcMain: { handle: (_name: string, fn: any) => (capture.handler = fn) },
}));
it("old account response cannot log out the newly authenticated account", async () => {
  const frame = { url: "file:///app/index.html" },
    win = { webContents: { id: 1, mainFrame: frame } };
  let epoch = 1,
    p = owner,
    logouts = 0,
    release!: (v: any) => void;
  registerIpc(
    win as any,
    frame.url,
    { getProject: () => new Promise((r) => (release = r)) } as any,
    {} as any,
    {
      get: () => p,
      epoch: () => epoch,
      login: async () => p,
      logout: () => {
        logouts++;
        epoch++;
      },
    },
  );
  const pending = capture.handler(
    { sender: { id: 1 }, senderFrame: frame },
    "getProject",
    "33333333-3333-4333-8333-333333333333",
  );
  epoch++;
  p = other;
  release({ project: { name: "private old account" } });
  const response = await pending;
  expect(response.ok).toBe(false);
  expect(logouts).toBe(0);
});
