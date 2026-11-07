import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { encode } from "next-auth/jwt";
import { randomUUID } from "node:crypto";
import { ApiClient, demoPassword } from "./helpers";

const databaseURL = process.env.TEST_DATABASE_URL;
const db = new PrismaClient({
  datasourceUrl: databaseURL || process.env.DATABASE_URL,
});
const prefix = "test-" + randomUUID().slice(0, 8);
const ids = {
  teacher: prefix + "-teacher",
  student: prefix + "-student",
  other: prefix + "-other",
  group: prefix + "-group",
  group2: prefix + "-group2",
  subject: prefix + "-subject",
  period: prefix + "-period",
  room: prefix + "-room",
  room2: prefix + "-room2",
  assignment: prefix + "-assignment",
  assignment2: prefix + "-assignment2",
  assignment3: prefix + "-assignment3",
  assignment4: prefix + "-assignment4",
};
const admin = new ApiClient("admin@demo.kit.local"),
  teacher = new ApiClient(),
  student = new ApiClient(),
  other = new ApiClient();
const post = (
  client: ApiClient,
  action: string,
  data: Record<string, unknown>,
) => client.post({ action, key: randomUUID(), ...data });
const at = (day: number, hour: number) => {
  const result = new Date();
  result.setUTCDate(result.getUTCDate() + day - 14);
  result.setUTCHours(hour, 0, 0, 0);
  return result.toISOString();
};
let fixtureGrade: any, fixtureLesson: any;

describe.runIf(Boolean(databaseURL))(
  "PostgreSQL + HTTP: целостность и авторизация (отдельная демо-БД)",
  () => {
    beforeAll(async () => {
      if (!/^\/campus_(demo|test)$/.test(new URL(databaseURL!).pathname))
        throw new Error(
          "TEST_DATABASE_URL must point to campus_demo or campus_test only",
        );
      const password = demoPassword(),
        passwordHash = await hash(password, 10);
      await db.user.createMany({
        data: [
          {
            id: ids.teacher,
            email: ids.teacher + "@demo.kit.local",
            name: "Тест преподавателя",
            passwordHash,
            role: "TEACHER",
          },
          {
            id: ids.student,
            email: ids.student + "@demo.kit.local",
            name: "Тест студента",
            passwordHash,
            role: "STUDENT",
          },
          {
            id: ids.other,
            email: ids.other + "@demo.kit.local",
            name: "Другой тестовый студент",
            passwordHash,
            role: "STUDENT",
          },
        ],
      });
      await db.group.createMany({
        data: [
          {
            id: ids.group,
            name: ids.group,
            course: 1,
            program: "Синтетический тест",
          },
          {
            id: ids.group2,
            name: ids.group2,
            course: 1,
            program: "Синтетический тест",
          },
        ],
      });
      await db.subject.create({ data: { id: ids.subject, name: ids.subject } });
      await db.period.create({
        data: {
          id: ids.period,
          name: ids.period,
          startsAt: new Date("2020-01-01T00:00:00Z"),
          endsAt: new Date("2040-12-31T00:00:00Z"),
        },
      });
      await db.room.createMany({
        data: [
          { id: ids.room, name: ids.room },
          { id: ids.room2, name: ids.room2 },
        ],
      });
      await db.assignment.createMany({
        data: [
          {
            id: ids.assignment,
            teacherId: ids.teacher,
            groupId: ids.group,
            subjectId: ids.subject,
            periodId: ids.period,
          },
          {
            id: ids.assignment2,
            teacherId: "demo-teacher-2",
            groupId: ids.group2,
            subjectId: ids.subject,
            periodId: ids.period,
          },
          {
            id: ids.assignment3,
            teacherId: "demo-teacher-2",
            groupId: ids.group,
            subjectId: ids.subject,
            periodId: ids.period,
          },
          {
            id: ids.assignment4,
            teacherId: ids.teacher,
            groupId: ids.group2,
            subjectId: ids.subject,
            periodId: ids.period,
          },
        ],
      });
      await db.membership.createMany({
        data: [
          {
            userId: ids.student,
            groupId: ids.group,
            periodId: ids.period,
            startsAt: new Date("2020-01-01T00:00:00Z"),
          },
          {
            userId: ids.other,
            groupId: ids.group2,
            periodId: ids.period,
            startsAt: new Date("2020-01-01T00:00:00Z"),
          },
        ],
      });
      await db.grade.create({
        data: {
          id: prefix + "-foreign-grade",
          studentId: ids.other,
          assignmentId: ids.assignment2,
          value: 61,
          kind: "SCORE",
          workType: "Чужая приватная работа",
          date: new Date(at(24, 9)),
          authorId: "demo-teacher-2",
        },
      });
      await admin.login();
      await teacher.login(ids.teacher + "@demo.kit.local", password);
      await student.login(ids.student + "@demo.kit.local", password);
      await other.login(ids.other + "@demo.kit.local", password);
    });
    afterAll(async () => {
      await db.$disconnect();
    });
    it("администратор создаёт справочники, преподавателя, студента, назначение и занятие через HTTP", async () => {
      const create = async (
        action: string,
        payload: Record<string, unknown>,
      ) => {
        const res = await post(admin, action, payload);
        expect(res.status).toBe(200);
        return (await res.json()).data;
      };
      const group = await create("saveGroup", {
        name: prefix + "-http-group",
        course: 1,
        program: "Синтетический HTTP-сценарий",
      });
      const subject = await create("saveSubject", {
        name: prefix + "-http-subject",
      });
      const room = await create("saveRoom", { name: prefix + "-http-room" });
      const period = await create("savePeriod", {
        name: prefix + "-http-period",
        startsAt: "2020-01-01T00:00:00Z",
        endsAt: "2040-12-31T00:00:00Z",
      });
      const staff = await create("saveUser", {
        name: "HTTP-преподаватель",
        email: prefix + "-http-teacher@demo.kit.local",
        password: demoPassword(),
        role: "TEACHER",
        active: true,
      });
      const pupil = await create("saveUser", {
        name: "HTTP-студент",
        email: prefix + "-http-student@demo.kit.local",
        password: demoPassword(),
        role: "STUDENT",
        active: true,
        groupId: group.id,
        periodId: period.id,
      });
      const assignment = await create("saveAssignment", {
        teacherId: staff.id,
        groupId: group.id,
        subjectId: subject.id,
        periodId: period.id,
      });
      const lesson = await create("saveLesson", {
        assignmentId: assignment.id,
        roomId: room.id,
        startsAt: at(25, 9),
        endsAt: at(25, 10),
        status: "SCHEDULED",
      });
      const freshStudent = await new ApiClient(pupil.email).login();
      const response = await freshStudent.get("schedule");
      expect(response.status).toBe(200);
      expect(JSON.stringify(await response.json())).toContain(lesson.id);
      const forbiddenRole = await post(freshStudent, "saveProfile", {
        bio: "Проверка разрешённых полей",
        role: "ADMIN",
        groupId: ids.group,
      });
      expect(forbiddenRole.status).toBe(200);
      expect((await forbiddenRole.json()).data.role).toBe("STUDENT");
    });
    it("гость не получает персональные данные и чужие оценки не входят в ответ студента", async () => {
      const guest = new ApiClient();
      expect((await guest.get("grades")).status).toBe(401);
      const forbidden = await student.get("users");
      expect([403, 404]).toContain(forbidden.status);
      const profile = await student.get("profile", "&id=" + ids.other);
      const profileBody = await profile.json();
      expect(JSON.stringify(profileBody)).not.toContain(
        ids.other + "@demo.kit.local",
      );
      const roster = await (await student.get("assignments")).json();
      expect(JSON.stringify(roster)).not.toContain(
        ids.teacher + "@demo.kit.local",
      );
      expect(JSON.stringify(roster)).not.toContain("memberships");
      const byId = await (
        await student.get("grades", "&id=" + prefix + "-foreign-grade")
      ).json();
      expect(JSON.stringify(byId)).not.toContain("Чужая приватная работа");
      const exported = await student.fetch(
        "/api/export?resource=grades&studentId=" + ids.other,
      );
      expect(await exported.text()).not.toContain("Другой тестовый студент");
    });
    it("публикует занятие и связанную контрольную, студент получает оба", async () => {
      const created = await post(admin, "saveLesson", {
        assignmentId: ids.assignment,
        roomId: ids.room,
        startsAt: at(21, 9),
        endsAt: at(21, 10),
        type: "Практика",
        status: "SCHEDULED",
        note: "Интеграционный тест",
      });
      expect(created.status).toBe(200);
      fixtureLesson = (await created.json()).data;
      const assessment = await post(teacher, "saveAssessment", {
        assignmentId: ids.assignment,
        lessonId: fixtureLesson.id,
        roomId: ids.room,
        title: "Тестовая контрольная",
        type: "Контрольная",
        startsAt: at(21, 9),
        endsAt: at(21, 10),
        description: "Данные вымышлены",
        status: "SCHEDULED",
      });
      expect(assessment.status).toBe(200);
      expect(
        JSON.stringify((await (await student.get("schedule")).json()).data),
      ).toContain(fixtureLesson.id);
      expect(
        JSON.stringify((await (await student.get("assessments")).json()).data),
      ).toContain("Тестовая контрольная");
    });
    it("перевод между группами прекращает доступ к будущим занятиям прежней группы", async () => {
      const old = await db.membership.findFirstOrThrow({
        where: { userId: ids.student, groupId: ids.group },
      });
      const transferAt = new Date(Date.now() - 86400000);
      let nextId = "";
      await db.$transaction(async (tx) => {
        await tx.membership.update({
          where: { id: old.id },
          data: { endsAt: transferAt },
        });
        const next = await tx.membership.create({
          data: {
            userId: ids.student,
            groupId: ids.group2,
            periodId: ids.period,
            startsAt: transferAt,
          },
        });
        nextId = next.id;
      });
      try {
        const response = await student.get("schedule");
        expect(response.status).toBe(200);
        expect(JSON.stringify(await response.json())).not.toContain(
          fixtureLesson.id,
        );
      } finally {
        await db.$transaction(async (tx) => {
          await tx.membership.delete({ where: { id: nextId } });
          await tx.membership.update({
            where: { id: old.id },
            data: { endsAt: null },
          });
        });
      }
    });
    it("пересекающиеся интервалы отклоняются при двух одновременных HTTP запросах", async () => {
      const body = {
        assignmentId: ids.assignment,
        roomId: ids.room,
        startsAt: at(22, 9),
        endsAt: at(22, 11),
        status: "SCHEDULED",
      };
      const results = await Promise.all([
        post(admin, "saveLesson", body),
        post(admin, "saveLesson", {
          ...body,
          startsAt: at(22, 10),
          endsAt: at(22, 12),
        }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    });
    it("БД отдельно предотвращает конфликт аудитории и конфликт преподавателя", async () => {
      const base = {
        assignmentId: ids.assignment,
        teacherId: ids.teacher,
        groupId: ids.group,
        roomId: ids.room,
        startsAt: new Date(at(23, 9)),
        endsAt: new Date(at(23, 11)),
      };
      await db.lesson.create({ data: base });
      await expect(
        db.lesson.create({
          data: {
            ...base,
            assignmentId: ids.assignment2,
            groupId: ids.group2,
            teacherId: "demo-teacher-2",
            startsAt: new Date(at(23, 10)),
            endsAt: new Date(at(23, 12)),
          },
        }),
      ).rejects.toThrow();
      await expect(
        db.lesson.create({
          data: {
            ...base,
            assignmentId: ids.assignment3,
            teacherId: "demo-teacher-2",
            roomId: ids.room2,
            startsAt: new Date(at(23, 10)),
            endsAt: new Date(at(23, 12)),
          },
        }),
      ).rejects.toThrow();
      await expect(
        db.lesson.create({
          data: {
            ...base,
            assignmentId: ids.assignment4,
            groupId: ids.group2,
            roomId: ids.room2,
            startsAt: new Date(at(23, 10)),
            endsAt: new Date(at(23, 12)),
          },
        }),
      ).rejects.toThrow();
      // Adjacent intervals are legal; checks use [start,end), not an identical-start comparison.
      await expect(
        db.lesson.create({
          data: {
            ...base,
            startsAt: new Date(at(23, 11)),
            endsAt: new Date(at(23, 12)),
          },
        }),
      ).resolves.toBeTruthy();
    });
    it("изменение аудитории атомарно создаёт уведомление с прежним и новым значением", async () => {
      const response = await post(admin, "saveLesson", {
        id: fixtureLesson.id,
        version: fixtureLesson.version,
        assignmentId: ids.assignment,
        roomId: ids.room2,
        startsAt: at(21, 9),
        endsAt: at(21, 10),
        status: "SUBSTITUTED",
        reason: "Проверка замены аудитории",
        confirmAssessmentMove: true,
      });
      expect(response.status).toBe(200);
      const notifications = await db.notification.findMany({
        where: { userId: ids.student },
        orderBy: { createdAt: "desc" },
      });
      expect(
        notifications.some((n) => n.before !== null && n.after !== null),
      ).toBe(true);
      const refreshed = await student.get("schedule");
      expect(JSON.stringify(await refreshed.json())).toContain(ids.room2);
    });
    it("преподаватель ставит оценку, исправление сохраняет причину, старая версия отвергается", async () => {
      const body = {
        assignmentId: ids.assignment,
        studentId: ids.student,
        kind: "SCORE",
        value: 70,
        workType: "Практика",
        date: at(21, 9),
        comment: "Тест",
      };
      const created = await post(teacher, "saveGrade", body);
      expect(created.status).toBe(200);
      fixtureGrade = (await created.json()).data;
      const corrected = await post(teacher, "saveGrade", {
        ...body,
        id: fixtureGrade.id,
        version: fixtureGrade.version,
        value: 80,
        reason: "Проверена ошибка подсчёта",
      });
      expect(corrected.status).toBe(200);
      const stale = await post(teacher, "saveGrade", {
        ...body,
        id: fixtureGrade.id,
        version: fixtureGrade.version,
        value: 90,
        reason: "Устаревшая вкладка",
      });
      expect(stale.status).toBe(409);
      const history = await db.gradeHistory.findMany({
        where: { gradeId: fixtureGrade.id },
      });
      expect(history).toHaveLength(1);
      expect(history[0].reason).toBe("Проверена ошибка подсчёта");
      const own = await (await student.get("grades")).json();
      expect(JSON.stringify(own)).toContain(fixtureGrade.id);
      const чужой = await (
        await other.get(
          "grades",
          "&studentId=" + ids.student + "&id=" + fixtureGrade.id,
        )
      ).json();
      expect(JSON.stringify(чужой)).not.toContain(fixtureGrade.id);
    });
    it("отсутствующий балл не превращается в ноль; исправление требует причины", async () => {
      const empty = await post(teacher, "saveGrade", {
        assignmentId: ids.assignment,
        studentId: ids.student,
        kind: "SCORE",
        value: null,
        date: at(24, 9),
        workType: "Без балла",
      });
      expect([400, 422]).toContain(empty.status);
      const missingReason = await post(teacher, "saveGrade", {
        id: fixtureGrade.id,
        version: 2,
        assignmentId: ids.assignment,
        studentId: ids.student,
        kind: "SCORE",
        value: 85,
        date: at(21, 9),
        workType: "Практика",
      });
      expect([400, 422]).toContain(missingReason.status);
    });
    it("две одновременные правки оценки сохраняют только одну новую версию", async () => {
      const body = {
        id: fixtureGrade.id,
        version: 2,
        assignmentId: ids.assignment,
        studentId: ids.student,
        kind: "SCORE",
        date: at(21, 9),
        workType: "Практика",
        reason: "Одновременная проверка",
      };
      const responses = await Promise.all([
        post(teacher, "saveGrade", { ...body, value: 81 }),
        post(teacher, "saveGrade", { ...body, value: 82 }),
      ]);
      expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(
        await db.gradeHistory.count({ where: { gradeId: fixtureGrade.id } }),
      ).toBe(2);
    });
    it("повторная отправка с тем же ключом не дублирует запись", async () => {
      const body = {
        action: "saveGrade",
        key: randomUUID(),
        assignmentId: ids.assignment,
        studentId: ids.student,
        kind: "SCORE",
        value: 0,
        workType: "Проверка нуля",
        date: at(24, 9),
      };
      const first = await teacher.post(body),
        again = await teacher.post(body);
      expect(first.status).toBe(200);
      expect(again.status).toBe(200);
      expect((await first.json()).data.id).toBe((await again.json()).data.id);
      expect(
        await db.grade.count({
          where: { assignmentId: ids.assignment, workType: "Проверка нуля" },
        }),
      ).toBe(1);
    });
    it("чужое назначение закрыто, отзыв назначения и отключение пользователя действуют в существующей сессии", async () => {
      const foreignJournal = await (
        await teacher.get("grades", "&assignmentId=" + ids.assignment2)
      ).json();
      expect(JSON.stringify(foreignJournal)).not.toContain(
        "Чужая приватная работа",
      );
      const foreignSchedule = await teacher.get(
        "schedule",
        "&teacherId=demo-teacher-2",
      );
      expect([403, 404]).toContain(foreignSchedule.status);
      const invalid = await post(teacher, "saveGrade", {
        assignmentId: ids.assignment2,
        studentId: ids.other,
        value: 90,
        kind: "SCORE",
        date: at(24, 9),
        workType: "Запрещено",
      });
      expect(invalid.status).toBe(403);
      await db.assignment.update({
        where: { id: ids.assignment },
        data: { active: false },
      });
      try {
        const revoked = await post(teacher, "saveGrade", {
          assignmentId: ids.assignment,
          studentId: ids.student,
          value: 90,
          kind: "SCORE",
          date: at(24, 9),
          workType: "Запрещено",
        });
        expect([403, 404]).toContain(revoked.status);
      } finally {
        await db.assignment.update({
          where: { id: ids.assignment },
          data: { active: true },
        });
      }
      await db.user.update({
        where: { id: ids.other },
        data: { active: false },
      });
      try {
        expect((await other.get("grades")).status).toBe(401);
      } finally {
        await db.user.update({
          where: { id: ids.other },
          data: { active: true },
        });
      }
    });
    it("черновик и адресная новость закрыты по прямому ID", async () => {
      const draft = await db.news.create({
        data: {
          title: "Тестовый черновик",
          body: "Закрыто",
          authorId: "demo-admin",
          status: "DRAFT",
          audience: "PUBLIC",
        },
      });
      const targeted = await db.news.create({
        data: {
          title: "Тестовая адресная",
          body: "Закрыто группе",
          authorId: "demo-admin",
          status: "PUBLISHED",
          audience: "GROUP",
          groupId: ids.group,
          publishedAt: new Date(),
        },
      });
      const guest = new ApiClient();
      expect([403, 404]).toContain(
        (await guest.fetch("/api/news/" + draft.id)).status,
      );
      expect([403, 404]).toContain(
        (await other.fetch("/api/news/" + targeted.id)).status,
      );
    });
    it("неверный CSV не даёт частичного импорта, повтор корректного импорта идемпотентен", async () => {
      const name = prefix + "-csv";
      const before = await db.group.count();
      const invalid = await admin.post(
        {
          kind: "groups",
          csv: `name,course,program\n${name},1,Тест\nОшибка,99,Тест`,
          mode: "commit",
          key: randomUUID(),
        },
        "/api/import",
      );
      expect([400, 422]).toContain(invalid.status);
      expect(await db.group.count()).toBe(before);
      const body = {
        kind: "groups",
        csv: `name,course,program\n${name},1,Тест`,
        mode: "commit",
        key: randomUUID(),
      };
      const first = await admin.post(body, "/api/import"),
        again = await admin.post(body, "/api/import");
      expect(first.status).toBe(200);
      expect(again.status).toBe(200);
      expect(await db.group.count({ where: { name } })).toBe(1);
    });
    it("шкала настраивается, ноль сохраняется, выход за границы и изменение границ отклоняются", async () => {
      const created = await post(admin, "saveScale", {
        name: prefix + " · демо 0–5",
        min: 0,
        max: 5,
      });
      expect(created.status).toBe(200);
      const scale = (await created.json()).data;
      const body = {
        assignmentId: ids.assignment,
        studentId: ids.student,
        scaleId: scale.id,
        kind: "SCORE",
        date: at(24, 9),
        workType: "Проверка шкалы 0–5",
      };
      const invalid = await post(teacher, "saveGrade", { ...body, value: 6 });
      expect(invalid.status).toBe(422);
      const zero = await post(teacher, "saveGrade", { ...body, value: 0 });
      expect(zero.status).toBe(200);
      expect((await zero.json()).data.value).toBe(0);
      const changed = await post(admin, "saveScale", {
        id: scale.id,
        name: scale.name,
        min: 0,
        max: 10,
      });
      expect(changed.status).toBe(409);
    });
    it("криптографически просроченная сессия не даёт доступ к API", async () => {
      if (!process.env.NEXTAUTH_SECRET)
        throw new Error("Set NEXTAUTH_SECRET from local .env for expiry test");
      const expired = await encode({
        token: { sub: ids.student },
        secret: process.env.NEXTAUTH_SECRET,
        maxAge: -60,
      });
      const response = await fetch(
        "http://localhost:3000/api/portal?resource=grades",
        { headers: { Cookie: "next-auth.session-token=" + expired } },
      );
      expect(response.status).toBe(401);
    });
    it("cookie-мутация без правильного Origin отклоняется", async () => {
      const response = await fetch("http://localhost:3000/api/portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: student.cookieHeader(),
          Origin: "https://foreign.invalid",
        },
        body: JSON.stringify({
          action: "saveProfile",
          key: randomUUID(),
          bio: "Forbidden",
        }),
      });
      expect(response.status).toBe(403);
    });
    it("журнал аудита и история оценок не изменяются даже прямым SQL", async () => {
      const history = await db.gradeHistory.findFirst({
        where: { gradeId: fixtureGrade.id },
      });
      expect(history).toBeTruthy();
      await expect(
        db.gradeHistory.update({
          where: { id: history!.id },
          data: { reason: "Скрыть" },
        }),
      ).rejects.toThrow();
      const audit = await db.audit.findFirst({
        where: { actorId: "demo-admin" },
      });
      expect(audit).toBeTruthy();
      await expect(
        db.audit.delete({ where: { id: audit!.id } }),
      ).rejects.toThrow();
    });
  },
);
