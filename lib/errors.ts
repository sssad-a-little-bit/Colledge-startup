import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = "REQUEST_REJECTED",
  ) {
    super(message);
    this.name = "AppError";
  }
}

/** No query text, grades, identities or secrets are included in operational logs. */
export function apiError(error: unknown, requestId: string): NextResponse {
  let status = 500;
  let message = "Не удалось выполнить запрос. Повторите попытку позже.";
  let code = "INTERNAL_ERROR";
  if (error instanceof AppError) {
    ({ status, message, code } = error);
  } else if (error instanceof ZodError) {
    status = 422;
    code = "VALIDATION_ERROR";
    // Paths come from the schema; issue messages can contain submitted values.
    const fields = [
      ...new Set(
        error.issues.map((issue) => issue.path.join(".")).filter(Boolean),
      ),
    ]
      .map((field) => field.replace(/[^\p{L}\p{N}_.\[\]-]/gu, "").slice(0, 80))
      .slice(0, 8);
    message = fields.length
      ? `Проверьте значения полей: ${fields.join(", ")}.`
      : "Проверьте заполнение полей формы: обязательные значения, формат и допустимый диапазон.";
  } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
    code = error.code;
    if (["P2002", "P2003", "P2004", "P2010", "P2034"].includes(error.code)) {
      status = 409;
      message =
        "Изменение конфликтует с существующими данными. Обновите страницу и проверьте время, связи и версию записи.";
    } else if (error.code === "P2025") {
      status = 404;
      message = "Запись не найдена или уже изменена.";
    } else if (
      ["P1001", "P1002", "P1008", "P1017", "P2024"].includes(error.code)
    ) {
      status = 503;
      message =
        "База данных временно недоступна. Действие не подтверждено; повторите его позже.";
    }
  } else if (error instanceof Prisma.PrismaClientInitializationError) {
    status = 503;
    code = "DATABASE_UNAVAILABLE";
    message =
      "База данных временно недоступна. Действие не подтверждено; повторите его позже.";
  } else if (
    error instanceof Prisma.PrismaClientUnknownRequestError &&
    /23P01|exclusion constraint|conflicting key value violates/i.test(
      error.message,
    )
  ) {
    status = 409;
    code = "SCHEDULE_CONFLICT";
    message =
      "В это время преподаватель, группа или аудитория уже заняты. Измените время или аудиторию.";
  } else if (error instanceof Prisma.PrismaClientValidationError) {
    status = 422;
    code = "VALIDATION_ERROR";
    message = "Проверьте формат и диапазон переданных значений.";
  } else if (error instanceof SyntaxError) {
    status = 400;
    code = "INVALID_JSON";
    message = "Некорректный формат запроса.";
  }
  console.error(JSON.stringify({ level: "error", requestId, code, status }));
  return NextResponse.json(
    { error: { message, requestId, code } },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Request-ID": requestId,
      },
    },
  );
}
