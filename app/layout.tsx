import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "КИТ Campus · Учебный портал",
  description:
    "Демонстрационный учебный портал. Данные вымышлены. Проект не является официальным сайтом колледжа.",
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
