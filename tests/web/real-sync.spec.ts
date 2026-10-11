import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { login, createProject } from "./helpers";
test("two actual browser clients see changes and enforce atomic conflict and replay", async ({
  page,
  browser,
}) => {
  const other = await browser.newContext();
  const second = await other.newPage();
  try {
    await login(page);
    await login(second);
    const name = "Web sync " + randomUUID();
    await createProject(page, name);
    await second.evaluate(() => window.dispatchEvent(new Event("focus")));
    await second.getByRole("button", { name: new RegExp(name) }).click();
    await expect(
      second.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    const project = await page.evaluate(
      async (name) =>
        (
          await window.planner.listProjects({
            state: "active",
            query: name,
            sort: "updatedDesc",
          })
        )[0].project,
      name,
    );
    const first = {
      requestId: randomUUID(),
      projectId: project.id,
      expectedVersion: project.version,
      operation: {
        type: "updateProject" as const,
        fields: { name: name + " updated", deadline: null },
      },
    };
    const responses = await Promise.all([
      page.evaluate((c) => window.planner.mutate(c), first),
      second.evaluate((c) => window.planner.mutate(c), {
        ...first,
        requestId: randomUUID(),
      }),
    ]);
    expect(responses.map((r) => r.kind).sort()).toEqual([
      "applied",
      "conflict",
    ]);
    const replay = await Promise.all(
      Array.from({ length: 8 }, () =>
        page.evaluate((c) => window.planner.mutate(c), first),
      ),
    );
    for (const r of replay) expect(r).toEqual(responses[0]);
    await expect(
      page.evaluate((c) => window.planner.mutate(c), {
        ...first,
        operation: {
          type: "updateProject" as const,
          fields: { name: "different", deadline: null },
        },
      }),
    ).resolves.toMatchObject({ kind: "rejected", code: "REQUEST_ID_REUSED" });
    await second.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(
      second.getByRole("heading", { name: name + " updated", exact: true }),
    ).toBeVisible();
  } finally {
    await other.close();
  }
});
test("response loss after real commit recovers the original request without duplicate project", async ({
  page,
}) => {
  await login(page);
  let dropped = false;
  await page.route("**/api/commands", async (route) => {
    if (dropped) return route.continue();
    dropped = true;
    await route.fetch();
    await route.abort("connectionreset");
  });
  const name = "Lost response " + randomUUID();
  await page.getByRole("button", { name: "새 프로젝트", exact: true }).click();
  await page.getByLabel("프로젝트 이름", { exact: true }).fill(name);
  await page.getByRole("button", { name: "프로젝트 만들기" }).click();
  await expect(
    page.getByRole("button", { name: "다시 연결 확인" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "다시 연결 확인" }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      async (name) =>
        (
          await window.planner.listProjects({
            state: "active",
            query: name,
            sort: "updatedDesc",
          })
        ).length,
      name,
    ),
  ).toBe(1);
});
test("offline locks editing and a new tab restores encrypted unsent draft after login", async ({
  page,
  context,
}) => {
  await login(page);
  const name = "Draft " + randomUUID();
  await createProject(page, name);
  await page.getByRole("button", { name: "작업 추가", exact: true }).click();
  await page.getByLabel("새 작업 이름").fill("unsent private task");
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
  await context.setOffline(true);
  await expect(page.getByLabel("새 작업 이름")).toBeDisabled();
  await page.close();
  await context.setOffline(false);
  const next = await context.newPage();
  await login(next);
  await next
    .getByRole("button", { name: "복구: " + name, exact: true })
    .click();
  await expect(next.getByLabel("새 작업 이름")).toHaveValue(
    "unsent private task",
  );
});
test("cross-tab logout immediately removes projects and recovered plaintext", async ({
  page,
  context,
}) => {
  await login(page);
  const name = "Logout " + randomUUID();
  await createProject(page, name);
  const next = await context.newPage();
  await login(next);
  await next.getByRole("button", { name: "로그아웃", exact: true }).click();
  await next.getByRole("button", { name: "보존하고 로그아웃" }).click();
  await expect(
    page.getByRole("button", { name: "로그인", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name, exact: true })).toHaveCount(0);
});
