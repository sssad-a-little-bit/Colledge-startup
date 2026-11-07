import { test, expect } from "@playwright/test";
import { demoPassword } from "../helpers";
test("медленный ответ сохраняет состояние загрузки; внешние ресурсы не запрашиваются", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (!["localhost", "127.0.0.1"].includes(u.hostname))
      external.push(u.origin);
  });
  await page.route("**/api/news", async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await page.goto("/news");
  await expect(page.getByRole("status")).toContainText("Загружаем");
  await expect(page.locator(".news-card").first()).toBeVisible();
  expect(external).toEqual([]);
});
test("разрыв запроса личного расписания показывает ошибку, повтор восстанавливает данные", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Электронная почта").fill("student@demo.kit.local");
  await page.getByLabel("Пароль", { exact: true }).fill(demoPassword());
  await page.getByRole("button", { name: "Войти в кабинет" }).click();
  await expect(page).toHaveURL(/\/campus$/);
  let fail = true;
  await page.route("**/api/portal?resource=schedule*", async (route) => {
    if (fail) await route.abort("failed");
    else await route.continue();
  });
  await page.goto("/campus/schedule");
  await expect(page.locator(".error-box[role=alert]")).toContainText(
    "Данные временно недоступны",
  );
  fail = false;
  await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await expect(page.locator(".error-box[role=alert]")).toHaveCount(0);
  await expect(
    page.getByText("Загружаем актуальные данные…", { exact: true }),
  ).toHaveCount(0);
});
