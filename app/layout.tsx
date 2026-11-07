import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "КИТ Campus · Учебный портал",
  description:
    "КИТ Campus — расписание, оценки, новости и кружки в одном учебном портале.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>
        <a className="skip-link" href="#main">
          Перейти к содержимому
        </a>
        {children}
      </body>
    </html>
  );
}
