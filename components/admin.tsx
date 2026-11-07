"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  FileSpreadsheet,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import {
  api,
  date,
  Field,
  ModalForm,
  options,
  PageHeading,
  Row,
  State,
  Toast,
  useResource,
  usePagedResource,
  Pagination,
} from "./ui";
const tabs = [
  ["users", "Пользователи"],
  ["reference", "Справочники"],
  ["assignments", "Назначения"],
  ["news", "Новости"],
  ["audit", "Аудит"],
  ["import", "Импорт и экспорт"],
  ["settings", "Настройки"],
];
export function Admin() {
  const [tab, setTab] = useState("users");
  return (
    <>
      <PageHeading
        eyebrow="УПРАВЛЕНИЕ ПОРТАЛОМ"
        title="Администрирование"
        subtitle="Учётные записи, учебные данные и история изменений. Доступ проверяется на сервере."
      />
      <div className="admin-shortcuts">
        <Link href="/campus/schedule">
          <span className="stat-icon purple">
            <ClipboardList size={21} />
          </span>
          <span>
            <strong>Расписание</strong>
            <small>Публикация и переносы</small>
          </span>
          <ArrowRight size={17} />
        </Link>
        <Link href="/campus/assessments">
          <span className="stat-icon orange">
            <FileSpreadsheet size={21} />
          </span>
          <span>
            <strong>Контрольные</strong>
            <small>Планирование работ</small>
          </span>
          <ArrowRight size={17} />
        </Link>
        <Link href="/campus/grades">
          <span className="stat-icon blue">
            <ShieldCheck size={21} />
          </span>
          <span>
            <strong>Журнал</strong>
            <small>С отдельным полномочием</small>
          </span>
          <ArrowRight size={17} />
        </Link>
      </div>
      <div
        className="tabs"
        role="tablist"
        aria-label="Административные разделы"
      >
        {tabs.map(([id, name]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {name}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === "reference" ? (
          <References />
        ) : tab === "import" ? (
          <ImportExport />
        ) : tab === "audit" ? (
          <Audit />
        ) : tab === "settings" ? (
          <Settings />
        ) : (
          <EntityEditor resource={tab} />
        )}
      </div>
    </>
  );
}
function References() {
  const [kind, setKind] = useState("groups");
  return (
    <>
      <div className="toolbar">
        <div className="segmented">
          {[
            ["groups", "Группы"],
            ["subjects", "Предметы"],
            ["rooms", "Аудитории"],
            ["periods", "Учебные периоды"],
            ["scales", "Шкалы оценок"],
          ].map(([k, n]) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={kind === k ? "selected" : ""}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <EntityEditor key={kind} resource={kind} />
    </>
  );
}
const titleMap: Record<string, string> = {
  users: "Пользователи и роли",
  groups: "Учебные группы",
  subjects: "Предметы",
  rooms: "Аудитории",
  periods: "Учебные периоды",
  scales: "Шкалы оценок",
  assignments: "Назначения преподавателей",
  news: "Управление новостями",
};
const singleMap: Record<string, string> = {
  users: "пользователя",
  groups: "группу",
  subjects: "предмет",
  rooms: "аудиторию",
  periods: "учебный период",
  scales: "шкалу оценок",
  assignments: "назначение",
  news: "новость",
};
const actionMap: Record<string, string> = {
  users: "saveUser",
  groups: "saveGroup",
  subjects: "saveSubject",
  rooms: "saveRoom",
  periods: "savePeriod",
  scales: "saveScale",
  assignments: "saveAssignment",
  news: "saveNews",
};
const roles = [
  { value: "STUDENT", label: "Студент" },
  { value: "TEACHER", label: "Преподаватель" },
  { value: "ADMIN", label: "Администратор" },
];
function EntityEditor({ resource }: { resource: string }) {
  const r = usePagedResource(resource);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);
  const [lookups, setLookups] = useState<Row>({});
  const [saved, setSaved] = useState("");
  useEffect(() => {
    Promise.all(
      ["users", "groups", "subjects", "rooms", "periods"].map((k) => api(k)),
    )
      .then((v) =>
        setLookups(
          Object.fromEntries(
            ["users", "groups", "subjects", "rooms", "periods"].map((k, i) => [
              k,
              v[i],
            ]),
          ),
        ),
      )
      .catch(() => {});
  }, [resource]);
  const records: Row[] = (Array.isArray(r.data) ? r.data : []).filter(
    (x: Row) =>
      `${x.name || x.title || ""} ${x.email || ""} ${x.subject?.name || ""} ${x.group?.name || ""} ${x.teacher?.name || ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  let fields: Field[] = [];
  if (resource === "users")
    fields = [
      { name: "name", label: "ФИО", required: true },
      {
        name: "email",
        label: "Электронная почта",
        type: "email",
        required: true,
      },
      { name: "role", label: "Роль", options: roles, required: true },
      {
        name: "password",
        label: editing?.id ? "Новый пароль (необязательно)" : "Пароль",
        type: "password",
        required: !editing?.id,
        hint: "Не менее 12 символов. Создаётся локально, без отправки писем.",
      },
      {
        name: "groupId",
        label: "Группа (только студент)",
        options: options(lookups.groups),
      },
      {
        name: "periodId",
        label: "Период членства",
        options: options(lookups.periods),
      },
      { name: "active", label: "Учётная запись активна", type: "checkbox" },
      {
        name: "canManageGrades",
        label: "Отдельное право администратора исправлять оценки",
        type: "checkbox",
      },
    ];
  else if (resource === "groups")
    fields = [
      { name: "name", label: "Название группы", required: true },
      {
        name: "course",
        label: "Курс",
        type: "number",
        required: true,
        min: 1,
        max: 6,
      },
      { name: "program", label: "Образовательная программа", required: true },
      { name: "active", label: "Группа активна", type: "checkbox" },
    ];
  else if (resource === "subjects" || resource === "rooms")
    fields = [
      {
        name: "name",
        label:
          resource === "subjects" ? "Название предмета" : "Название аудитории",
        required: true,
      },
      { name: "active", label: "Запись активна", type: "checkbox" },
    ];
  else if (resource === "scales")
    fields = [
      { name: "name", label: "Название шкалы", required: true },
      {
        name: "min",
        label: "Минимальный балл",
        type: "number",
        required: true,
        min: 0,
        max: 100,
      },
      {
        name: "max",
        label: "Максимальный балл",
        type: "number",
        required: true,
        min: 0,
        max: 100,
      },
    ];
  else if (resource === "periods")
    fields = [
      { name: "name", label: "Название периода", required: true },
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
      { name: "active", label: "Период активен", type: "checkbox" },
    ];
  else if (resource === "assignments")
    fields = editing?.id
      ? [
          {
            name: "active",
            label: "Назначение активно (снятие флага отзывает доступ)",
            type: "checkbox",
          },
        ]
      : [
          {
            name: "teacherId",
            label: "Преподаватель",
            options: options(
              (lookups.users || []).filter(
                (u: Row) => u.role === "TEACHER" && u.active,
              ),
            ),
            required: true,
          },
          {
            name: "groupId",
            label: "Группа",
            options: options(lookups.groups),
            required: true,
          },
          {
            name: "subjectId",
            label: "Предмет",
            options: options(lookups.subjects),
            required: true,
          },
          {
            name: "periodId",
            label: "Учебный период",
            options: options(lookups.periods),
            required: true,
          },
        ];
  else if (resource === "news")
    fields = [
      { name: "title", label: "Заголовок", required: true },
      { name: "category", label: "Категория", required: true },
      {
        name: "body",
        label: "Текст (без HTML)",
        type: "textarea",
        required: true,
      },
      {
        name: "status",
        label: "Состояние",
        required: true,
        options: [
          { value: "DRAFT", label: "Черновик" },
          { value: "PUBLISHED", label: "Опубликовано" },
          { value: "ARCHIVED", label: "Архив" },
        ],
      },
      {
        name: "audience",
        label: "Аудитория",
        required: true,
        options: [
          { value: "PUBLIC", label: "Публично" },
          { value: "AUTHENTICATED", label: "Все вошедшие" },
          { value: "ROLE", label: "Определённая роль" },
          { value: "GROUP", label: "Определённая группа" },
        ],
      },
      {
        name: "targetRole",
        label: "Роль (для аудитории «Роль»)",
        options: roles,
      },
      {
        name: "groupId",
        label: "Группа (для аудитории «Группа»)",
        options: options(lookups.groups),
      },
    ];
  return (
    <>
      <div className="entity-heading">
        <h2>{titleMap[resource]}</h2>
        <button
          className="button primary"
          onClick={() =>
            setEditing({
              active: true,
              course: 1,
              min: 0,
              max: 100,
              role: "STUDENT",
              status: "DRAFT",
              audience: "PUBLIC",
              category: "Новости",
            })
          }
        >
          <Plus size={16} /> Добавить {singleMap[resource]}
        </button>
      </div>
      <div className="search-field">
        <Search size={17} />
        <input
          aria-label="Поиск записей на текущей странице"
          placeholder="Поиск на текущей странице…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <State
        loading={r.loading}
        error={r.error}
        retry={r.reload}
        empty={!records.length}
      >
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>
                  {resource === "assignments"
                    ? "Предмет / группа"
                    : resource === "news"
                      ? "Публикация"
                      : "Название / имя"}
                </th>
                <th>Подробности</th>
                <th>Состояние</th>
                <th>Действие</th>
              </tr>
            </thead>
            <tbody>
              {records.map((x) => (
                <tr key={x.id}>
                  <td data-label="Название">
                    <strong>
                      {resource === "assignments"
                        ? x.subject?.name
                        : x.name || x.title}
                    </strong>
                    <small>
                      {resource === "users"
                        ? x.email
                        : resource === "assignments"
                          ? `${x.group?.name} · ${x.period?.name}`
                          : x.id}
                    </small>
                  </td>
                  <td data-label="Подробности">
                    {resource === "users"
                      ? roles.find((o) => o.value === x.role)?.label
                      : resource === "groups"
                        ? `${x.course} курс · ${x.program}`
                        : resource === "assignments"
                          ? x.teacher?.name
                          : resource === "periods"
                            ? `${date(x.startsAt)} – ${date(x.endsAt)}`
                            : resource === "news"
                              ? `${x.category} · ${x.audience}`
                              : resource === "scales"
                                ? `Диапазон: ${x.min}–${x.max}`
                                : "Справочная запись"}
                  </td>
                  <td data-label="Состояние">
                    <span
                      className={`chip ${x.active === false ? "red" : "subtle"}`}
                    >
                      {resource === "news"
                        ? (
                            {
                              DRAFT: "Черновик",
                              PUBLISHED: "Опубликовано",
                              ARCHIVED: "Архив",
                            } as Row
                          )[x.status]
                        : resource === "scales"
                          ? "Настраиваемая"
                          : x.active === false
                            ? "Отключено"
                            : "Активно"}
                    </span>
                  </td>
                  <td>
                    <button
                      className="text-button"
                      onClick={() => setEditing(x)}
                    >
                      Изменить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </State>
      <Pagination resource={r} />
      {editing && (
        <ModalForm
          title={`${editing.id ? "Изменить" : "Добавить"} ${singleMap[resource]}`}
          action={actionMap[resource]}
          initial={editing}
          fields={fields}
          onClose={() => setEditing(null)}
          onSaved={() => {
            r.reload();
            setSaved("Данные сохранены");
          }}
        />
      )}
      {saved && <Toast text={saved} onClose={() => setSaved("")} />}
    </>
  );
}
function Audit() {
  const r = usePagedResource("audit");
  return (
    <>
      <div className="entity-heading">
        <h2>Последние изменения</h2>
        <span className="chip subtle">История защищена от удаления</span>
      </div>
      <State
        loading={r.loading}
        error={r.error}
        retry={r.reload}
        empty={!r.data?.length}
      >
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>Когда</th>
                <th>Автор</th>
                <th>Объект</th>
                <th>Действие и причина</th>
              </tr>
            </thead>
            <tbody>
              {(r.data || []).map((a: Row) => (
                <tr key={a.id}>
                  <td data-label="Когда">
                    {date(a.createdAt, {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td data-label="Автор">{a.actor?.name || a.actorId}</td>
                  <td data-label="Объект">
                    <strong>{a.entity}</strong>
                    <small>{a.entityId}</small>
                  </td>
                  <td data-label="Действие">
                    {a.action}
                    <small>{a.reason || "—"}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </State>
      <Pagination resource={r} />
    </>
  );
}
function Settings() {
  const r = useResource("settings");
  const [open, setOpen] = useState(false);
  return (
    <State loading={r.loading} error={r.error} retry={r.reload}>
      <section className="panel settings-panel">
        <span className="stat-icon purple">
          <Settings2 size={22} />
        </span>
        <h2>Порог учебной нагрузки</h2>
        <p>
          Предупреждать, если в один день назначено {r.data?.loadThreshold || 2}{" "}
          контрольных или больше.
        </p>
        <p className="muted">
          Настройка помогает равномерно распределять контрольные по дням.
        </p>
        <button className="button primary" onClick={() => setOpen(true)}>
          Изменить порог
        </button>
      </section>
      {open && (
        <ModalForm
          title="Порог нагрузки"
          action="saveSettings"
          initial={r.data || { loadThreshold: 2 }}
          fields={[
            {
              name: "loadThreshold",
              label: "Контрольных в день до предупреждения",
              required: true,
              type: "number",
              min: 1,
              max: 10,
            },
          ]}
          onClose={() => setOpen(false)}
          onSaved={r.reload}
        />
      )}
    </State>
  );
}
function ImportExport() {
  const [kind, setKind] = useState("groups");
  const [csv, setCsv] = useState("");
  const [result, setResult] = useState<Row | null>(null);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [committed, setCommitted] = useState(false);
  function reset() {
    setKey(crypto.randomUUID());
    setResult(null);
    setCommitted(false);
    setError("");
  }
  async function run(mode: string) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, csv, mode, key }),
      });
      const j = await r.json();
      if (!r.ok) throw Error(j.error?.message || "Не удалось обработать CSV");
      setResult(j.data);
      setCommitted(
        mode === "commit" && !j.data.errors?.length && j.data.imported > 0,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка запроса");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="import-layout">
      <section className="panel import-panel">
        <div className="panel-heading">
          <h2>
            <UploadCloud size={20} /> Импорт CSV
          </h2>
        </div>
        <p className="muted">
          Сначала проверьте файл и предпросмотр. Политика дублей: отклонить весь
          импорт. Все строки сохраняются одной транзакцией.
        </p>
        <label>
          Тип данных
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              reset();
            }}
          >
            <option value="groups">Группы</option>
            <option value="subjects">Предметы</option>
            <option value="rooms">Аудитории</option>
            <option value="schedule">Расписание</option>
          </select>
        </label>
        <a className="text-link" href={`/api/import?kind=${kind}`}>
          <ArrowDownToLine size={15} /> Скачать шаблон CSV
        </a>
        <label className="file-input">
          Выбрать CSV-файл
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) {
                if (file.size > 512000) {
                  setError("Максимальный размер файла 500 КБ");
                  return;
                }
                setCsv(await file.text());
                reset();
              }
            }}
          />
        </label>
        <label>
          Содержимое CSV
          <textarea
            rows={8}
            value={csv}
            onChange={(e) => {
              setCsv(e.target.value);
              reset();
            }}
            placeholder="Вставьте CSV по шаблону"
          />
        </label>
        {error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}
        <div className="import-actions">
          <button
            className="button secondary"
            disabled={busy || !csv || committed}
            onClick={() => run("preview")}
          >
            {busy ? "Обработка…" : "Проверить и просмотреть"}
          </button>
          {result && !result.errors?.length && !committed && (
            <button
              className="button primary"
              disabled={busy}
              onClick={() => run("commit")}
            >
              Импортировать проверенные строки
            </button>
          )}
        </div>
        {result && (
          <div className="import-result" aria-live="polite">
            {result.errors?.length ? (
              <div className="error-box">
                <div>
                  <strong>Импорт отклонён. Исходные данные сохранены.</strong>
                  <ul>
                    {result.errors.map((e: Row, i: number) => (
                      <li key={i}>
                        Строка {e.row}: {e.message}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : committed ? (
              <div className="success-box">
                <CheckCircle2 size={20} /> Импортировано записей:{" "}
                {result.imported}
              </div>
            ) : (
              <>
                <h3>Предпросмотр</h3>
                <p className="muted">
                  Ошибок предварительной проверки нет. Дубли и конфликты
                  повторно проверяются при сохранении.
                </p>
                <pre>{JSON.stringify(result.rows, null, 2)}</pre>
              </>
            )}
          </div>
        )}
      </section>
      <section className="panel export-panel">
        <h2>
          <FileSpreadsheet size={21} /> Экспорт данных
        </h2>
        <p className="muted">
          Доступ ограничен ролью и конкретными записями. Значения защищены от
          формул CSV.
        </p>
        {[
          ["groups", "Группы"],
          ["schedule", "Расписание"],
          ["grades", "Доступные оценки"],
        ].map(([r, n]) => (
          <a key={r} href={`/api/export?resource=${r}`} className="export-link">
            <span>{n}</span>
            <ArrowDownToLine size={18} />
          </a>
        ))}
        <div className="panel-hint">
          <ShieldCheck size={20} />
          <span>Экспорт оценок требует соответствующего полномочия.</span>
        </div>
      </section>
    </div>
  );
}
