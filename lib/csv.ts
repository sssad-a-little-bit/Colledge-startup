import { parse } from "csv-parse/sync";
import { z } from "zod";

export const importKinds = ["groups", "subjects", "rooms", "schedule"] as const;
export type ImportKind = (typeof importKinds)[number];
export type CsvIssue = { row: number; message: string };

const text = z
  .string()
  .trim()
  .min(1, "Поле обязательно")
  .max(160, "Не более 160 символов");
const timestamp = z
  .string()
  .datetime({
    offset: true,
    message:
      "Дата должна быть ISO 8601 с часовым поясом, например 2026-11-09T09:00:00+05:00",
  });
const schemas = {
  groups: z
    .object({
      name: text,
      course: z.coerce.number().int().min(1).max(6),
      program: text,
    })
    .strict(),
  subjects: z.object({ name: text }).strict(),
  rooms: z.object({ name: text }).strict(),
  schedule: z
    .object({
      assignmentId: z.string().trim().min(1).max(100),
      roomId: z.string().trim().min(1).max(100),
      startsAt: timestamp,
      endsAt: timestamp,
      status: z
        .enum(["SCHEDULED", "CANCELLED", "MOVED", "SUBSTITUTED"])
        .default("SCHEDULED"),
      note: z.string().max(1000).default(""),
    })
    .strict()
    .refine((row) => new Date(row.endsAt) > new Date(row.startsAt), {
      message: "Конец занятия должен быть позже начала",
      path: ["endsAt"],
    }),
};

export const csvTemplates: Record<ImportKind, string> = {
  groups: "name,course,program\r\nДЕМО-101,1,Демонстрационная программа\r\n",
  subjects: "name\r\nДемонстрационный предмет\r\n",
  rooms: "name\r\nДемо 101\r\n",
  schedule:
    "assignmentId,roomId,startsAt,endsAt,status,note\r\nassignment-id,room-id,2026-11-09T09:00:00+05:00,2026-11-09T10:30:00+05:00,SCHEDULED,Демонстрационное занятие\r\n",
};

export function inspectCsv(
  kind: ImportKind,
  csv: string,
): { rows: Record<string, unknown>[]; errors: CsvIssue[] } {
  if (Buffer.byteLength(csv, "utf8") > 262144)
    return {
      rows: [],
      errors: [{ row: 0, message: "Файл превышает 256 КиБ" }],
    };
  let input: unknown[];
  try {
    input = parse(csv, {
      columns: (headers: string[]) => {
        if (new Set(headers).size !== headers.length)
          throw new Error("Duplicate headers");
        return headers;
      },
      bom: true,
      skip_empty_lines: true,
      trim: true,
      max_record_size: 16384,
    });
  } catch {
    return {
      rows: [],
      errors: [
        {
          row: 0,
          message:
            "Некорректный CSV: проверьте заголовки, кавычки и количество столбцов",
        },
      ],
    };
  }
  if (input.length > 500)
    return {
      rows: [],
      errors: [{ row: 0, message: "Допустимо не более 500 строк за импорт" }],
    };
  if (!input.length)
    return {
      rows: [],
      errors: [{ row: 0, message: "CSV не содержит записей" }],
    };
  const rows: Record<string, unknown>[] = [];
  const errors: CsvIssue[] = [];
  const seen = new Set<string>();
  input.forEach((value, index) => {
    const result = schemas[kind].safeParse(value);
    if (!result.success) {
      errors.push({
        row: index + 2,
        message: result.error.issues
          .map(
            (issue) => `${issue.path.join(".") || "строка"}: ${issue.message}`,
          )
          .join("; "),
      });
      rows.push(value as Record<string, unknown>);
      return;
    }
    const row = result.data as Record<string, unknown>;
    rows.push(row);
    const identity =
      kind === "schedule"
        ? `${row.assignmentId}:${row.startsAt}`
        : String(row.name).toLocaleLowerCase("ru");
    if (seen.has(identity))
      errors.push({
        row: index + 2,
        message:
          "Повтор записи внутри файла. Политика дублей: отклонить весь импорт",
      });
    seen.add(identity);
  });
  return { rows, errors };
}

/** Prefix dangerous cells before quoting to prevent spreadsheet formula evaluation. */
export function encodeCsv(rows: unknown[][]): string {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => {
            let cell =
              value == null
                ? ""
                : value instanceof Date
                  ? value.toISOString()
                  : String(value);
            if (/^[\s]*[=+@\-\t\r]/u.test(cell)) cell = `'${cell}`;
            return `"${cell.replaceAll('"', '""')}"`;
          })
          .join(","),
      )
      .join("\r\n") +
    "\r\n"
  );
}

export function csvHeaders(filename: string): HeadersInit {
  return {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
}
