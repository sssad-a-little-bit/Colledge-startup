"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getSession, signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { Brand } from "./public";
import { Clubs } from "./clubs";
import { Grades } from "./gradebook";
import gradebookStyles from "./gradebook.module.css";
import {
  api,
  assignmentOptions,
  clock,
  date,
  dateKey,
  Field,
  ModalForm,
  options,
  PageHeading,
  Row,
  State,
  Toast,
  useResource,
  utcInput,
} from "./ui";
import { Admin } from "./admin";
const roleNames: Record<string, string> = {
  ADMIN: "Администратор",
  TEACHER: "Преподаватель",
  STUDENT: "Студент",
};
const nav = [
  { href: "/campus", title: "Мой учебный день", icon: LayoutDashboard },
  { href: "/campus/schedule", title: "Расписание", icon: CalendarDays },
  { href: "/campus/assessments", title: "Контрольные", icon: BookOpen },
  { href: "/campus/grades", title: "Оценки и журнал", icon: TrendingUp },
  { href: "/campus/assignments", title: "Группы и предметы", icon: Users },
  { href: "/campus/clubs", title: "Кружки и секции", icon: Sparkles },
  { href: "/campus/news", title: "Новости", icon: GraduationCap },
  { href: "/campus/notifications", title: "Уведомления", icon: Bell },
];
export function Portal() {
  const path = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<Row | null>(null);
  const [authError, setAuthError] = useState("");
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    getSession()
      .then((s) => {
        if (!s || !s.user || !(s.user as Row).id) router.replace("/login");
        else setUser(s.user as Row);
      })
      .catch(() =>
        setAuthError("Не удалось проверить сессию. Обновите страницу."),
      );
  }, [router]);
  if (!user)
    return (
      <main id="main" className="loading-page">
        <State
          loading={!authError}
          error={authError}
          retry={() => window.location.reload()}
        >
          <span />
        </State>
      </main>
    );
  const section = path.split("/")[2] || "overview";
  return (
    <div className="app-shell">
      <aside className={`sidebar ${menu ? "is-open" : ""}`}>
        <Brand />
        <button
          className="mobile-close icon-button"
          onClick={() => setMenu(false)}
          aria-label="Закрыть меню"
        >
          <X size={21} />
        </button>
        <div className="workspace-label">ЛИЧНЫЙ КАБИНЕТ</div>
        <nav aria-label="Разделы кабинета">
          {nav
            .filter(
              (n) =>
                user.role !== "STUDENT" || !n.href.endsWith("/assignments"),
            )
            .map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={path === n.href ? "active" : ""}
                onClick={() => setMenu(false)}
              >
                <n.icon size={19} />
                {n.title}
                {n.href.endsWith("/notifications") && (
                  <span className="nav-dot" />
                )}
              </Link>
            ))}
          {user.role === "ADMIN" && (
            <>
              <div className="workspace-label nav-divider">УПРАВЛЕНИЕ</div>
              <Link
                href="/campus/admin"
                className={section === "admin" ? "active" : ""}
                onClick={() => setMenu(false)}
              >
                <Settings2 size={19} /> Администрирование
              </Link>
            </>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Sparkles size={20} />
            <strong>Всё для учебного дня</strong>
            <p>
              Актуальная информация
              <br />в одном пространстве
            </p>
          </div>
          <Link href="/campus/profile" className="sidebar-profile">
            <span className="avatar">{user.name?.slice(0, 1) || "К"}</span>
            <span>
              <strong>{user.name}</strong>
              <small>{roleNames[user.role] || "Пользователь"}</small>
            </span>
            <ChevronRight size={16} />
          </Link>
          <button
            className="logout"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            <LogOut size={16} /> Выйти из аккаунта
          </button>
        </div>
      </aside>
      {menu && (
        <button
          className="mobile-scrim"
          aria-label="Закрыть меню"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="app-main">
        <header className="app-header">
          <div>
            <button
              className="mobile-menu icon-button"
              aria-label="Открыть меню"
              onClick={() => setMenu(true)}
            >
              <Menu size={21} />
            </button>
            <span className="header-breadcrumb">
              Кабинет <ChevronRight size={13} />{" "}
              <strong>
                {section === "overview"
                  ? "Обзор"
                  : section === "admin"
                    ? "Администрирование"
                    : nav.find((n) => n.href === path)?.title || "Профиль"}
              </strong>
            </span>
          </div>
          <div className="header-right">
            <span className="timezone">
              <span /> Asia/Almaty
            </span>
            <Link
              href="/campus/notifications"
              className="icon-button"
              aria-label="Уведомления"
            >
              <Bell size={20} />
            </Link>
            <Link href="/campus/profile" className="avatar small">
              {user.name?.slice(0, 1) || "К"}
            </Link>
          </div>
        </header>
        <main id="main" className="workspace">
          {section === "overview" ? (
            <Overview user={user} />
          ) : section === "schedule" ? (
            <Schedule user={user} />
          ) : section === "assessments" ? (
            <Assessments user={user} />
          ) : section === "grades" ? (
            <Grades user={user} />
          ) : section === "assignments" ? (
            <Assignments />
          ) : section === "clubs" ? (
            <Clubs user={user} />
          ) : section === "notifications" ? (
            <Notifications />
          ) : section === "profile" ? (
            <Profile user={user} />
          ) : section === "news" ? (
            <CampusNews />
          ) : section === "admin" && user.role === "ADMIN" ? (
            <Admin />
          ) : (
            <div className="empty">
              <h1>Раздел недоступен</h1>
              <Link href="/campus">Вернуться к обзору</Link>
            </div>
          )}
        </main>
        <footer className="app-footer">
          <span>КИТ Campus · Конкурсный проект</span>
          <span>Учебное время · Asia/Almaty</span>
        </footer>
      </div>
    </div>
  );
}
function Overview({ user }: { user: Row }) {
  const { data, error, loading, reload } = useResource("overview");
  const now = new Date();
  const today = dateKey(now);
  const lessons = (data?.lessons || []) as Row[];
  const assessments = (data?.assessments || []) as Row[];
  const todayLessons = lessons.filter((l) => dateKey(l.startsAt) === today);
  const next = lessons
    .filter((l) => new Date(l.endsAt) > now && l.status !== "CANCELLED")
    .sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    )[0];
  const upcoming = assessments
    .filter((a) => new Date(a.startsAt) >= now && a.status !== "CANCELLED")
    .sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );
  const unread = (data?.notifications || []).filter((n: Row) => !n.readAt);
  const shortName = user.name?.split(" ")[0] || "пользователь";
  return (
    <>
      <PageHeading
        eyebrow={date(now, {
          weekday: "long",
          day: "numeric",
          month: "long",
        }).toUpperCase()}
        title={`Добрый день, ${shortName} 👋`}
        subtitle="Ваш учебный день — спокойно и по порядку."
        action={
          <Link href="/campus/schedule" className="button secondary">
            <CalendarDays size={16} /> Открыть расписание
          </Link>
        }
      />
      <State loading={loading} error={error} retry={reload}>
        <div className="stats-grid">
          <Stat
            icon={CalendarDays}
            value={todayLessons.filter((l) => l.status !== "CANCELLED").length}
            label="занятий сегодня"
            note="По вашему расписанию"
            color="purple"
          />
          <Stat
            icon={BookOpen}
            value={
              upcoming.filter(
                (a) =>
                  new Date(a.startsAt).getTime() - now.getTime() < 7 * 86400000,
              ).length
            }
            label="контрольных за 7 дней"
            note="Самое время подготовиться"
            color="orange"
          />
          <Stat
            icon={Bell}
            value={unread.length}
            label="новых уведомлений"
            note="Будьте в курсе изменений"
            color="green"
          />
          <Stat
            icon={TrendingUp}
            value={(data?.grades || []).length}
            label="записей в журнале"
            note={
              user.role === "STUDENT"
                ? "Только ваши результаты"
                : "По доступным назначениям"
            }
            color="blue"
          />
        </div>
        <div className="dashboard-grid">
          <div className="dashboard-main">
            <section className="next-lesson">
              <div className="next-heading">
                <span className="eyebrow">
                  <span className="live-dot" /> БЛИЖАЙШЕЕ ЗАНЯТИЕ
                </span>
                <span className="chip white">
                  {next
                    ? date(next.startsAt, {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })
                    : "Расписание"}
                </span>
              </div>
              {next ? (
                <>
                  <h2>{next.assignment?.subject?.name || "Занятие"}</h2>
                  <p className="next-teacher">
                    {next.teacher?.name || next.assignment?.teacher?.name} ·{" "}
                    {next.assignment?.group?.name || next.group?.name}
                  </p>
                  <div className="next-info">
                    <span>
                      <Clock3 size={18} />
                      {clock(next.startsAt)} – {clock(next.endsAt)}
                    </span>
                    <span>
                      <MapPin size={18} />
                      {next.room?.name || "Аудитория уточняется"}
                    </span>
                    <span className="next-type">
                      {next.type || "Учебное занятие"}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <h2>Впереди свободное время</h2>
                  <p className="next-teacher">
                    Ближайших опубликованных занятий пока нет.
                  </p>
                </>
              )}
              <Link href="/campus/schedule" className="next-link">
                Всё расписание <ArrowRight size={18} />
              </Link>
              <div className="next-decoration">
                <LayersPattern />
              </div>
            </section>
            <section className="panel">
              <div className="panel-heading">
                <h2>
                  <CalendarDays size={19} /> Сегодня в расписании
                </h2>
                <span className="muted">
                  {date(now, { day: "numeric", month: "long" })}
                </span>
              </div>
              {todayLessons.length ? (
                <div className="lesson-list">
                  {todayLessons.map((l, i) => (
                    <LessonRow key={l.id} lesson={l} index={i} />
                  ))}
                </div>
              ) : (
                <div className="compact-empty">
                  <CalendarDays size={26} />
                  <p>
                    На сегодня занятий нет.
                    <br />
                    <span>Проверьте расписание на неделю.</span>
                  </p>
                </div>
              )}
              <Link className="panel-footer" href="/campus/schedule">
                Расписание на неделю <ArrowRight size={16} />
              </Link>
            </section>
            <section className="panel">
              <div className="panel-heading">
                <h2>
                  <SlidersHorizontal size={19} /> Нагрузка на неделю
                </h2>
                <span className="chip subtle">
                  Порог: {data?.settings?.loadThreshold || 2} контрольные
                </span>
              </div>
              <LoadChart
                lessons={lessons}
                assessments={assessments}
                threshold={data?.settings?.loadThreshold || 2}
              />
            </section>
          </div>
          <div className="dashboard-side">
            <section className="panel">
              <div className="panel-heading">
                <h2>Ближайшие контрольные</h2>
                <Link
                  href="/campus/assessments"
                  className="icon-button"
                  aria-label="Все контрольные"
                >
                  <ArrowRight size={17} />
                </Link>
              </div>
              {upcoming.length ? (
                <div className="upcoming-list">
                  {upcoming.slice(0, 3).map((a) => (
                    <div key={a.id} className="upcoming-item">
                      <div className="date-tile">
                        <strong>{date(a.startsAt, { day: "numeric" })}</strong>
                        <span>{date(a.startsAt, { month: "short" })}</span>
                      </div>
                      <div>
                        <span className="tiny-label">
                          {a.type || "Контрольная"}
                        </span>
                        <h3>{a.assignment?.subject?.name || a.title}</h3>
                        <p>
                          {a.title} · {clock(a.startsAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="compact-empty">Ближайших контрольных нет</p>
              )}
              <div className="panel-hint">
                <CircleHelp size={16} />
                <span>
                  Планируйте подготовку заранее — события видны за 14 дней.
                </span>
              </div>
            </section>
            <section className="panel">
              <div className="panel-heading">
                <h2>Что изменилось</h2>
                <Link
                  href="/campus/notifications"
                  className="icon-button"
                  aria-label="Все изменения"
                >
                  <ArrowRight size={17} />
                </Link>
              </div>
              <div className="change-list">
                {(data?.notifications || []).slice(0, 3).map((n: Row) => (
                  <Link
                    key={n.id}
                    href={n.href || "/campus/notifications"}
                    className="change-item"
                  >
                    <span className={`change-dot ${n.readAt ? "read" : ""}`} />
                    <div>
                      <h3>{n.title}</h3>
                      <p>{n.body}</p>
                      <small>
                        {date(n.createdAt, {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </small>
                    </div>
                  </Link>
                ))}
                {!data?.notifications?.length && (
                  <p className="muted">Изменений пока нет.</p>
                )}
              </div>
            </section>
            <section className="day-todo">
              <div>
                <Check size={17} />
                <h3>В фокусе сегодня</h3>
              </div>
              <p>
                {todayLessons.length
                  ? "Посмотрите аудитории перед началом занятий."
                  : "Проверьте план на ближайшие учебные дни."}
              </p>
              <p>
                {upcoming[0]
                  ? `Подготовка: ${upcoming[0].title}`
                  : "Следите за новыми контрольными."}
              </p>
              <Link href="/campus/notifications">
                Проверить изменения <ArrowRight size={15} />
              </Link>
            </section>
          </div>
        </div>
      </State>
    </>
  );
}
function LayersPattern() {
  return (
    <svg width="210" height="210" viewBox="0 0 210 210" aria-hidden="true">
      <path d="m105 18 78 45-78 45-78-45Z" />
      <path d="m27 88 78 45 78-45M27 113l78 45 78-45M27 138l78 45 78-45" />
    </svg>
  );
}
function Stat({
  icon: Icon,
  value,
  label,
  note,
  color,
}: {
  icon: any;
  value: number;
  label: string;
  note: string;
  color: string;
}) {
  return (
    <div className="stat-card">
      <span className={`stat-icon ${color}`}>
        <Icon size={20} />
      </span>
      <div>
        <strong>
          {value}
          <span>{label}</span>
        </strong>
        <small>{note}</small>
      </div>
    </div>
  );
}
function LoadChart({
  lessons,
  assessments,
  threshold,
}: {
  lessons: Row[];
  assessments: Row[];
  threshold: number;
}) {
  const now = new Date();
  const base = new Date(`${dateKey(now)}T12:00:00Z`);
  const dow = (base.getUTCDay() + 6) % 7;
  base.setUTCDate(base.getUTCDate() - dow);
  const days = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(base);
    day.setUTCDate(base.getUTCDate() + i);
    const key = day.toISOString().slice(0, 10);
    return {
      key,
      day,
      lessons: lessons.filter(
        (l) => dateKey(l.startsAt) === key && l.status !== "CANCELLED",
      ).length,
      assessments: assessments.filter(
        (a) => dateKey(a.startsAt) === key && a.status !== "CANCELLED",
      ).length,
    };
  });
  const max = Math.max(4, ...days.map((d) => d.lessons + d.assessments));
  return (
    <>
      <div className="load-chart">
        {days.map((d) => (
          <div key={d.key} className={d.key === dateKey(now) ? "today" : ""}>
            <div className="bar-value">{d.lessons + d.assessments || "—"}</div>
            <div
              className="bar-track"
              aria-label={`${date(d.day, { weekday: "long" })}: ${d.lessons} занятий, ${d.assessments} контрольных`}
            >
              <span
                className="bar-lessons"
                style={{ height: `${(d.lessons / max) * 100}%` }}
              />
              <span
                className="bar-tests"
                style={{ height: `${(d.assessments / max) * 100}%` }}
              />
            </div>
            <span className="bar-label">
              {date(d.day, { weekday: "short" })}
            </span>
            {d.assessments >= threshold && (
              <span
                className="load-warning"
                title="Достигнут порог учебной нагрузки"
              >
                !
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="chart-legend">
        <span>
          <i />
          Занятия
        </span>
        <span>
          <i />
          Контрольные
        </span>
        <small>Порог нагрузки настраивается администратором</small>
      </div>
    </>
  );
}
function LessonRow({
  lesson: l,
  index = 0,
  onEdit,
}: {
  lesson: Row;
  index?: number;
  onEdit?: (r: Row) => void;
}) {
  return (
    <div
      className={`lesson-row ${l.status === "CANCELLED" ? "cancelled" : ""}`}
    >
      <div className="lesson-time">
        <strong>{clock(l.startsAt)}</strong>
        <span>{clock(l.endsAt)}</span>
      </div>
      <span className={`lesson-index tone-${index % 3}`}>{index + 1}</span>
      <div className="lesson-details">
        <h3>{l.assignment?.subject?.name || "Занятие"}</h3>
        <p>
          {l.teacher?.name || l.assignment?.teacher?.name} <span>·</span>{" "}
          {l.assignment?.group?.name || l.group?.name}
        </p>
        {l.note && <small>{l.note}</small>}
        {l.status !== "SCHEDULED" && (
          <span
            className={`chip ${l.status === "CANCELLED" ? "red" : "amber"}`}
          >
            {(
              {
                CANCELLED: "Отменено",
                MOVED: "Перенесено",
                SUBSTITUTED: "Замена",
              } as Row
            )[l.status] || l.status}
          </span>
        )}
      </div>
      <span className="lesson-room">
        <MapPin size={14} />
        {l.room?.name || "—"}
      </span>
      {onEdit && (
        <button
          className="button small-button secondary"
          onClick={() => onEdit(l)}
        >
          Изменить
        </button>
      )}
    </div>
  );
}
function Schedule({ user }: { user: Row }) {
  const [view, setView] = useState("week");
  const [selected, setSelected] = useState(dateKey(new Date()));
  const [teacherFilter, setTeacherFilter] = useState("");
  const [roomFilter, setRoomFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const rangeBase = new Date(selected + "T12:00:00Z");
  if (view === "week")
    rangeBase.setUTCDate(
      rangeBase.getUTCDate() - ((rangeBase.getUTCDay() + 6) % 7),
    );
  const rangeEnd = new Date(rangeBase);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + (view === "week" ? 7 : 1));
  const resource = useResource(
    `schedule?from=${encodeURIComponent(utcInput(dateKey(rangeBase) + "T00:00") || "")}&to=${encodeURIComponent(utcInput(dateKey(rangeEnd) + "T00:00") || "")}${teacherFilter ? "&teacherId=" + encodeURIComponent(teacherFilter) : ""}${roomFilter ? "&roomId=" + encodeURIComponent(roomFilter) : ""}${groupFilter ? "&groupId=" + encodeURIComponent(groupFilter) : ""}`,
  );
  const [subject, setSubject] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);
  const [lookups, setLookups] = useState<Row>({});
  const [saved, setSaved] = useState("");
  useEffect(() => {
    if (user.role === "ADMIN")
      Promise.all([
        api("assignments"),
        api("rooms"),
        api("users"),
        api("groups"),
      ])
        .then(([assignments, rooms, users, groups]) =>
          setLookups({ assignments, rooms, users, groups }),
        )
        .catch(() => {});
  }, [user.role]);
  const rows: Row[] = Array.isArray(resource.data)
    ? resource.data
    : resource.data?.lessons || [];
  const base = new Date(selected + "T12:00:00Z");
  const start = new Date(base);
  if (view === "week")
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + (view === "week" ? 6 : 0));
  const filtered = rows.filter(
    (r) =>
      dateKey(r.startsAt) >= dateKey(start) &&
      dateKey(r.startsAt) <= dateKey(end) &&
      (!subject ||
        r.assignment?.subjectId === subject ||
        r.assignmentId === subject),
  );
  const days = [...new Set(filtered.map((r) => dateKey(r.startsAt)))].sort();
  const subjects = Array.from(
    new Map(
      rows.map((l) => [
        l.assignmentId,
        {
          value: l.assignmentId,
          label: `${l.assignment?.subject?.name} · ${l.assignment?.group?.name}`,
        },
      ]),
    ).values(),
  );
  const fields: Field[] = [
    {
      name: "assignmentId",
      label: "Учебное назначение",
      options: assignmentOptions(lookups.assignments),
      required: true,
    },
    {
      name: "teacherId",
      label: "Фактический преподаватель",
      options: options(
        (lookups.users || []).filter((u: Row) => u.role === "TEACHER"),
      ),
      required: true,
    },
    {
      name: "roomId",
      label: "Аудитория",
      options: options(lookups.rooms),
      required: true,
    },
    {
      name: "startsAt",
      label: "Начало · Asia/Almaty",
      type: "datetime-local",
      required: true,
    },
    {
      name: "endsAt",
      label: "Окончание · Asia/Almaty",
      type: "datetime-local",
      required: true,
    },
    {
      name: "status",
      label: "Статус",
      options: ["SCHEDULED", "CANCELLED", "MOVED", "SUBSTITUTED"].map(
        (value, i) => ({
          value,
          label: ["По расписанию", "Отменено", "Перенесено", "Замена"][i],
        }),
      ),
      required: true,
    },
    { name: "note", label: "Примечание", type: "textarea" },
    {
      name: "reason",
      label: "Причина публикации или изменения",
      required: true,
    },
  ];
  return (
    <>
      <PageHeading
        title="Расписание"
        subtitle="Занятия, аудитории и все изменения в одном месте. Время — Asia/Almaty."
        action={
          user.role === "ADMIN" ? (
            <button
              className="button primary"
              onClick={() => setEditing({ status: "SCHEDULED" })}
            >
              <Plus size={17} /> Добавить занятие
            </button>
          ) : undefined
        }
      />
      <div className="toolbar">
        <div className="segmented">
          <button
            className={view === "day" ? "selected" : ""}
            onClick={() => setView("day")}
          >
            День
          </button>
          <button
            className={view === "week" ? "selected" : ""}
            onClick={() => setView("week")}
          >
            Неделя
          </button>
        </div>
        <label className="inline-label">
          Дата
          <input
            type="date"
            value={selected}
            onChange={(e) => setSelected(e.target.value || dateKey(new Date()))}
          />
        </label>
        <select
          aria-label="Фильтр по предмету и группе"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        >
          <option value="">Все предметы и группы</option>
          {subjects.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        {user.role === "ADMIN" && (
          <>
            <select
              aria-label="Фильтр по группе"
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
            >
              <option value="">Все группы</option>
              {options(lookups.groups).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Фильтр по преподавателю"
              value={teacherFilter}
              onChange={(e) => setTeacherFilter(e.target.value)}
            >
              <option value="">Все преподаватели</option>
              {options(
                (lookups.users || []).filter((u: Row) => u.role === "TEACHER"),
              ).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Фильтр по аудитории"
              value={roomFilter}
              onChange={(e) => setRoomFilter(e.target.value)}
            >
              <option value="">Все аудитории</option>
              {options(lookups.rooms).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </>
        )}
        <button
          className="icon-button"
          onClick={resource.reload}
          aria-label="Обновить расписание"
        >
          <RefreshCw size={18} />
        </button>
        <a className="button secondary" href="/api/export?resource=schedule">
          <ArrowDownToLine size={16} /> CSV
        </a>
      </div>
      <State
        loading={resource.loading}
        error={resource.error}
        retry={resource.reload}
        empty={!filtered.length}
      >
        {days.map((day) => (
          <section className="panel schedule-day" key={day}>
            <div className="panel-heading">
              <h2>
                {date(day + "T12:00:00Z", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </h2>
              <span className="chip subtle">
                {filtered.filter((r) => dateKey(r.startsAt) === day).length}{" "}
                занятий
              </span>
            </div>
            {filtered
              .filter((r) => dateKey(r.startsAt) === day)
              .sort(
                (a, b) =>
                  new Date(a.startsAt).getTime() -
                  new Date(b.startsAt).getTime(),
              )
              .map((l, i) => (
                <LessonRow
                  key={l.id}
                  lesson={l}
                  index={i}
                  onEdit={user.role === "ADMIN" ? setEditing : undefined}
                />
              ))}
          </section>
        ))}
      </State>
      {editing && (
        <ModalForm
          title={editing.id ? "Изменить занятие" : "Новое занятие"}
          description="Публикация проверяет занятость преподавателя, группы и аудитории. Изменения связанной контрольной проверяются сервером."
          action="saveLesson"
          initial={editing}
          fields={fields}
          onClose={() => setEditing(null)}
          onSaved={() => {
            resource.reload();
            setSaved("Занятие сохранено, связанные представления обновлены");
          }}
        />
      )}
      {saved && <Toast text={saved} onClose={() => setSaved("")} />}
    </>
  );
}
function Assessments({ user }: { user: Row }) {
  const resource = useResource("assessments");
  const [filter, setFilter] = useState("");
  const [type, setType] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);
  const [lookups, setLookups] = useState<Row>({});
  const [saved, setSaved] = useState("");
  const [period, setPeriod] = useState("14");
  const [calendarDay, setCalendarDay] = useState("");
  useEffect(() => {
    if (user.role !== "STUDENT")
      Promise.all([api("assignments"), api("rooms"), api("schedule")])
        .then(([assignments, rooms, lessons]) =>
          setLookups({ assignments, rooms, lessons }),
        )
        .catch(() => {});
  }, [user.role]);
  const rows: Row[] = Array.isArray(resource.data) ? resource.data : [];
  const subjects = Array.from(
    new Map(
      rows.map((a) => [
        a.assignmentId,
        {
          value: a.assignmentId,
          label: a.assignment?.subject?.name || "Предмет",
        },
      ]),
    ).values(),
  );
  const today = dateKey(new Date());
  const end = new Date();
  end.setDate(end.getDate() + Number(period));
  const calendarRows = rows.filter(
    (a) => (!filter || a.assignmentId === filter) && (!type || a.type === type),
  );
  const filtered = rows.filter(
    (a) =>
      (!calendarDay || dateKey(a.startsAt) === calendarDay) &&
      (!filter || a.assignmentId === filter) &&
      (!type || a.type === type) &&
      (period === "all" ||
        (dateKey(a.startsAt) >= today && dateKey(a.startsAt) <= dateKey(end))),
  );
  const types = [...new Set(rows.map((a) => a.type))];
  const fields: Field[] = [
    {
      name: "assignmentId",
      label: "Предмет и группа",
      required: true,
      options: assignmentOptions(lookups.assignments),
    },
    { name: "title", label: "Тема", required: true },
    {
      name: "type",
      label: "Тип работы",
      required: true,
      hint: "Настраиваемый тип, например «Контрольная»",
    },
    {
      name: "startsAt",
      label: "Начало · Asia/Almaty",
      type: "datetime-local",
      required: true,
    },
    {
      name: "endsAt",
      label: "Окончание · Asia/Almaty",
      type: "datetime-local",
    },
    { name: "roomId", label: "Аудитория", options: options(lookups.rooms) },
    {
      name: "lessonId",
      label: "Связанное занятие",
      options: (lookups.lessons || []).map((l: Row) => ({
        value: l.id,
        label: `${l.assignment?.subject?.name} · ${date(l.startsAt)} ${clock(l.startsAt)}`,
      })),
    },
    {
      name: "status",
      label: "Статус",
      required: true,
      options: [
        { value: "SCHEDULED", label: "Запланировано" },
        { value: "CANCELLED", label: "Отменено" },
        { value: "MOVED", label: "Перенесено" },
      ],
    },
    { name: "description", label: "Описание и подготовка", type: "textarea" },
    { name: "reason", label: "Причина изменения", required: true },
  ];
  return (
    <>
      <PageHeading
        title="Контрольные и календарь"
        subtitle="Даты, темы и требования к предстоящим работам — в одном календаре."
        action={
          user.role !== "STUDENT" ? (
            <button
              className="button primary"
              onClick={() =>
                setEditing({ type: "Контрольная", status: "SCHEDULED" })
              }
            >
              <Plus size={17} /> Создать контрольную
            </button>
          ) : undefined
        }
      />
      <div className="toolbar">
        <select
          aria-label="Период"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        >
          <option value="7">Ближайшие 7 дней</option>
          <option value="14">Ближайшие 14 дней</option>
          <option value="all">Все даты</option>
        </select>
        <select
          aria-label="Предмет"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">Все предметы</option>
          {subjects.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Тип работы"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="">Все типы</option>
          {types.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>
      <div
        className="calendar-strip"
        aria-label="Календарь контрольных на 14 дней"
      >
        {Array.from({ length: 14 }, (_, i) => {
          const d = new Date(today + "T12:00:00Z");
          d.setUTCDate(d.getUTCDate() + i);
          const key = dateKey(d);
          const count = calendarRows.filter(
            (a) => dateKey(a.startsAt) === key && a.status !== "CANCELLED",
          ).length;
          return (
            <button
              key={key}
              className={calendarDay === key ? "selected" : ""}
              aria-pressed={calendarDay === key}
              onClick={() => setCalendarDay(calendarDay === key ? "" : key)}
            >
              <span>{date(d, { weekday: "short" })}</span>
              <strong>{date(d, { day: "numeric", month: "short" })}</strong>
              <small>{count ? `${count} работ` : "—"}</small>
            </button>
          );
        })}
      </div>
      {calendarDay && (
        <button
          className="text-button calendar-reset"
          onClick={() => setCalendarDay("")}
        >
          Сбросить выбранный день
        </button>
      )}
      <State
        loading={resource.loading}
        error={resource.error}
        retry={resource.reload}
        empty={!filtered.length}
      >
        <div className="assessment-grid">
          {filtered
            .sort(
              (a, b) =>
                new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
            )
            .map((a) => (
              <article className="assessment-card" key={a.id}>
                <div className="assessment-card-top">
                  <span className="chip amber">{a.type}</span>
                  <span className="muted">{a.assignment?.group?.name}</span>
                </div>
                <h2>{a.assignment?.subject?.name}</h2>
                <h3>{a.title}</h3>
                <p>{a.description || "Дополнительная подготовка не указана"}</p>
                <div className="assessment-meta">
                  <span>
                    <CalendarDays size={16} />
                    {date(a.startsAt, {
                      weekday: "short",
                      day: "numeric",
                      month: "long",
                    })}
                  </span>
                  <span>
                    <Clock3 size={16} />
                    {clock(a.startsAt)}
                    {a.endsAt && ` – ${clock(a.endsAt)}`}
                  </span>
                  <span>
                    <MapPin size={16} />
                    {a.room?.name || "Аудитория уточняется"}
                  </span>
                </div>
                <div className="assessment-card-footer">
                  <span
                    className={`chip ${a.status === "CANCELLED" ? "red" : "subtle"}`}
                  >
                    {a.status === "CANCELLED"
                      ? "Отменено"
                      : a.status === "COMPLETED"
                        ? "Проведено"
                        : "Запланировано"}
                  </span>
                  {user.role !== "STUDENT" && (
                    <button
                      className="text-button"
                      onClick={() => setEditing(a)}
                    >
                      Изменить
                    </button>
                  )}
                </div>
              </article>
            ))}
        </div>
      </State>
      {editing && (
        <ModalForm
          title={editing.id ? "Изменить контрольную" : "Новая контрольная"}
          action="saveAssessment"
          initial={editing}
          fields={fields}
          onClose={() => setEditing(null)}
          onSaved={() => {
            resource.reload();
            setSaved("Контрольная сохранена");
          }}
        />
      )}
      {saved && <Toast text={saved} onClose={() => setSaved("")} />}
    </>
  );
}
function Assignments() {
  const resource = useResource("assignments");
  const [search, setSearch] = useState("");
  const rows: Row[] = Array.isArray(resource.data) ? resource.data : [];
  const groups = [...new Map(rows.map((a) => [a.groupId, a.group])).values()]
    .filter((group) =>
      String(group.name).toLowerCase().includes(search.toLowerCase().trim()),
    )
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "ru"));
  return (
    <>
      <PageHeading
        title="Группы и предметы"
        subtitle="Найдите группу, посмотрите её состав и откройте журнал нужного предмета."
      />
      <div className="toolbar">
        <label>
          Поиск группы
          <input
            type="search"
            placeholder="Название группы"
            aria-label="Поиск группы"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <State
        loading={resource.loading}
        error={resource.error}
        retry={resource.reload}
      >
        <div className="assessment-grid">
          {groups.map((group) => {
            const assignments = rows.filter((a) => a.groupId === group.id);
            const members = [
              ...new Map<string, Row>(
                assignments.flatMap((a) =>
                  (a.group?.memberships || [])
                    .filter((m: Row) => m.user?.active !== false)
                    .map((m: Row) => [m.user.id, m.user] as [string, Row]),
                ),
              ).values(),
            ].sort((a, b) =>
              String(a.name).localeCompare(String(b.name), "ru"),
            );
            return (
              <section className="assignment-card" key={group.id}>
                <span className="stat-icon purple">
                  <Users size={23} />
                </span>
                <h2>{group.name}</h2>
                <p className="assignment-group">
                  {group.course} курс · {group.program}
                </p>
                <details className={gradebookStyles.roster}>
                  <summary>Состав группы · {members.length} учеников</summary>
                  {members.length ? (
                    <ul>
                      {members.map((student) => (
                        <li key={student.id}>{student.name}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>Ученики ещё не зачислены в эту группу.</p>
                  )}
                </details>
                <div className={gradebookStyles.assignmentSubjects}>
                  {assignments.map((a) => (
                    <div key={a.id}>
                      <strong>{a.subject?.name}</strong>
                      <small>
                        {a.teacher?.name} · {a.period?.name}
                      </small>
                      <Link
                        href={
                          "/campus/grades?groupId=" +
                          encodeURIComponent(group.id) +
                          "&assignmentId=" +
                          encodeURIComponent(a.id)
                        }
                        className="text-link"
                      >
                        Открыть журнал предмета →
                      </Link>
                    </div>
                  ))}
                </div>
                <div className="assignment-actions">
                  <Link
                    href={
                      "/campus/grades?groupId=" + encodeURIComponent(group.id)
                    }
                    className="button secondary"
                  >
                    Журнал группы <ArrowRight size={15} />
                  </Link>
                </div>
              </section>
            );
          })}
        </div>
        {!groups.length && (
          <div className="empty">
            <h3>Группы не найдены</h3>
            <p>Проверьте название или назначения преподавателя.</p>
          </div>
        )}
      </State>
    </>
  );
}
function Notifications() {
  const resource = useResource("notifications");
  const [unread, setUnread] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const rows: Row[] = (
    Array.isArray(resource.data) ? resource.data : []
  ).filter((n: Row) => !unread || !n.readAt);
  async function read(id: string) {
    setBusy(id);
    setError("");
    try {
      const r = await fetch("/api/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "readNotification",
          id,
          key: crypto.randomUUID(),
        }),
      });
      const j = await r.json();
      if (!r.ok)
        throw Error(j.error?.message || "Не удалось отметить уведомление");
      resource.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка запроса");
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <PageHeading
        title="Уведомления и изменения"
        subtitle="Что изменилось, когда опубликовано и что уже прочитано — в одном месте."
      />
      <div className="toolbar">
        <div className="segmented">
          <button
            className={!unread ? "selected" : ""}
            onClick={() => setUnread(false)}
          >
            Все
          </button>
          <button
            className={unread ? "selected" : ""}
            onClick={() => setUnread(true)}
          >
            Непрочитанные
          </button>
        </div>
      </div>
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      <State
        loading={resource.loading}
        error={resource.error}
        retry={resource.reload}
        empty={!rows.length}
      >
        <div className="notification-list">
          {rows.map((n) => (
            <article
              className={`notification-card ${n.readAt ? "is-read" : ""}`}
              key={n.id}
            >
              <span className={`notification-icon ${n.readAt ? "" : "purple"}`}>
                <Bell size={20} />
              </span>
              <div className="notification-body">
                <div className="notification-title">
                  <h2>{n.title}</h2>
                  {!n.readAt && <span className="chip blue">Новое</span>}
                </div>
                <p>{n.body}</p>
                {(n.before || n.after) && (
                  <div className="diff-grid">
                    <div>
                      <span>Было</span>
                      <Diff value={n.before} />
                    </div>
                    <ArrowRight size={17} />
                    <div>
                      <span>Стало</span>
                      <Diff value={n.after} />
                    </div>
                  </div>
                )}
                <small>
                  {date(n.createdAt, {
                    day: "numeric",
                    month: "long",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  · {n.readAt ? "Прочитано" : "Не прочитано"}
                </small>
                <div className="notification-actions">
                  <Link className="text-link" href={n.href || "/campus"}>
                    Открыть <ArrowRight size={14} />
                  </Link>
                  {!n.readAt && (
                    <button
                      className="text-button"
                      disabled={busy === n.id}
                      onClick={() => read(n.id)}
                    >
                      {busy === n.id ? "Сохраняем…" : "Отметить прочитанным"}
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </State>
    </>
  );
}
function Diff({ value }: { value: Row | null }) {
  if (!value) return <p>—</p>;
  const names: Record<string, string> = {
    startsAt: "Начало",
    endsAt: "Окончание",
    room: "Аудитория",
    roomName: "Аудитория",
    teacher: "Преподаватель",
    teacherName: "Преподаватель",
    status: "Статус",
    title: "Тема",
    note: "Примечание",
    type: "Тип занятия / работы",
    subject: "Предмет",
    group: "Группа",
    description: "Описание",
  };
  const statuses: Record<string, string> = {
    SCHEDULED: "Запланировано",
    CANCELLED: "Отменено",
    MOVED: "Перенесено",
    SUBSTITUTED: "Замена",
    COMPLETED: "Проведено",
  };
  const entries = Object.entries(value).filter(
    ([k, v]) => k in names && v != null && v !== "",
  );
  if (!entries.length) return <p>Подробности — в тексте уведомления</p>;
  return (
    <dl>
      {entries.map(([k, v]) => (
        <div key={k}>
          <dt>{names[k]}</dt>
          <dd>
            {k.endsWith("At")
              ? date(v, {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : k === "status"
                ? statuses[String(v)] || "Обновлено"
                : typeof v === "object"
                  ? v.name || "Уточнено"
                  : String(v)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
function Profile({ user }: { user: Row }) {
  const resource = useResource("profile");
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState("");
  const profile = resource.data?.user || resource.data || user;
  const memberships = resource.data?.memberships || profile.memberships || [];
  return (
    <>
      <PageHeading
        title="Мой профиль"
        subtitle="Личная информация и учебные данные. Группу, роль и назначения меняет администратор."
      />
      <State
        loading={resource.loading}
        error={resource.error}
        retry={resource.reload}
      >
        <div className="profile-layout">
          <section className="panel profile-card">
            <span className="avatar extra-large">
              {profile.name?.slice(0, 1)}
            </span>
            <h2>{profile.name}</h2>
            <span className="chip blue">{roleNames[profile.role]}</span>
            <p>{profile.bio || "Краткое описание пока не добавлено"}</p>
            <button
              className="button secondary"
              onClick={() => setEditing(true)}
            >
              <UserRound size={16} /> Редактировать профиль
            </button>
          </section>
          <section className="panel profile-details">
            <h2>Личные и учебные данные</h2>
            <dl>
              <div>
                <dt>ФИО</dt>
                <dd>{profile.name}</dd>
              </div>
              <div>
                <dt>Электронная почта</dt>
                <dd>{profile.email}</dd>
              </div>
              <div>
                <dt>Контактный телефон</dt>
                <dd>{profile.phone || "Не указан"}</dd>
              </div>
              <div>
                <dt>Роль</dt>
                <dd>{roleNames[profile.role]}</dd>
              </div>
              {memberships.map((m: Row) => (
                <div key={m.id}>
                  <dt>Группа · период</dt>
                  <dd>
                    {m.group?.name} · {m.period?.name}
                    <small>
                      {m.group?.course} курс · {m.group?.program}
                    </small>
                  </dd>
                </div>
              ))}
            </dl>
            <div className="panel-hint">
              <ShieldCheck size={18} />
              <span>
                Учебная группа и роль назначаются администратором. Контактные
                данные можно изменить в профиле.
              </span>
            </div>
          </section>
        </div>
      </State>
      {editing && (
        <ModalForm
          title="Редактировать профиль"
          description="Разрешены только контактный телефон и краткое описание."
          action="saveProfile"
          initial={{ phone: profile.phone, bio: profile.bio }}
          fields={[
            { name: "phone", label: "Телефон", type: "tel" },
            { name: "bio", label: "Краткое описание", type: "textarea" },
          ]}
          onClose={() => setEditing(false)}
          onSaved={() => {
            resource.reload();
            setSaved("Профиль сохранён");
          }}
        />
      )}
      {saved && <Toast text={saved} onClose={() => setSaved("")} />}
    </>
  );
}
function CampusNews() {
  const resource = useResource("news");
  const [selected, setSelected] = useState<Row | null>(null);
  const rows: Row[] = Array.isArray(resource.data) ? resource.data : [];
  return (
    <>
      <PageHeading
        title="Новости и объявления"
        subtitle="Публикации, доступные вам: общие новости и адресные объявления."
      />
      <State
        loading={resource.loading}
        error={resource.error}
        retry={resource.reload}
        empty={!rows.length}
      >
        {selected ? (
          <article className="panel campus-article">
            <button className="text-button" onClick={() => setSelected(null)}>
              ← Все новости
            </button>
            <span className="chip blue">{selected.category}</span>
            <h1>{selected.title}</h1>
            <small>
              {date(selected.publishedAt)} · {selected.author?.name}
            </small>
            <div className="article-body">{selected.body}</div>
          </article>
        ) : (
          <div className="news-grid">
            {rows.map((n, i) => (
              <button
                className="news-card news-card-button"
                key={n.id}
                onClick={() => setSelected(n)}
              >
                <div className={`news-art art-${i % 3}`}>
                  <span>{n.category}</span>
                  <GraduationCap size={60} />
                </div>
                <div className="news-card-body">
                  <span className="tiny-label">{date(n.publishedAt)}</span>
                  <h3>{n.title}</h3>
                  <p>{n.body?.slice(0, 120)}</p>
                  <span className="text-link">
                    Читать <ArrowRight size={15} />
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </State>
    </>
  );
}
