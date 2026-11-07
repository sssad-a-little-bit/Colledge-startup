"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Crosshair,
  Dumbbell,
  GraduationCap,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { date, PageHeading, Row, State, Toast } from "./ui";
import styles from "./clubs.module.css";

type Status = "PENDING" | "APPROVED" | "DECLINED";
type Application = {
  id: string;
  clubId: string;
  status: Status;
  message: string;
  createdAt: string;
  student?: { id: string; name: string; email: string };
  club?: { id: string; name: string };
};
type Club = {
  id: string;
  name: string;
  description: string;
  category: string;
  schedule: string;
  location: string;
  teacher: { id: string; name: string };
  application: Application | null;
  applicantCount: number;
};
type ClubData = { clubs: Club[]; applications: Application[] };
const statuses: Record<Status, { title: string; detail: string }> = {
  PENDING: {
    title: "Заявка на рассмотрении",
    detail: "Руководитель получил вашу заявку. Решение появится здесь.",
  },
  APPROVED: {
    title: "Вы записаны",
    detail: "Заявка одобрена. Ждём вас на занятии!",
  },
  DECLINED: {
    title: "Заявка отклонена",
    detail: "Уточните у руководителя возможность записи на следующие занятия.",
  },
};

function clubIcon(name: string) {
  if (/кибер|безопас|програм/i.test(name)) return ShieldCheck;
  if (/стрель/i.test(name)) return Crosshair;
  if (/атлет|бокс|спорт/i.test(name)) return Dumbbell;
  return Sparkles;
}

async function clubsRequest(body?: Record<string, string>) {
  const response = await fetch("/api/clubs", {
    ...(body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" as const }),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error?.message || "Не удалось выполнить действие");
  return result.data;
}

export function Clubs({ user }: { user: Row }) {
  const [data, setData] = useState<ClubData>({ clubs: [], applications: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [selected, setSelected] = useState<Club | null>(null);
  const [toast, setToast] = useState("");
  const [reviewPending, setReviewPending] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [applicationStatus, setApplicationStatus] = useState("PENDING");
  const [applicationClub, setApplicationClub] = useState("");
  const isStudent = user.role === "STUDENT";

  useEffect(() => {
    let alive = true;
    setLoading(true);
    clubsRequest()
      .then((result: ClubData) => {
        if (!alive) return;
        setData(result);
        setError("");
      })
      .catch((reason: unknown) => {
        if (alive)
          setError(
            reason instanceof TypeError
              ? "Нет связи с сервером. Проверьте подключение и повторите."
              : reason instanceof Error
                ? reason.message
                : "Не удалось загрузить кружки",
          );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [revision]);

  const categories = [...new Set(data.clubs.map((club) => club.category))];
  const search = query.trim().toLocaleLowerCase("ru");
  const clubs = data.clubs.filter(
    (club) =>
      (!category || club.category === category) &&
      (!search ||
        `${club.name} ${club.description} ${club.teacher.name}`
          .toLocaleLowerCase("ru")
          .includes(search)),
  );
  const applications = data.applications.filter(
    (application) =>
      (!applicationStatus || application.status === applicationStatus) &&
      (!applicationClub || application.clubId === applicationClub),
  );
  const pendingCount = data.applications.filter(
    (application) => application.status === "PENDING",
  ).length;

  async function review(applicationId: string, status: Status) {
    setReviewPending(applicationId);
    setReviewError("");
    try {
      await clubsRequest({ action: "review", applicationId, status });
      setData((current) => ({
        ...current,
        applications: current.applications.map((application) =>
          application.id === applicationId
            ? { ...application, status }
            : application,
        ),
      }));
      setToast(status === "APPROVED" ? "Заявка одобрена" : "Заявка отклонена");
    } catch (reason) {
      setReviewError(
        reason instanceof TypeError
          ? "Нет связи с сервером. Решение не сохранено. Повторите действие."
          : reason instanceof Error
            ? reason.message
            : "Не удалось сохранить решение",
      );
    } finally {
      setReviewPending("");
    }
  }

  return (
    <>
      <PageHeading
        title="Кружки и секции"
        subtitle={
          isStudent
            ? "Выберите занятие по интересам и подайте заявку прямо из кабинета."
            : "Занятия вне расписания и заявки студентов на участие."
        }
        action={
          <button
            className="button secondary"
            disabled={loading}
            onClick={() => setRevision((n) => n + 1)}
          >
            <RefreshCw size={16} className={loading ? "spin" : ""} /> Обновить
          </button>
        }
      />
      <State
        loading={loading}
        error={error}
        retry={() => setRevision((n) => n + 1)}
      >
        <section className={styles.intro} aria-label="О кружках">
          <div className={styles.introIcon}>
            <Sparkles size={28} />
          </div>
          <div>
            <span className={styles.eyebrow}>Больше, чем учёба</span>
            <h2>
              {isStudent
                ? "Развивайте свои сильные стороны"
                : "Поддерживайте интересы студентов"}
            </h2>
            <p>
              {isStudent
                ? "У каждого кружка есть руководитель. После отправки заявки следите за её статусом в карточке."
                : "Рассмотрите заявки ниже. Студент увидит ваше решение в своём кабинете."}
            </p>
          </div>
          <div className={styles.introCount}>
            <strong>{isStudent ? data.clubs.length : pendingCount}</strong>
            <span>{isStudent ? "направлений" : "ожидают решения"}</span>
          </div>
        </section>

        <div className={styles.catalogHeader}>
          <h2>Выберите направление</h2>
          <div className={styles.filters}>
            <label className={styles.search}>
              <span className={styles.srOnly}>
                Поиск кружка или руководителя
              </span>
              <Search size={17} aria-hidden="true" />
              <input
                type="search"
                placeholder="Кружок или руководитель"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <label>
              <span className={styles.srOnly}>Направление кружка</span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option value="">Все направления</option>
                {categories.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {clubs.length ? (
          <div className={styles.grid}>
            {clubs.map((club) => {
              const Icon = clubIcon(club.name);
              const application = club.application;
              return (
                <article className={styles.card} key={club.id}>
                  <div className={styles.cardTop}>
                    <div
                      className={`${styles.clubIcon} ${/спорт|атлет|бокс|стрель/i.test(`${club.category} ${club.name}`) ? styles.sports : ""}`}
                    >
                      <Icon size={26} />
                    </div>
                    <span className={styles.category}>{club.category}</span>
                  </div>
                  <h3>{club.name}</h3>
                  <p className={styles.description}>{club.description}</p>
                  <dl className={styles.details}>
                    <div>
                      <dt>
                        <GraduationCap size={17} />
                        <span>Руководитель</span>
                      </dt>
                      <dd>{club.teacher.name}</dd>
                    </div>
                    <div>
                      <dt>
                        <CalendarDays size={17} />
                        <span>Занятия</span>
                      </dt>
                      <dd>{club.schedule}</dd>
                    </div>
                    <div>
                      <dt>
                        <MapPin size={17} />
                        <span>Место</span>
                      </dt>
                      <dd>{club.location}</dd>
                    </div>
                  </dl>
                  <div className={styles.cardFooter}>
                    {isStudent ? (
                      application ? (
                        <div
                          className={`${styles.applicationState} ${styles[application.status.toLowerCase()]}`}
                          role="status"
                        >
                          <strong>
                            {application.status === "PENDING" ? (
                              <Clock3 size={17} />
                            ) : application.status === "APPROVED" ? (
                              <CheckCircle2 size={17} />
                            ) : (
                              <X size={17} />
                            )}
                            {statuses[application.status].title}
                          </strong>
                          <span>{statuses[application.status].detail}</span>
                        </div>
                      ) : (
                        <button
                          className="button primary"
                          onClick={() => setSelected(club)}
                          aria-label={`Подать заявку: ${club.name}`}
                        >
                          Подать заявку <ArrowRight size={16} />
                        </button>
                      )
                    ) : (
                      <span className={styles.applicationCount}>
                        <Users size={17} /> Заявок: {club.applicantCount}
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className={styles.empty}>
            <Search size={25} />
            <h3>
              {data.clubs.length
                ? "Кружки не найдены"
                : "Кружки пока не добавлены"}
            </h3>
            <p>
              {data.clubs.length
                ? "Попробуйте другой запрос или выберите все направления."
                : "Здесь появятся доступные занятия и их руководители."}
            </p>
            {(query || category) && (
              <button
                className="button secondary"
                onClick={() => {
                  setQuery("");
                  setCategory("");
                }}
              >
                Сбросить фильтры
              </button>
            )}
          </div>
        )}

        {!isStudent && (
          <section
            className={styles.inbox}
            aria-labelledby="club-applications-heading"
          >
            <div className={styles.inboxHeading}>
              <div>
                <h2 id="club-applications-heading">Заявки студентов</h2>
                <p>
                  {user.role === "ADMIN"
                    ? "Все заявки на участие в кружках."
                    : "Заявки в кружки, которыми вы руководите."}
                </p>
              </div>
              <div className={styles.filters}>
                <label>
                  <span>Кружок</span>
                  <select
                    value={applicationClub}
                    onChange={(event) => setApplicationClub(event.target.value)}
                  >
                    <option value="">Все кружки</option>
                    {data.clubs
                      .filter(
                        (club) =>
                          user.role === "ADMIN" || club.teacher.id === user.id,
                      )
                      .map((club) => (
                        <option key={club.id} value={club.id}>
                          {club.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  <span>Статус заявки</span>
                  <select
                    value={applicationStatus}
                    onChange={(event) =>
                      setApplicationStatus(event.target.value)
                    }
                  >
                    <option value="">Все статусы</option>
                    <option value="PENDING">На рассмотрении</option>
                    <option value="APPROVED">Одобрены</option>
                    <option value="DECLINED">Отклонены</option>
                  </select>
                </label>
              </div>
            </div>
            {reviewError && (
              <div className="error-box" role="alert">
                {reviewError}
              </div>
            )}
            {applications.length ? (
              <div className={styles.applicationList}>
                {applications.map((application) => (
                  <article
                    key={application.id}
                    className={styles.applicationRow}
                  >
                    <div className={styles.applicantAvatar}>
                      <Users size={20} />
                    </div>
                    <div className={styles.applicantInfo}>
                      <h3>{application.student?.name}</h3>
                      <p>
                        {application.club?.name ||
                          data.clubs.find(
                            (club) => club.id === application.clubId,
                          )?.name}{" "}
                        <span>·</span> {date(application.createdAt)}
                      </p>
                      <span className={styles.applicantEmail}>
                        {application.student?.email}
                      </span>
                      {application.message && (
                        <blockquote>{application.message}</blockquote>
                      )}
                    </div>
                    {application.status === "PENDING" ? (
                      <div className={styles.reviewActions}>
                        <button
                          className="button secondary"
                          disabled={Boolean(reviewPending)}
                          onClick={() => review(application.id, "DECLINED")}
                          aria-label={`Отклонить заявку: ${application.student?.name}`}
                        >
                          <X size={15} /> Отклонить
                        </button>
                        <button
                          className="button primary"
                          disabled={Boolean(reviewPending)}
                          onClick={() => review(application.id, "APPROVED")}
                          aria-label={`Одобрить заявку: ${application.student?.name}`}
                        >
                          {reviewPending === application.id ? (
                            <Loader2 size={15} className="spin" />
                          ) : (
                            <Check size={15} />
                          )}{" "}
                          Одобрить
                        </button>
                      </div>
                    ) : (
                      <span
                        className={`${styles.statusBadge} ${styles[application.status.toLowerCase()]}`}
                      >
                        {application.status === "APPROVED"
                          ? "Одобрена"
                          : "Отклонена"}
                      </span>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.emptyInbox}>
                <CheckCircle2 size={25} />
                <strong>Заявок с таким статусом нет</strong>
                <span>
                  Новые заявки появятся здесь после отправки студентами.
                </span>
              </div>
            )}
          </section>
        )}
      </State>
      {selected && (
        <ApplicationDialog
          club={selected}
          user={user}
          onClose={() => setSelected(null)}
          onSaved={(application) => {
            setData((current) => ({
              ...current,
              clubs: current.clubs.map((club) =>
                club.id === selected.id ? { ...club, application } : club,
              ),
            }));
            setSelected(null);
            setToast("Заявка отправлена руководителю кружка");
          }}
        />
      )}
      {toast && <Toast text={toast} onClose={() => setToast("")} />}
    </>
  );
}

function ApplicationDialog({
  club,
  user,
  onClose,
  onSaved,
}: {
  club: Club;
  user: Row;
  onClose: () => void;
  onSaved: (application: Application) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      const application = await clubsRequest({
        action: "apply",
        clubId: club.id,
        message: String(form.get("message") || "").trim(),
      });
      onSaved(application);
    } catch (reason) {
      setError(
        reason instanceof TypeError
          ? "Нет связи с сервером. Заявка пока не подтверждена. Повторите отправку."
          : reason instanceof Error
            ? reason.message
            : "Не удалось отправить заявку",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className={`modal ${styles.applicationDialog}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        if (pending) event.preventDefault();
        else onClose();
      }}
    >
      <div className="modal-header">
        <div>
          <span className={styles.eyebrow}>Запись в кружок</span>
          <h2 id={titleId}>{club.name}</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Закрыть заявку"
          disabled={pending}
          onClick={onClose}
        >
          <X size={21} />
        </button>
      </div>
      <form onSubmit={submit}>
        <div className={styles.dialogBody}>
          <div className={styles.applicationSummary}>
            <strong>{user.name}</strong>
            <span>Руководитель: {club.teacher.name}</span>
            <span>
              {club.schedule} · {club.location}
            </span>
          </div>
          <label>
            Сообщение руководителю{" "}
            <span className={styles.optional}>(необязательно)</span>
            <textarea
              name="message"
              maxLength={1000}
              rows={4}
              placeholder="Расскажите о своём опыте или задайте вопрос"
              autoFocus
            />
          </label>
          <p className={styles.dialogHint}>
            Ваше имя и учебная почта будут переданы руководителю. Решение по
            заявке появится в карточке кружка.
          </p>
          {error && (
            <div className="error-box" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button
            type="button"
            className="button secondary"
            disabled={pending}
            onClick={onClose}
          >
            Отмена
          </button>
          <button className="button primary" disabled={pending}>
            {pending ? (
              <Loader2 size={16} className="spin" />
            ) : (
              <Send size={16} />
            )}
            {pending ? "Отправляем…" : "Отправить заявку"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
