"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  GraduationCap,
  Layers3,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
export function Brand() {
  return (
    <Link href="/" className="brand">
      <span className="brand-mark">
        <Layers3 size={24} />
      </span>
      <span>
        КИТ<span className="brand-light"> Campus</span>
        <small>УЧЕБНЫЙ ПОРТАЛ</small>
      </span>
    </Link>
  );
}
export function DemoNotice() {
  return null;
}
function Header() {
  return (
    <>
      <DemoNotice />
      <header className="public-header">
        <Brand />
        <nav aria-label="Основная навигация">
          <Link href="/news">Новости</Link>
          <Link href="/login" className="button primary">
            Войти в кабинет <ArrowRight size={16} />
          </Link>
        </nav>
      </header>
    </>
  );
}
type News = {
  id: string;
  title: string;
  body: string;
  category: string;
  publishedAt: string;
};
function useNews(id?: string) {
  const [data, setData] = useState<News[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(id ? `/api/news/${encodeURIComponent(id)}` : "/api/news", {
      cache: "no-store",
    })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok)
          throw Error(j.error?.message || "Новости временно недоступны");
        return j.data;
      })
      .then((d) => {
        if (alive) {
          setData(Array.isArray(d) ? d : d ? [d] : []);
          setError("");
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id, revision]);
  return { data, error, loading, retry: () => setRevision((x) => x + 1) };
}
export function PublicHome() {
  const { data, error, loading, retry } = useNews();
  return (
    <>
      <Header />
      <main id="main" className="public-main">
        <section className="hero">
          <div>
            <div className="eyebrow">
              <span /> ПАВЛОДАР · УЧЕБНЫЙ ПРОЕКТ
            </div>
            <h1>
              Учебный день.
              <br />
              <span>Всё на своих местах.</span>
            </h1>
            <p>
              Расписание, контрольные и оценки — в одном пространстве. Меньше
              поисков в переписках, больше времени на учёбу.
            </p>
            <div className="hero-actions">
              <Link href="/login" className="button primary large">
                Открыть мой кабинет <ArrowRight size={18} />
              </Link>
              <Link href="/news" className="button ghost large">
                Новости портала
              </Link>
            </div>
            <div className="hero-foot">
              <ShieldCheck size={17} /> Личный доступ для студентов и
              преподавателей
            </div>
          </div>
          <div className="hero-preview">
            <div className="preview-top">
              <div className="preview-icon">
                <CalendarDays size={22} />
              </div>
              <span>
                Мой учебный день<small>Ваша группа. Ваши занятия.</small>
              </span>
              <span className="chip blue">Всё под рукой</span>
            </div>
            <div className="preview-lesson">
              <span className="tiny-label">РАСПИСАНИЕ</span>
              <h3>Знайте, что дальше</h3>
              <p>
                Предмет, время и аудитория
                <br />
                без лишних переходов
              </p>
              <div className="preview-line">
                <span />
                <span />
                <span />
              </div>
            </div>
            <div className="preview-bottom">
              <div>
                <Check size={17} />
                <span>
                  Изменения занятий<small>С историей и уведомлениями</small>
                </span>
              </div>
              <div>
                <BookOpen size={17} />
                <span>
                  Результаты работ<small>Доступны только вам</small>
                </span>
              </div>
            </div>
            <div className="floating-note">
              <Sparkles size={19} />
              <span>
                Учёба — в фокусе<small>Без обязательных внешних сервисов</small>
              </span>
            </div>
          </div>
        </section>
        <section className="feature-grid">
          <div>
            <CalendarDays size={22} />
            <h3>Актуальное расписание</h3>
            <p>Пары на день и неделю, переносы и замены с понятной историей.</p>
          </div>
          <div>
            <BookOpen size={22} />
            <h3>Понятный прогресс</h3>
            <p>
              Контрольные заранее, оценки после проверки. Всё связано с вашим
              предметом.
            </p>
          </div>
          <div>
            <ShieldCheck size={22} />
            <h3>Каждому — своё</h3>
            <p>
              Студенты видят свои данные, преподаватели работают со своими
              группами.
            </p>
          </div>
        </section>
        <section className="public-news">
          <div className="section-title">
            <div>
              <span className="eyebrow">ЖИЗНЬ ПОРТАЛА</span>
              <h2>Последние новости</h2>
            </div>
            <Link href="/news" className="text-link">
              Все новости <ArrowRight size={16} />
            </Link>
          </div>
          {loading ? (
            <p className="muted">Загружаем новости…</p>
          ) : error ? (
            <div className="error-box">
              {error} <button onClick={retry}>Повторить</button>
            </div>
          ) : data.length ? (
            <div className="news-grid">
              {data.slice(0, 3).map((n, i) => (
                <NewsCard key={n.id} n={n} index={i} />
              ))}
            </div>
          ) : (
            <p className="muted">Опубликованных новостей пока нет.</p>
          )}
        </section>
        <section className="public-callout">
          <GraduationCap size={30} />
          <div>
            <h2>Одно пространство для учебного дня</h2>
            <p>
              Расписание, оценки, новости и кружки — в вашем личном кабинете.
            </p>
          </div>
          <Link href="/login" className="button primary">
            Войти <ArrowRight size={16} />
          </Link>
        </section>
      </main>
      <Footer />
    </>
  );
}
function NewsCard({ n, index = 0 }: { n: News; index?: number }) {
  return (
    <Link href={`/news/${n.id}`} className="news-card">
      <div className={`news-art art-${index % 3}`}>
        <span>{n.category || "Новости"}</span>
        {index % 3 === 0 ? (
          <CalendarDays size={56} />
        ) : index % 3 === 1 ? (
          <GraduationCap size={62} />
        ) : (
          <BookOpen size={56} />
        )}
      </div>
      <div className="news-card-body">
        <span className="tiny-label">
          {n.publishedAt
            ? new Intl.DateTimeFormat("ru", {
                day: "numeric",
                month: "long",
                timeZone: "Asia/Almaty",
              }).format(new Date(n.publishedAt))
            : "Публикация"}
        </span>
        <h3>{n.title}</h3>
        <p>{n.body?.slice(0, 120)}</p>
        <span className="text-link">
          Читать <ChevronRight size={15} />
        </span>
      </div>
    </Link>
  );
}
export function PublicNews({ id }: { id?: string }) {
  const { data, error, loading, retry } = useNews(id);
  return (
    <>
      <Header />
      <main id="main" className="public-main news-page">
        <Link href={id ? "/news" : "/"} className="breadcrumb">
          ← {id ? "Все новости" : "Главная"}
        </Link>
        {!id && (
          <>
            <span className="eyebrow">ЖИЗНЬ ПОРТАЛА</span>
            <h1>Новости и объявления</h1>
            <p className="muted">Новости учебной жизни и важные объявления.</p>
          </>
        )}
        {loading ? (
          <p role="status">Загружаем…</p>
        ) : error ? (
          <div className="error-box" role="alert">
            {error}
            <button onClick={retry}>Повторить</button>
          </div>
        ) : id ? (
          data[0] ? (
            <article className="article">
              <span className="chip blue">{data[0].category}</span>
              <h1>{data[0].title}</h1>
              <div className="muted">
                {data[0].publishedAt &&
                  new Date(data[0].publishedAt).toLocaleDateString("ru-RU", {
                    timeZone: "Asia/Almaty",
                  })}
              </div>
              <div className="article-body">{data[0].body}</div>
            </article>
          ) : (
            <p>Публикация недоступна.</p>
          )
        ) : (
          <div className="news-grid">
            {data.map((n, i) => (
              <NewsCard key={n.id} n={n} index={i} />
            ))}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError("");
    try {
      const r = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (r?.ok) window.location.href = "/campus";
      else
        setError(
          "Не удалось войти. Проверьте данные или повторите попытку позже.",
        );
    } catch {
      setError("Сервис входа недоступен. Попробуйте ещё раз.");
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <DemoNotice />
      <div className="login-layout">
        <section className="login-story">
          <Brand />
          <div>
            <span className="eyebrow">ДОБРО ПОЖАЛОВАТЬ</span>
            <h1>
              Меньше суеты.
              <br />
              Больше ясности.
            </h1>
            <p>
              Ваше расписание, контрольные и результаты — в одном учебном
              пространстве.
            </p>
            <div className="login-points">
              <span>
                <Check size={18} /> Изменения, которые вы не пропустите
              </span>
              <span>
                <Check size={18} /> Только ваши учебные данные
              </span>
              <span>
                <Check size={18} /> Понятный план на день и неделю
              </span>
            </div>
          </div>
          <small>КИТ Campus · Павлодар · Учебный портал</small>
        </section>
        <main id="main" className="login-main">
          <Link href="/" className="breadcrumb">
            ← На главную
          </Link>
          <form className="login-card" onSubmit={submit}>
            <div className="login-icon">
              <LockKeyhole size={25} />
            </div>
            <h2>Вход в кабинет</h2>
            <p className="muted">Продолжим ваш учебный день</p>
            <label>
              Электронная почта
              <input
                type="email"
                name="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@kit.local"
              />
            </label>
            <label>
              Пароль
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Введите пароль"
              />
            </label>
            {error && (
              <p className="error-box" role="alert">
                {error}
              </p>
            )}
            <button className="button primary large" disabled={pending}>
              {pending ? "Входим…" : "Войти в кабинет"}{" "}
              {!pending && <ArrowRight size={17} />}
            </button>
            <p className="login-help">
              Учётную запись создаёт администратор.
              <br />
              Если не получается войти, обратитесь к администратору.
            </p>
          </form>
          <div className="login-caption">
            <ShieldCheck size={15} /> Защищённый доступ к учебной информации
          </div>
        </main>
      </div>
    </>
  );
}
function Footer() {
  return (
    <footer className="public-footer">
      <Brand />
      <p>Расписание, оценки и кружки</p>
      <span>Павлодар, Казахстан</span>
    </footer>
  );
}
