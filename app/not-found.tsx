import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main" className="loading-page">
      <div className="empty">
        <h1>Страница не найдена</h1>
        <p>Проверьте адрес или вернитесь в портал.</p>
        <Link className="button primary" href="/campus">
          В кабинет
        </Link>
      </div>
    </main>
  );
}
