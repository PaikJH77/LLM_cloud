import { test, expect, chromium } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { login, createProject } from "./helpers";
test("SIGKILL browser restart restores IDB ciphertext only after same-owner online login", async () => {
  const profile = await mkdtemp(join(tmpdir(), "planner-browser-crash-"));
  let child: ChildProcess | undefined;
  async function launch() {
    await rm(join(profile, "DevToolsActivePort"), { force: true });
    child = spawn(
      process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
      [
        "--headless",
        "--no-sandbox",
        "--remote-debugging-port=0",
        "--remote-debugging-address=127.0.0.1",
        "--user-data-dir=" + profile,
        "about:blank",
      ],
      { stdio: "ignore", detached: true },
    );
    let port = "";
    for (let i = 0; i < 100; i++) {
      try {
        port = (
          await readFile(join(profile, "DevToolsActivePort"), "utf8")
        ).split("\n")[0];
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    if (!port) throw new Error("Fixture browser failed");
    return chromium.connectOverCDP("http://127.0.0.1:" + port);
  }
  async function crash() {
    if (child && child.exitCode === null) {
      const exited = new Promise<void>((r) => child!.once("exit", () => r()));
      process.kill(-child.pid!, "SIGKILL");
      await exited;
    }
  }
  try {
    let browser = await launch();
    let page = await browser.contexts()[0].newPage();
    await login(page);
    const name = "Crash " + randomUUID();
    await createProject(page, name);
    await page.getByRole("button", { name: "작업 추가", exact: true }).click();
    await page.getByLabel("새 작업 이름").fill("crash-recover secret");
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const p = await window.planner.session();
          return (
            await window.planner.drafts.load(
              JSON.stringify([p!.issuer, p!.subject]),
            )
          ).length;
        }),
      )
      .toBe(1);
    await crash();
    browser = await launch();
    page = await browser.contexts()[0].newPage();
    await page.goto("http://127.0.0.1:4319/");
    await expect(
      page.getByRole("button", { name: "로그인", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("crash-recover secret", { exact: true }),
    ).toHaveCount(0);
    await login(page);
    await page
      .getByRole("button", { name: "복구: " + name, exact: true })
      .click();
    await expect(page.getByLabel("새 작업 이름")).toHaveValue(
      "crash-recover secret",
    );
    await browser.close();
  } finally {
    await crash();
    await rm(profile, { recursive: true, force: true });
  }
});
