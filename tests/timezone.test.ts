import { describe, it, expect } from "vitest";
import { dateKey, utcInput } from "../components/ui";
describe("Asia/Almaty: преобразование учебного локального времени", () => {
  it("применяет IANA-правила, включая историческое изменение зоны", () => {
    expect(utcInput("2023-11-07T09:00")).toBe("2023-11-07T03:00:00.000Z");
    expect(utcInput("2026-11-07T09:00")).toBe("2026-11-07T04:00:00.000Z");
  });
  it("не теряет локальную дату около полуночи UTC", () => {
    expect(dateKey("2026-11-07T21:00:00Z")).toBe("2026-11-08");
    expect(utcInput("2026-11-08T00:15")).toBe("2026-11-07T19:15:00.000Z");
  });
});
