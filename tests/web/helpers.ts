import { expect, type Page } from "@playwright/test";
export async function login(page: Page, user = "alice") {
  await page.goto("http://127.0.0.1:4319/");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.waitForFunction(
    () =>
      !!document.querySelector("#username") ||
      document.querySelector("h1")?.textContent === "진행 중 프로젝트",
  );
  if (await page.locator("#username").isVisible()) {
    await page.locator("#username").fill(user);
    await page.locator("#password").fill("test-only-" + user);
    await page.locator("#kc-login").click();
  }
}
export async function createProject(page: Page, name: string) {
  await page.getByRole("button", { name: "새 프로젝트", exact: true }).click();
  await page.getByLabel("프로젝트 이름", { exact: true }).fill(name);
  await page.getByRole("button", { name: "프로젝트 만들기" }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}
