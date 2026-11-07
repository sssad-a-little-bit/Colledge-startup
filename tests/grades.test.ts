import { describe, expect, it } from "vitest";
import { gradeScore } from "../lib/grades";

describe("допустимый диапазон оценки", () => {
  it.each([0, 1, 50, 99, 100, "0", "100"])("принимает %s", (value) => {
    expect(gradeScore(value)).toBe(Number(value));
  });
  it.each([
    -1,
    101,
    -500,
    500,
    0.5,
    NaN,
    Infinity,
    "-1",
    "101",
    "abc",
    null,
    undefined,
    "",
    " ",
    true,
  ])("отклоняет %s", (value) =>
    expect(() => gradeScore(value)).toThrow(/от 0 до 100/),
  );
  it("не разрешает выйти за 0–100 даже с более широкой шкалой", () => {
    expect(() => gradeScore(-1, -100, 200)).toThrow();
    expect(() => gradeScore(101, -100, 200)).toThrow();
  });
  it("соблюдает более узкие границы выбранной шкалы", () => {
    expect(gradeScore(5, 1, 5)).toBe(5);
    expect(() => gradeScore(6, 1, 5)).toThrow(/от 1 до 5/);
  });
});
