import { chromium, expect } from "@playwright/test";
import { demoPassword } from "../tests/helpers";
async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.goto("http://localhost:3000/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/public-desktop.png",
    fullPage: true,
  });
  await page.goto("http://localhost:3000/login");
  await page.getByLabel("Электронная почта").fill("student@demo.kit.local");
  await page.getByLabel("Пароль", { exact: true }).fill(demoPassword());
  await page.getByRole("button", { name: "Войти в кабинет" }).click();
  await expect(page).toHaveURL(/\/campus$/);
  await expect(
    page.getByText("Загружаем актуальные данные…", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".next-lesson h2")).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/student-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3000/campus/grades");
  await expect(
    page.getByText("Загружаем актуальные данные…", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("table")).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/student-mobile.png",
    fullPage: true,
  });
  await browser.close();
  console.log("DEMO_SCREENSHOTS_OK");
}
main().catch(() => {
  console.error("DEMO_SCREENSHOTS_FAILED");
  process.exitCode = 1;
});
