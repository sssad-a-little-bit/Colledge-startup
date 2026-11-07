"use client";
import { useEffect, useRef, useState, useId } from "react";
import { AlertCircle, CheckCircle2, Loader2, X } from "lucide-react";
export type Row = Record<string, any>;
export const TZ = "Asia/Almaty";
export function date(
  d: any,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" },
) {
  if (!d) return "—";
  const v = new Date(d);
  return Number.isNaN(v.getTime())
    ? "—"
    : new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, ...options }).format(v);
}
export function clock(d: any) {
  return date(d, { hour: "2-digit", minute: "2-digit" });
}
export function dateKey(d: any) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(d));
  return `${p.find((x) => x.type === "year")?.value}-${p.find((x) => x.type === "month")?.value}-${p.find((x) => x.type === "day")?.value}`;
}
export function localInput(d: any) {
  if (!d) return "";
  return `${dateKey(d)}T${clock(d)}`;
}
export function utcInput(value: string) {
  if (!value) return null;
  const naive = new Date(value + "Z");
  let guess = naive.getTime();
  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat("sv-SE", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(guess));
    const get = (k: string) => parts.find((p) => p.type === k)?.value;
    const formatted = Date.UTC(
      Number(get("year")),
      Number(get("month")) - 1,
      Number(get("day")),
      Number(get("hour")),
      Number(get("minute")),
      Number(get("second")),
    );
    guess += naive.getTime() - formatted;
  }
  return new Date(guess).toISOString();
}
export async function api(resource: string) {
  const [name, query] = resource.split("?");
  const r = await fetch(
    `/api/portal?resource=${encodeURIComponent(name)}${query ? "&" + query : ""}`,
    { cache: "no-store" },
  );
  const j = await r.json();
  if (!r.ok) throw Error(j.error?.message || "Не удалось получить данные");
  return j.data;
}
export function useResource(resource: string) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    api(resource)
      .then((d) => {
        if (alive) {
          setData(d);
          setError("");
        }
      })
      .catch((e) => {
        if (alive)
          setError(
            e instanceof TypeError
              ? "Нет связи с сервером. Проверьте сеть и повторите."
              : e.message,
          );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [resource, revision]);
  return { data, error, loading, reload: () => setRevision((n) => n + 1) };
}

export function usePagedResource(resource: string, pageSize = 100) {
  const [page, setPage] = useState(0);
  useEffect(() => {
    setPage(0);
  }, [resource]);
  const result = useResource(
    `${resource}${resource.includes("?") ? "&" : "?"}limit=${pageSize}&offset=${page * pageSize}`,
  );
  return {
    ...result,
    page,
    pageSize,
    previous: () => setPage((p) => Math.max(0, p - 1)),
    next: () => setPage((p) => p + 1),
    count: Array.isArray(result.data) ? result.data.length : 0,
  };
}
export function Pagination({
  resource,
}: {
  resource: ReturnType<typeof usePagedResource>;
}) {
  return (
    <nav className="pagination" aria-label="Страницы списка">
      <span aria-live="polite">
        Страница {resource.page + 1} · записей{" "}
        {resource.loading ? "…" : resource.count} · до {resource.pageSize} на
        странице
      </span>
      <div>
        <button
          className="button secondary"
          disabled={resource.loading || resource.page === 0}
          onClick={resource.previous}
        >
          ← Назад
        </button>
        <button
          className="button secondary"
          disabled={resource.loading || resource.count < resource.pageSize}
          onClick={resource.next}
        >
          Далее →
        </button>
      </div>
    </nav>
  );
}

export function State({
  loading,
  error,
  retry,
  empty,
  children,
}: {
  loading?: boolean;
  error?: string;
  retry?: () => void;
  empty?: boolean;
  children: React.ReactNode;
}) {
  if (loading)
    return (
      <div className="state-box" role="status">
        <Loader2 className="spin" size={22} />
        <span>Загружаем актуальные данные…</span>
      </div>
    );
  if (error)
    return (
      <div className="error-box" role="alert">
        <AlertCircle size={20} />
        <div>
          <strong>Данные временно недоступны</strong>
          <p>{error}</p>
          <button className="button secondary" onClick={retry}>
            Повторить
          </button>
        </div>
      </div>
    );
  if (empty)
    return (
      <div className="empty">
        <div className="empty-icon">↗</div>
        <h3>Здесь пока ничего нет</h3>
        <p>Новые записи появятся после публикации.</p>
      </div>
    );
  return <>{children}</>;
}
export type Field = {
  name: string;
  label: string;
  type?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
  hint?: string;
  min?: number;
  max?: number;
};
export function ModalForm({
  title,
  description,
  fields,
  initial = {},
  action,
  onClose,
  onSaved,
  submitText = "Сохранить",
}: {
  title: string;
  description?: string;
  fields: Field[];
  initial?: Row;
  action: string;
  onClose: () => void;
  onSaved: () => void;
  submitText?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [key] = useState(() => crypto.randomUUID());
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError("");
    const payload: Row = { ...initial, action, key };
    const form = new FormData(e.currentTarget);
    for (const f of fields) {
      const val = String(form.get(f.name) || "");
      payload[f.name] =
        f.type === "number"
          ? val === ""
            ? null
            : Number(val)
          : f.type === "datetime-local"
            ? utcInput(val)
            : f.type === "date"
              ? val
                ? utcInput(val + "T12:00")
                : null
              : f.type === "checkbox"
                ? form.get(f.name) === "on"
                : val;
    }
    try {
      const r = await fetch("/api/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok) throw Error(j.error?.message || "Не удалось сохранить");
      onSaved();
      onClose();
    } catch (err) {
      setError(
        err instanceof TypeError
          ? "Нет связи с сервером. Повторите действие после восстановления соединения."
          : err instanceof Error
            ? err.message
            : "Не удалось сохранить",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby={titleId}
      onCancel={(e) => {
        if (pending) e.preventDefault();
        else onClose();
      }}
    >
      <div className="modal-header">
        <div>
          <h2 id={titleId}>{title}</h2>
          {description && <p className="muted">{description}</p>}
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Закрыть"
          disabled={pending}
          onClick={onClose}
        >
          <X size={21} />
        </button>
      </div>
      <form onSubmit={submit}>
        <div className="form-grid">
          {fields.map((f) => (
            <label
              key={f.name}
              className={f.type === "textarea" ? "span-2" : ""}
            >
              {f.label}
              {f.required && <span aria-hidden="true"> *</span>}
              {f.options ? (
                <select
                  key={f.name + ":" + f.options.map((o) => o.value).join("|")}
                  name={f.name}
                  required={f.required}
                  defaultValue={String(initial[f.name] ?? "")}
                >
                  <option value="">Выберите…</option>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.type === "textarea" ? (
                <textarea
                  name={f.name}
                  required={f.required}
                  defaultValue={String(initial[f.name] ?? "")}
                  rows={4}
                />
              ) : f.type === "checkbox" ? (
                <input
                  type="checkbox"
                  name={f.name}
                  defaultChecked={Boolean(initial[f.name])}
                />
              ) : (
                <input
                  name={f.name}
                  type={f.type || "text"}
                  required={f.required}
                  min={f.min}
                  max={f.max}
                  defaultValue={
                    f.type === "datetime-local"
                      ? localInput(initial[f.name])
                      : f.type === "date" && initial[f.name]
                        ? String(initial[f.name]).slice(0, 10)
                        : String(initial[f.name] ?? "")
                  }
                />
              )}{" "}
              {f.hint && <small className="field-hint">{f.hint}</small>}
            </label>
          ))}
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
            disabled={pending}
            onClick={onClose}
          >
            Отмена
          </button>
          <button className="button primary" disabled={pending}>
            {pending ? (
              <>
                <Loader2 size={16} className="spin" /> Сохраняем…
              </>
            ) : (
              submitText
            )}
          </button>
        </div>
      </form>
    </dialog>
  );
}
export function Toast({
  text,
  onClose,
}: {
  text: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const id = setTimeout(onClose, 6500);
    return () => clearTimeout(id);
  }, [onClose]);
  return (
    <div className="toast" role="status">
      <CheckCircle2 size={19} />
      {text}
      <button
        className="icon-button"
        aria-label="Закрыть уведомление"
        onClick={onClose}
      >
        <X size={16} />
      </button>
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  );
}
export function label(row: Row) {
  return row.name || row.title || row.email || row.id;
}
export function options(rows: Row[] = []) {
  return rows.map((r) => ({ value: r.id, label: label(r) }));
}
export function assignmentOptions(rows: Row[] = []) {
  return rows.map((r) => ({
    value: r.id,
    label: `${r.subject?.name || "Предмет"} · ${r.group?.name || "Группа"} · ${r.period?.name || ""}`,
  }));
}
