import { app, BrowserWindow, safeStorage, shell, dialog } from "electron";
import squirrelStartup from "electron-squirrel-startup";
import { join } from "node:path";
import type { Principal } from "../../../../packages/core/src/model";
import { ProtectedDraftStore } from "./draft-store";
import { ApiClient } from "./api-client";
import { browserLogin } from "./auth";
import { registerIpc } from "./ipc";
import { secureUrl } from "../../../api/src/auth";
declare const MAIN_WINDOW_WEBPACK_ENTRY: string,
  MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;
if (squirrelStartup) app.quit();
app.setAppUserModelId("com.personal.projectplanner");
let store: ProtectedDraftStore | undefined;
let closing = false;
app.on("before-quit", (event) => {
  if (store && !closing) {
    event.preventDefault();
    closing = true;
    void store.flush().then(() => app.quit());
  }
});
app.on("window-all-closed", () => app.quit());
if (!squirrelStartup)
  void app
    .whenReady()
    .then(async () => {
      let token: string | null = null,
        principal: Principal | null = null,
        generation = 0,
        loginPending: Promise<Principal> | null = null;
      const apiUrl = process.env.PLANNER_API_URL ?? "",
        issuer = process.env.PLANNER_OIDC_ISSUER ?? "",
        clientId = process.env.PLANNER_OIDC_CLIENT_ID ?? "";
      const allowLoopbackHttp =
        !app.isPackaged && process.env.NODE_ENV === "test";
      const api = new ApiClient(apiUrl, () => token);
      store = new ProtectedDraftStore(join(app.getPath("userData"), "drafts"), {
        available: () =>
          safeStorage.isEncryptionAvailable() &&
          (process.platform !== "linux" ||
            safeStorage.getSelectedStorageBackend() !== "basic_text"),
        encrypt: (text) => safeStorage.encryptString(text),
        decrypt: (buffer) => safeStorage.decryptString(buffer),
      });
      const win = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 900,
        minHeight: 650,
        backgroundColor: "#edf2f7",
        webPreferences: {
          preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });
      win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      win.webContents.on("will-navigate", (event) => event.preventDefault());
      win.webContents.session.setPermissionRequestHandler((_w, _p, callback) =>
        callback(false),
      );
      const session = {
        get: () => principal,
        epoch: () => generation,
        logout: () => {
          generation++;
          token = null;
          principal = null;
        },
        login: () => {
          if (loginPending) return loginPending;
          loginPending = (async () => {
            secureUrl(apiUrl, allowLoopbackHttp);
            secureUrl(issuer, allowLoopbackHttp);
            if (!clientId) throw new Error("OIDC 클라이언트 설정이 필요합니다");
            const thisGeneration = ++generation;
            token = null;
            principal = null;
            const nextToken = await browserLogin(
              { issuer, clientId, allowLoopbackHttp },
              (url) => shell.openExternal(url),
            );
            if (thisGeneration !== generation)
              throw new Error("로그인이 취소되었습니다");
            token = nextToken;
            try {
              principal = await api.session();
              return principal;
            } catch (e) {
              token = null;
              throw e;
            }
          })().finally(() => (loginPending = null));
          return loginPending;
        },
      };
      registerIpc(win, MAIN_WINDOW_WEBPACK_ENTRY, api, store, session);
      await win.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
    })
    .catch(() => {
      dialog.showErrorBox(
        "Project Planner",
        "앱을 시작할 수 없습니다. 설정과 보호 저장소를 확인하세요.",
      );
      app.quit();
    });
