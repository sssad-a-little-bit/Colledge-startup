"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  BookOpen,
  List,
  Plus,
  Search,
  Users,
  X,
} from "lucide-react";
import {
  api,
  date,
  dateKey,
  PageHeading,
  Pagination,
  Row,
  State,
  Toast,
  usePagedResource,
  utcInput,
} from "./ui";
import styles from "./gradebook.module.css";

type Lookups = {
  assignments: Row[];
  assessments: Row[];
  periods: Row[];
  scales: Row[];
};
const emptyLookups: Lookups = {
  assignments: [],
  assessments: [],
  periods: [],
  scales: [],
};
const unique = (rows: Row[]) => [
  ...new Map(rows.map((row) => [row.id, row])).values(),
];
const sortNames = (rows: Row[]) =>
  [...rows].sort((a, b) => String(a.name).localeCompare(String(b.name), "ru"));

function roster(assignments: Row[]) {
  return sortNames(
    unique(
      assignments.flatMap((a) =>
        (a.group?.memberships || [])
          .filter((m: Row) => m.user?.active !== false)
          .map((m: Row) => ({ ...m.user, groupId: a.groupId })),
      ),
    ),
  );
}

function scoreAverage(rows: Row[]) {
  const scores = rows.filter((g) => g.kind === "SCORE" && g.value !== null);
  if (!scores.length || new Set(scores.map((g) => g.scaleId)).size > 1)
    return "—";
  return (
    scores.reduce((sum, g) => sum + Number(g.value), 0) / scores.length
  ).toFixed(1);
}

function resultLabel(grade: Row) {
  return grade.kind === "ABSENT"
    ? "Пропуск"
    : grade.kind === "UNGRADED"
      ? "Без оценки"
      : String(grade.value);
}

export function Grades({ user }: { user: Row }) {
  const staff = user.role !== "STUDENT";
  const canManage =
    user.role === "TEACHER" || (user.role === "ADMIN" && user.canManageGrades);
  const [mode, setMode] = useState(staff ? "journal" : "grades");
  const [groupId, setGroupId] = useState("");
  const [groupSearch, setGroupSearch] = useState("");
  const [assignmentId, setAssignmentId] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [lookups, setLookups] = useState<Lookups>(emptyLookups);
  const [lookupError, setLookupError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState<Row | null>(null);
  const [history, setHistory] = useState<Row | null>(null);
  const [saved, setSaved] = useState("");
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setGroupId(query.get("groupId") || "");
    setAssignmentId(query.get("assignmentId") || "");
  }, []);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      api("assignments"),
      api("assessments"),
      api("periods"),
      api("scales"),
    ])
      .then(([assignments, assessments, periods, scales]) => {
        if (alive) {
          setLookups({ assignments, assessments, periods, scales });
          setLookupError("");
        }
      })
      .catch((error) => {
        if (alive) setLookupError(error.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [revision]);
  const groups = sortNames(
    unique(lookups.assignments.map((a) => a.group).filter(Boolean)),
  );
  const matchingGroups = groups.filter((g) =>
    String(g.name).toLowerCase().includes(groupSearch.toLowerCase().trim()),
  );
  const availableAssignments = lookups.assignments.filter(
    (a) =>
      (!groupId || a.groupId === groupId) &&
      (!periodId || a.periodId === periodId),
  );
  const selectedAssignments = availableAssignments.filter(
    (a) => !assignmentId || a.id === assignmentId,
  );
  const students = roster(selectedAssignments);
  const selectedGroup = groups.find((g) => g.id === groupId);
  const query = new URLSearchParams({
    ...(groupId ? { groupId } : {}),
    ...(groupSearch.trim() ? { groupSearch: groupSearch.trim() } : {}),
    ...(assignmentId ? { assignmentId } : {}),
    ...(periodId ? { periodId } : {}),
    ...(studentId ? { studentId } : {}),
  }).toString();
  function selectGroup(id: string) {
    setGroupId(id);
    setAssignmentId("");
    setStudentId("");
  }
  function newGrade(extra: Row = {}) {
    setEditing({
      kind: "SCORE",
      workType: "Практическая работа",
      date: dateKey(new Date()),
      groupId,
      assignmentId:
        assignmentId ||
        (selectedAssignments.length === 1 ? selectedAssignments[0].id : ""),
      studentId,
      ...extra,
    });
  }
  return (
    <>
      <PageHeading
        title={staff ? "Оценки и журнал" : "Мои оценки"}
        subtitle={
          staff
            ? "Выберите группу и предмет. В журнале видны все ученики, в том числе без оценок."
            : "Результаты работ по предметам. Баллы — от 0 до 100."
        }
        action={
          canManage ? (
            <button
              className="button primary"
              onClick={() => newGrade()}
              disabled={loading || !!lookupError || !lookups.assignments.length}
            >
              <Plus size={17} /> Выставить оценку
            </button>
          ) : undefined
        }
      />
      {staff && (
        <div className={styles.tabs} role="tablist" aria-label="Вид оценок">
          <button
            role="tab"
            aria-selected={mode === "journal"}
            onClick={() => setMode("journal")}
          >
            <BookOpen size={17} /> Журнал группы
          </button>
          <button
            role="tab"
            aria-selected={mode === "grades"}
            onClick={() => setMode("grades")}
          >
            <List size={17} /> Список оценок
          </button>
        </div>
      )}
      <div className={`panel ${styles.filters}`} aria-label="Фильтры журнала">
        {staff && (
          <>
            <label>
              <span>Найти группу</span>
              <div className={styles.search}>
                <Search size={16} />
                <input
                  type="search"
                  aria-label="Поиск группы"
                  placeholder="Название группы"
                  value={groupSearch}
                  onChange={(e) => {
                    setGroupSearch(e.target.value);
                    selectGroup("");
                  }}
                />
              </div>
            </label>
            <label>
              <span>Группа</span>
              <select
                aria-label="Группа"
                value={groupId}
                onChange={(e) => {
                  selectGroup(e.target.value);
                  setGroupSearch("");
                }}
              >
                <option value="">Все доступные группы</option>
                {matchingGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <label>
          <span>Предмет</span>
          <select
            aria-label="Предмет"
            value={assignmentId}
            onChange={(e) => {
              setAssignmentId(e.target.value);
              setStudentId("");
            }}
          >
            <option value="">Все предметы</option>
            {availableAssignments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.subject?.name}
                {!groupId ? ` · ${a.group?.name}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Учебный период</span>
          <select
            aria-label="Учебный период"
            value={periodId}
            onChange={(e) => {
              setPeriodId(e.target.value);
              setAssignmentId("");
              setStudentId("");
            }}
          >
            <option value="">Все периоды</option>
            {lookups.periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {staff && (
          <label>
            <span>Ученик</span>
            <select
              aria-label="Ученик"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
            >
              <option value="">Все ученики</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className={styles.filterActions}>
          <button
            className="text-button"
            onClick={() => {
              selectGroup("");
              setGroupSearch("");
              setPeriodId("");
            }}
          >
            Сбросить фильтры
          </button>
          <a
            className="button secondary"
            href={`/api/export?resource=grades&${query}`}
          >
            <ArrowDownToLine size={16} /> CSV
          </a>
        </div>
      </div>
      <State
        loading={loading}
        error={lookupError}
        retry={() => setRevision((n) => n + 1)}
      >
        {mode === "journal" && staff ? (
          groupId ? (
            <Journal
              key={`${query}:${revision}`}
              query={query}
              group={selectedGroup}
              assignments={selectedAssignments}
              studentId={studentId}
              canManage={canManage}
              onAdd={(s) => newGrade({ studentId: s.id })}
              onEdit={setEditing}
            />
          ) : (
            <section className={styles.groupPicker}>
              <h2>Откройте журнал группы</h2>
              <p>Выберите группу ниже или найдите её по названию в фильтре.</p>
              <div className={styles.groupGrid}>
                {matchingGroups.map((group) => (
                  <button
                    key={group.id}
                    className={styles.groupButton}
                    onClick={() => {
                      selectGroup(group.id);
                      setGroupSearch("");
                    }}
                  >
                    <Users size={23} />
                    <strong>{group.name}</strong>
                    <span>
                      {
                        roster(
                          lookups.assignments.filter(
                            (a) => a.groupId === group.id,
                          ),
                        ).length
                      }{" "}
                      учеников
                    </span>
                    <small>Открыть журнал →</small>
                  </button>
                ))}
              </div>
              {!matchingGroups.length && (
                <p className={styles.hint}>
                  Групп с таким названием нет среди доступных вам назначений.
                </p>
              )}
            </section>
          )
        ) : (
          <GradeList
            key={`${query}:${revision}`}
            query={query}
            staff={staff}
            canManage={canManage}
            onEdit={setEditing}
            onHistory={setHistory}
          />
        )}
      </State>
      {editing && (
        <GradeForm
          initial={editing}
          lookups={lookups}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setRevision((n) => n + 1);
            setSaved("Оценка сохранена");
          }}
        />
      )}
      {history && (
        <GradeHistory grade={history} onClose={() => setHistory(null)} />
      )}
      {saved && <Toast text={saved} onClose={() => setSaved("")} />}
    </>
  );
}

function GradeList({
  query,
  staff,
  canManage,
  onEdit,
  onHistory,
}: {
  query: string;
  staff: boolean;
  canManage: boolean;
  onEdit: (g: Row) => void;
  onHistory: (g: Row) => void;
}) {
  const resource = usePagedResource(`grades?${query}`);
  const rows: Row[] = Array.isArray(resource.data) ? resource.data : [];
  return (
    <>
      <State
        loading={resource.loading}
        error={resource.error}
        retry={resource.reload}
      >
        <div className={styles.summary}>
          <strong>
            {scoreAverage(rows)} <small>средний балл</small>
          </strong>
          <span>
            По числовым оценкам на этой странице. Пропуски и записи без оценки
            не учитываются.
          </span>
        </div>
        {rows.length ? (
          <div className="panel table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Предмет / работа</th>
                  {staff && (
                    <>
                      <th>Группа</th>
                      <th>Ученик</th>
                    </>
                  )}
                  <th>Дата</th>
                  <th>Результат</th>
                  <th>Комментарий</th>
                  {staff && <th>Действия</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((g) => (
                  <tr key={g.id}>
                    <td data-label="Предмет">
                      <strong>{g.assignment?.subject?.name}</strong>
                      <small>{g.workType}</small>
                    </td>
                    {staff && (
                      <>
                        <td data-label="Группа">{g.assignment?.group?.name}</td>
                        <td data-label="Ученик">{g.student?.name}</td>
                      </>
                    )}
                    <td data-label="Дата">{date(g.date)}</td>
                    <td data-label="Результат">
                      <span
                        className={`grade-chip ${g.kind === "SCORE" ? "good" : "ungraded"}`}
                      >
                        {resultLabel(g)}
                      </span>
                    </td>
                    <td data-label="Комментарий">{g.comment || "—"}</td>
                    {staff && (
                      <td className="table-actions">
                        {canManage && (
                          <button
                            className="text-button"
                            onClick={() => onEdit(g)}
                          >
                            Исправить
                          </button>
                        )}
                        {canManage && (
                          <button
                            className="text-button"
                            onClick={() => onHistory(g)}
                          >
                            История
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <h3>Оценок по выбранным фильтрам нет</h3>
            <p>Измените фильтры или добавьте результат работы.</p>
          </div>
        )}
      </State>
      <Pagination resource={resource} />
    </>
  );
}

function Journal({
  query,
  group,
  assignments,
  studentId,
  canManage,
  onAdd,
  onEdit,
}: {
  query: string;
  group?: Row;
  assignments: Row[];
  studentId: string;
  canManage: boolean;
  onAdd: (s: Row) => void;
  onEdit: (g: Row) => void;
}) {
  const [grades, setGrades] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    async function load() {
      const rows: Row[] = [];
      for (let offset = 0; ; offset += 100) {
        const page = await api(`grades?${query}&limit=100&offset=${offset}`);
        if (!alive) return;
        rows.push(...page);
        if (page.length < 100) break;
      }
      if (alive) {
        setGrades(rows);
        setError("");
      }
    }
    load()
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [query, revision]);
  const students = roster(assignments).filter(
    (s) => !studentId || s.id === studentId,
  );
  return (
    <State
      loading={loading}
      error={error}
      retry={() => setRevision((n) => n + 1)}
    >
      <div className={styles.journalHeading}>
        <div>
          <h2>{group?.name || "Журнал группы"}</h2>
          <p>
            {students.length} учеников · {assignments.length} назначений по
            предметам
          </p>
        </div>
        <span className="chip blue">Баллы 0–100</span>
      </div>
      {students.length ? (
        <div className={`panel table-wrap ${styles.journal}`}>
          <table>
            <thead>
              <tr>
                <th>Ученик</th>
                <th>Предметы и результаты</th>
                <th>Средний балл</th>
                {canManage && <th>Действие</th>}
              </tr>
            </thead>
            <tbody>
              {students.map((student) => {
                const marks = grades.filter((g) => g.studentId === student.id);
                return (
                  <tr key={student.id}>
                    <td data-label="Ученик">
                      <strong>{student.name}</strong>
                      <small>{group?.name}</small>
                    </td>
                    <td data-label="Предметы и результаты">
                      {assignments.map((a) => {
                        const values = marks.filter(
                          (g) => g.assignmentId === a.id,
                        );
                        return (
                          <div className={styles.subjectMarks} key={a.id}>
                            <span>{a.subject?.name}</span>
                            <div>
                              {values.length ? (
                                values.map((grade) =>
                                  canManage ? (
                                    <button
                                      type="button"
                                      key={grade.id}
                                      className={`grade-chip ${grade.kind === "SCORE" ? "good" : "ungraded"}`}
                                      title={`${grade.workType} · ${date(grade.date)}. Нажмите для исправления`}
                                      aria-label={`${student.name}: ${resultLabel(grade)}, ${grade.workType}, ${date(grade.date)}. Исправить`}
                                      onClick={() => onEdit(grade)}
                                    >
                                      {resultLabel(grade)}
                                    </button>
                                  ) : (
                                    <span
                                      key={grade.id}
                                      className={`grade-chip ${grade.kind === "SCORE" ? "good" : "ungraded"}`}
                                      title={`${grade.workType} · ${date(grade.date)}`}
                                    >
                                      {resultLabel(grade)}
                                    </span>
                                  ),
                                )
                              ) : (
                                <small>Оценок пока нет</small>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </td>
                    <td data-label="Средний балл">{scoreAverage(marks)}</td>
                    {canManage && (
                      <td>
                        <button
                          className="button secondary"
                          onClick={() => onAdd(student)}
                        >
                          <Plus size={15} /> Оценка
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          <h3>Ученики не найдены</h3>
          <p>
            Выберите другой предмет или учебный период. Состав группы
            настраивается в администрировании.
          </p>
        </div>
      )}
      <p className={styles.hint}>
        В журнале показан текущий состав группы. «Оценок пока нет» означает
        отсутствие записей, а не нулевой балл.
      </p>
    </State>
  );
}

function GradeForm({
  initial,
  lookups,
  onClose,
  onSaved,
}: {
  initial: Row;
  lookups: Lookups;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const initialAssignment = lookups.assignments.find(
    (a) => a.id === initial.assignmentId,
  );
  const [groupId, setGroupId] = useState(
    initialAssignment?.groupId || initial.groupId || "",
  );
  const [assignmentId, setAssignmentId] = useState(initial.assignmentId || "");
  const [studentId, setStudentId] = useState(initial.studentId || "");
  const [kind, setKind] = useState(initial.kind || "SCORE");
  const [value, setValue] = useState(String(initial.value ?? ""));
  const [assessmentId, setAssessmentId] = useState(initial.assessmentId || "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [key] = useState(() => crypto.randomUUID());
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const groups = sortNames(
    unique(lookups.assignments.map((a) => a.group).filter(Boolean)),
  );
  const assignments = lookups.assignments.filter((a) => a.groupId === groupId);
  const selected = assignments.find((a) => a.id === assignmentId);
  const students = roster(selected ? [selected] : assignments);
  if (
    initial.id &&
    initial.student &&
    !students.some((s) => s.id === initial.studentId)
  )
    students.push(initial.student);
  const scoreInvalid =
    kind === "SCORE" &&
    value !== "" &&
    (!Number.isInteger(Number(value)) ||
      Number(value) < 0 ||
      Number(value) > 100);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (!groupId || !assignmentId || !studentId) {
      setError("Выберите группу, предмет и ученика.");
      return;
    }
    if (kind === "SCORE" && (value.trim() === "" || scoreInvalid)) {
      setError(
        "Введите целое число от 0 до 100. Отрицательные баллы и значения выше 100 недопустимы.",
      );
      return;
    }
    const form = new FormData(e.currentTarget);
    const reason = String(form.get("reason") || "").trim();
    if (initial.id && reason.length < 3) {
      setError("Укажите причину исправления: не менее 3 символов.");
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(initial.id ? { id: initial.id, version: initial.version } : {}),
          action: "saveGrade",
          key,
          assignmentId,
          studentId,
          scaleId:
            initial.scaleId ||
            lookups.scales.find((s) => s.min === 0 && s.max === 100)?.id ||
            "demo100",
          assessmentId: assessmentId || null,
          kind,
          value: kind === "SCORE" ? Number(value) : null,
          workType: String(form.get("workType") || "").trim(),
          date: utcInput(String(form.get("date")) + "T12:00"),
          comment: String(form.get("comment") || "").trim(),
          reason,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw Error(result.error?.message || "Не удалось сохранить оценку");
      onSaved();
      onClose();
    } catch (e) {
      setError(
        e instanceof TypeError
          ? "Нет связи с сервером. Повторите сохранение."
          : e instanceof Error
            ? e.message
            : "Не удалось сохранить оценку",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className={`modal ${styles.gradeDialog}`}
      aria-labelledby="grade-form-title"
      onCancel={(e) => {
        if (pending) e.preventDefault();
        else onClose();
      }}
    >
      <div className="modal-header">
        <div>
          <h2 id="grade-form-title">
            {initial.id ? "Исправить оценку" : "Выставить оценку"}
          </h2>
          <p className="muted">
            Сначала выберите группу, затем предмет и ученика.
          </p>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Закрыть"
          onClick={onClose}
          disabled={pending}
        >
          <X size={21} />
        </button>
      </div>
      <form onSubmit={submit}>
        <div className="form-grid">
          <label>
            Группа
            <select
              required
              value={groupId}
              disabled={!!initial.id || pending}
              onChange={(e) => {
                setGroupId(e.target.value);
                setAssignmentId("");
                setStudentId("");
                setAssessmentId("");
              }}
            >
              <option value="">Выберите группу</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Предмет
            <select
              required
              value={assignmentId}
              disabled={!!initial.id || !groupId || pending}
              onChange={(e) => {
                setAssignmentId(e.target.value);
                const nextAssignment = assignments.find(
                  (a) => a.id === e.target.value,
                );
                if (
                  !nextAssignment ||
                  !roster([nextAssignment]).some((s) => s.id === studentId)
                )
                  setStudentId("");
                setAssessmentId("");
              }}
            >
              <option value="">Выберите предмет</option>
              {assignments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.subject?.name} · {a.period?.name}
                </option>
              ))}
            </select>
          </label>
          <label className="span-2">
            Ученик
            <select
              required
              value={studentId}
              disabled={!!initial.id || !assignmentId || pending}
              onChange={(e) => setStudentId(e.target.value)}
            >
              <option value="">Выберите ученика этой группы</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Тип записи
            <select
              value={kind}
              disabled={pending}
              onChange={(e) => {
                setKind(e.target.value);
                setError("");
              }}
            >
              <option value="SCORE">Балл</option>
              <option value="ABSENT">Пропуск</option>
              <option value="UNGRADED">Без оценки</option>
            </select>
          </label>
          <label>
            Балл от 0 до 100
            <input
              aria-describedby="grade-score-hint"
              aria-invalid={scoreInvalid}
              name="value"
              type="number"
              min={0}
              max={100}
              step={1}
              required={kind === "SCORE"}
              disabled={kind !== "SCORE" || pending}
              value={kind === "SCORE" ? value : ""}
              onChange={(e) => {
                e.currentTarget.setCustomValidity("");
                setValue(e.target.value);
                setError("");
              }}
              onInvalid={(e) => {
                e.currentTarget.setCustomValidity(
                  "Введите целое число от 0 до 100.",
                );
                setError(
                  "Введите целое число от 0 до 100. Отрицательные баллы и значения выше 100 недопустимы.",
                );
              }}
            />
            <small className="field-hint" id="grade-score-hint">
              {kind === "SCORE"
                ? "Целое число от 0 до 100 включительно."
                : "Для пропуска и записи без оценки балл не нужен."}
            </small>
          </label>
          <label>
            Вид работы
            <input
              name="workType"
              required
              maxLength={120}
              defaultValue={initial.workType || "Практическая работа"}
              disabled={pending}
            />
          </label>
          <label>
            Дата работы
            <input
              name="date"
              type="date"
              required
              defaultValue={
                initial.date ? dateKey(initial.date) : dateKey(new Date())
              }
              disabled={pending}
            />
          </label>
          <label className="span-2">
            Связанная контрольная
            <select
              value={assessmentId}
              disabled={!assignmentId || pending}
              onChange={(e) => setAssessmentId(e.target.value)}
            >
              <option value="">Не привязывать</option>
              {lookups.assessments
                .filter((a) => a.assignmentId === assignmentId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title} · {date(a.startsAt)}
                  </option>
                ))}
            </select>
          </label>
          <label className="span-2">
            Комментарий
            <textarea
              name="comment"
              rows={3}
              maxLength={1200}
              defaultValue={initial.comment || ""}
              disabled={pending}
            />
          </label>
          {initial.id && (
            <label className="span-2">
              Причина исправления
              <input
                name="reason"
                required
                minLength={3}
                maxLength={500}
                disabled={pending}
              />
              <small className="field-hint">
                Причина и прежний результат сохранятся в истории.
              </small>
            </label>
          )}
        </div>
        {error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}
        <div className="modal-footer">
          <button
            type="button"
            className="button secondary"
            onClick={onClose}
            disabled={pending}
          >
            Отмена
          </button>
          <button className="button primary" disabled={pending}>
            {pending ? "Сохраняем…" : "Сохранить оценку"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function GradeHistory({ grade, onClose }: { grade: Row; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    let alive = true;
    api(`gradeHistory?id=${encodeURIComponent(grade.id)}`)
      .then((data) => {
        if (alive) setRows(data);
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
  }, [grade.id]);
  return (
    <dialog
      ref={dialog}
      className="modal history-dialog"
      aria-labelledby="history-title"
      onCancel={onClose}
    >
      <div className="modal-header">
        <h2 id="history-title">История исправлений</h2>
        <button className="icon-button" aria-label="Закрыть" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      <State loading={loading} error={error}>
        {rows.length ? (
          rows.map((entry) => (
            <div className="history-item" key={entry.id}>
              <strong>{entry.reason}</strong>
              <p>
                {resultLabel(entry.oldValue)} → {resultLabel(entry.newValue)}
              </p>
              {entry.oldValue?.comment !== entry.newValue?.comment && (
                <p>
                  Комментарий: {entry.oldValue?.comment || "—"} →{" "}
                  {entry.newValue?.comment || "—"}
                </p>
              )}
              <small>
                {date(entry.createdAt, {
                  day: "numeric",
                  month: "long",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </small>
            </div>
          ))
        ) : (
          <p className="muted">Исправлений пока нет.</p>
        )}
      </State>
    </dialog>
  );
}
