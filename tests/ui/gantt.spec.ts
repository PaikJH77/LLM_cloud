import { test, expect } from "@playwright/test";
async function setup(page: any) {
  await page.goto("/");
  await page.getByRole("button", { name: "새 프로젝트", exact: true }).click();
  await page.getByLabel("프로젝트 이름", { exact: true }).fill("차트 프로젝트");
  await page.getByRole("button", { name: "프로젝트 만들기" }).click();
  await page.getByRole("button", { name: "작업 추가", exact: true }).click();
  await page.getByLabel("새 작업 이름").fill("실험");
  await page.getByLabel("새 작업 시작일").fill("2028-02-28");
  await page.getByLabel("새 작업 종료일").fill("2028-03-01");
  await page.getByRole("button", { name: "작업 만들기" }).click();
  await expect(page.getByLabel("실험 시작일", { exact: true })).toHaveValue(
    "2028-02-28",
  );
}
test("table dates, inclusive bars, move, resize and Escape share one calendar model", async ({
  page,
}) => {
  await setup(page);
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.screenshot({
    path: "docs/verification/ui-mock.png",
    fullPage: true,
  });
  const bar = page.getByRole("button", { name: "실험 막대 이동" });
  await bar.scrollIntoViewIfNeeded();
  let box = (await bar.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 32, box.y + 10);
  await page.mouse.up();
  await expect(page.getByLabel("실험 시작일", { exact: true })).toHaveValue(
    "2028-02-29",
  );
  await expect(page.getByLabel("실험 종료일", { exact: true })).toHaveValue(
    "2028-03-02",
  );
  const end = page.getByRole("button", { name: "실험 종료일 조절" });
  box = (await end.boundingBox())!;
  await page.mouse.move(box.x + 3, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 35, box.y + 10);
  await page.mouse.up();
  await expect(page.getByLabel("실험 종료일", { exact: true })).toHaveValue(
    "2028-03-03",
  );
  const before = await page.evaluate(() =>
    (window as any).mockControls.requests(),
  );
  box = (await bar.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 64, box.y + 10);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(
    await page.evaluate(() => (window as any).mockControls.requests()),
  ).toBe(before);
  await page.getByLabel("실험 진행률", { exact: true }).fill("0");
  await page.getByLabel("실험 진행률", { exact: true }).press("Tab");
  await expect(page.getByText("시작 전", { exact: true })).toBeVisible();
  await expect(page.getByText("0% · 1/1 입력")).toBeVisible();
  await page.getByLabel("실험 진행률", { exact: true }).fill("");
  await page.getByLabel("실험 진행률", { exact: true }).press("Tab");
  await expect(page.getByText("미산정 · 0/1 입력")).toBeVisible();
});
test("undated tasks have no bar, archive locks dates, day step works on weekly axis", async ({
  page,
}) => {
  await setup(page);
  await page.getByLabel("시간축").selectOption("week");
  await page.getByRole("button", { name: "실험 막대 이동" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByLabel("실험 시작일", { exact: true })).toHaveValue(
    "2028-02-29",
  );
  await page.getByRole("button", { name: "작업 추가", exact: true }).click();
  await page.getByLabel("새 작업 이름").fill("미정 작업");
  await page.getByRole("button", { name: "작업 만들기" }).click();
  await expect(page.getByText("일정 미정").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "미정 작업 막대 이동" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "보관", exact: true }).click();
  await expect(page.getByLabel("실험 시작일", { exact: true })).toBeDisabled();
});
