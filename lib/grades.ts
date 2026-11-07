import { AppError } from "./errors";

export function gradeScore(raw: unknown, scaleMin = 0, scaleMax = 100): number {
  if (
    raw === null ||
    raw === undefined ||
    (typeof raw === "string" && !raw.trim())
  )
    throw new AppError(
      422,
      "Введите оценку от 0 до 100. Пустое поле не равно нулю.",
    );
  const value =
    typeof raw === "number" || typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isInteger(value) || value < 0 || value > 100)
    throw new AppError(422, "Оценка должна быть целым числом от 0 до 100.");
  const min = Math.max(0, scaleMin);
  const max = Math.min(100, scaleMax);
  if (value < min || value > max)
    throw new AppError(
      422,
      `Оценка по выбранной шкале должна быть от ${min} до ${max}.`,
    );
  return value;
}
