import { test, expect } from "@playwright/test";
import { demoPassword } from "../helpers";

test("публичная главная, новости и вход доступны с клавиатуры", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".demo-notice")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Войти в кабинет", exact: false }).first(),
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
  await page
    .getByRole("link", { name: "Новости портала", exact: true })
    .click();
  await expect(page).toHaveURL(/\/news$/);
  await expect(
    page.getByRole("heading", { name: "Новости и объявления" }),
  ).toBeVisible();
  await page.goto("/login");
  await page.getByLabel("Электронная почта").focus();
  await page.keyboard.type("student@demo.kit.local");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Пароль", { exact: true })).toBeFocused();
  await page.keyboard.type(demoPassword());
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Войти в кабинет" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/campus$/, { timeout: 20000 });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: `test-results/student-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test("студент открывает расписание и оценки напрямую после обновления", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Электронная почта").fill("student@demo.kit.local");
  await page.getByLabel("Пароль", { exact: true }).fill(demoPassword());
  await page.getByRole("button", { name: "Войти в кабинет" }).click();
  await expect(page).toHaveURL(/\/campus$/, { timeout: 20000 });
  for (const path of [
    "/campus/schedule",
    "/campus/assessments",
    "/campus/grades",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(
      page.getByText("Загружаем актуальные данные…", { exact: true }),
    ).toHaveCount(0, { timeout: 15000 });
    await expect(page.locator(".error-box[role=alert]")).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(
      page.getByText("Загружаем актуальные данные…", { exact: true }),
    ).toHaveCount(0, { timeout: 15000 });
    await expect(page.locator(".error-box[role=alert]")).toHaveCount(0);
    await expect
      .poll(async () =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      )
      .toBe(true);
  }
});

test("ошибка загрузки публичных новостей видна и повтор восстанавливает экран", async ({
  page,
}) => {
  let failed = true;
  await page.route("**/api/news", async (route) => {
    if (failed)
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            message: "Новости временно недоступны",
            requestId: "synthetic-browser-test",
          },
        }),
      });
    else await route.continue();
  });
  await page.goto("/news");
  await expect(page.locator(".error-box[role=alert]")).toContainText(
    "Новости временно недоступны",
  );
  failed = false;
  await page.getByRole("button", { name: "Повторить" }).click();
  await expect(page.locator(".error-box[role=alert]")).toHaveCount(0);
});

test("преподаватель сохраняет оценку в журнале, студент получает её после нового входа", async ({
  page,
  context,
}) => {
  const workType = `E2E ${test.info().project.name} ${Date.now()}`;
  await page.goto("/login");
  await page.getByLabel("Электронная почта").fill("teacher@demo.kit.local");
  await page.getByLabel("Пароль", { exact: true }).fill(demoPassword());
  await page.getByRole("button", { name: "Войти в кабинет" }).click();
  await expect(page).toHaveURL(/\/campus$/, { timeout: 20000 });
  await page.goto("/campus/grades");
  await expect(
    page.getByRole("heading", { name: "Учебный журнал" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Выставить оценку" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog
    .getByLabel("Предмет, группа и период", { exact: false })
    .selectOption("demo-assignment-1");
  await dialog
    .getByLabel("Студент", { exact: false })
    .selectOption("demo-student");
  await dialog.getByLabel("Тип записи", { exact: false }).selectOption("SCORE");
  await expect(
    dialog.getByLabel("Шкала оценивания", { exact: false }),
  ).toHaveValue("demo100");
  await dialog.getByLabel(/^Балл/).fill("86");
  await dialog.getByLabel("Вид работы", { exact: false }).fill(workType);
  await dialog.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Оценка сохранена", {
    timeout: 20000,
  });
  await expect(page.getByText(workType, { exact: false })).toBeVisible();
  await page.screenshot({
    path: `test-results/journal-${test.info().project.name}.png`,
    fullPage: true,
  });
  await context.clearCookies();
  await page.goto("/login");
  await page.getByLabel("Электронная почта").fill("student@demo.kit.local");
  await page.getByLabel("Пароль", { exact: true }).fill(demoPassword());
  await page.getByRole("button", { name: "Войти в кабинет" }).click();
  await expect(page).toHaveURL(/\/campus$/, { timeout: 20000 });
  await page.goto("/campus/grades");
  await page.reload();
  await expect(page.getByText(workType, { exact: false })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Выставить оценку" }),
  ).toHaveCount(0);
});

test("администратор создаёт группу через доступный диалог, результат сохраняется после перезагрузки", async ({
  page,
}) => {
  const name = `E2E-${test.info().project.name}-${Date.now()}`;
  await page.goto("/login");
  await page.getByLabel("Электронная почта").fill("admin@demo.kit.local");
  await page.getByLabel("Пароль", { exact: true }).fill(demoPassword());
  await page.getByRole("button", { name: "Войти в кабинет" }).click();
  await expect(page).toHaveURL(/\/campus$/, { timeout: 20000 });
  await page.goto("/campus/admin");
  await page.getByRole("tab", { name: "Справочники", exact: true }).click();
  await page.getByRole("button", { name: "Добавить группу" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Название группы", { exact: false }).fill(name);
  await dialog.getByLabel("Курс", { exact: false }).fill("2");
  await dialog
    .getByLabel("Образовательная программа", { exact: false })
    .fill("Синтетическая программа E2E");
  await dialog.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Данные сохранены", {
    timeout: 20000,
  });
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "Справочники", exact: true }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await page.screenshot({
    path: `test-results/admin-${test.info().project.name}.png`,
    fullPage: true,
  });
});
