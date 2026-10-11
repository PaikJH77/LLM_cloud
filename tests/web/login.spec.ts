import { test, expect, type Page } from "@playwright/test";
import { login } from "./helpers";
test("actual browser PKCE login, memory tokens, API ownership and logout", async ({
  page,
}) => {
  await login(page);
  await expect(
    page.getByRole("heading", { name: "진행 중 프로젝트" }),
  ).toBeVisible();
  expect(new URL(page.url()).search).toBe("");
  const persisted = await page.evaluate(() =>
    JSON.stringify({
      local: { ...localStorage },
      session: { ...sessionStorage },
    }),
  );
  expect(persisted).not.toMatch(
    /access_token|refresh_token|id_token|code_verifier/,
  );
  await expect(page.getByRole("button", { name: "새 프로젝트" })).toBeEnabled();
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await page.getByRole("button", { name: "보존하고 로그아웃" }).click();
  await expect(
    page.getByRole("button", { name: "로그인", exact: true }),
  ).toBeVisible();
});
test("other valid Keycloak account is refused", async ({ page }) => {
  await login(page, "bob");
  await expect(
    page.getByText("로그인 또는 연결을 완료하지 못했습니다.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "진행 중 프로젝트" }),
  ).toHaveCount(0);
});
test("forged callback is rejected and callback parameters are removed from history", async ({
  page,
}) => {
  await page.goto(
    "/auth/callback?code=invalid-test-code&state=invalid-test-state",
  );
  await expect(
    page.getByText("로그인 또는 연결을 완료하지 못했습니다.", { exact: false }),
  ).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/");
  expect(new URL(page.url()).search).toBe("");
});
test("token expiration clears the screen and prevents using old memory keys", async ({
  page,
}) => {
  await page.clock.install();
  await login(page);
  await expect(
    page.getByRole("heading", { name: "진행 중 프로젝트" }),
  ).toBeVisible();
  await page.clock.fastForward(70000);
  await expect(
    page.getByRole("button", { name: "로그인", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.planner.protection())).toBe(false);
});
