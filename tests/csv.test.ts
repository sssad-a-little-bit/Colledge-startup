import { describe, it, expect } from "vitest";
import { inspectCsv, encodeCsv } from "../lib/csv";
describe("CSV: границы, корректность и безопасность", () => {
  it("проверяет номера строк и отклоняет повтор внутри файла", () => {
    const result = inspectCsv(
      "groups",
      "name,course,program\nДЕМО,1,Программа\nДЕМО,1,Программа\nБрак,9,Программа",
    );
    expect(result.errors.map((e) => e.row)).toEqual([3, 4]);
  });
  it("поддерживает кавычки и запятые в названии", () => {
    const result = inspectCsv("subjects", 'name\n"Базы данных, практика"');
    expect(result.errors).toEqual([]);
    expect(result.rows[0].name).toBe("Базы данных, практика");
  });
  it("отклоняет даты без зоны и обратный интервал", () => {
    const head = "assignmentId,roomId,startsAt,endsAt,status,note\n";
    expect(
      inspectCsv(
        "schedule",
        head + "a,r,2026-11-09T09:00:00,2026-11-09T10:30:00,SCHEDULED,",
      ).errors,
    ).toHaveLength(1);
    expect(
      inspectCsv(
        "schedule",
        head +
          "a,r,2026-11-09T10:30:00+05:00,2026-11-09T09:00:00+05:00,SCHEDULED,",
      ).errors,
    ).toHaveLength(1);
  });
  it("отклоняет повреждённые и превышающие лимиты файлы", () => {
    expect(inspectCsv("rooms", 'name\n"broken').errors).toHaveLength(1);
    expect(
      inspectCsv("rooms", "name\n" + "x".repeat(262145)).errors,
    ).toHaveLength(1);
    expect(
      inspectCsv(
        "rooms",
        "name\n" + Array.from({ length: 501 }, (_, i) => "room" + i).join("\n"),
      ).errors,
    ).toHaveLength(1);
  });
  it("нейтрализует формулы CSV и экранирует кавычки", () => {
    const csv = encodeCsv([
      ["=1+1", " +SUM(A1:A2)", "@cmd", "-2", 'обычный "текст"', null],
    ]);
    expect(csv).toContain('"\'=1+1"');
    expect(csv).toContain('"\' +SUM(A1:A2)"');
    expect(csv).toContain('"\'@cmd"');
    expect(csv).toContain('"обычный ""текст"""');
  });
});
