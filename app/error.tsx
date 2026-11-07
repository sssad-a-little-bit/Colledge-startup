"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="loading-page">
      <div className="empty">
        <h1>Не удалось открыть страницу</h1>
        <p>
          Повторите попытку. Изменения, сохранённые ранее, останутся в базе
          данных.
        </p>
        <button className="button primary" onClick={reset}>
          Попробовать снова
        </button>
      </div>
    </main>
  );
}
