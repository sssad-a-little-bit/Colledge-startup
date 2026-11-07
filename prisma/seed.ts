import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { randomBytes } from "node:crypto";
import { writeFileSync, existsSync } from "node:fs";

const db = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === "production" || process.env.DEMO_SEED !== "1") {
    throw new Error(
      "Seed allowed only outside production with DEMO_SEED=1. Never run against a real-data database.",
    );
  }
  const primaryAccountsExisted = await db.user.count({
    where: { id: { in: ["demo-admin", "demo-teacher", "demo-student"] } },
  });
  if (primaryAccountsExisted === 0 && existsSync(".demo-credentials")) {
    throw new Error(
      "A credentials file from another demo already exists. Archive it privately or use a separate checkout before seeding a NEW database. No data was changed.",
    );
  }
  const password =
    process.env.DEMO_PASSWORD || randomBytes(21).toString("base64url");
  if (password.length < 12)
    throw new Error("DEMO_PASSWORD must contain at least 12 characters");
  const passwordHash = await hash(password, 12);
  const localDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Almaty",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  // Resolve a campus wall-clock date/time through the IANA zone instead of a fixed UTC offset.
  function at(day: string, time = "00:00") {
    const target = Date.parse(`${day}T${time}:00Z`);
    let result = new Date(target);
    for (let n = 0; n < 3; n++) {
      const parts = new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Almaty",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }).formatToParts(result);
      const get = (key: string) => parts.find((p) => p.type === key)!.value;
      const rendered = Date.parse(
        `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}Z`,
      );
      result = new Date(result.getTime() + target - rendered);
    }
    return result;
  }
  const todayUTC = new Date(`${localDay}T00:00:00Z`);
  const weekday = todayUTC.getUTCDay() || 7;
  const monday = new Date(todayUTC.getTime() - (weekday - 1) * 86400000);
  const dateAt = (offset: number) =>
    new Date(monday.getTime() + offset * 86400000).toISOString().slice(0, 10);
  const periodStart = at(`${localDay.slice(0, 4)}-01-01`);
  const periodEnd = at(`${Number(localDay.slice(0, 4)) + 1}-01-01`);

  const accounts = [
    {
      id: "demo-admin",
      email: "admin@demo.kit.local",
      name: "Администратор Демо",
      role: "ADMIN" as const,
      canManageGrades: true,
    },
    {
      id: "demo-teacher",
      email: "teacher@demo.kit.local",
      name: "Анна Демонстрационная",
      role: "TEACHER" as const,
      canManageGrades: false,
    },
    {
      id: "demo-teacher-2",
      email: "teacher2@demo.kit.local",
      name: "Данияр Учебный",
      role: "TEACHER" as const,
      canManageGrades: false,
    },
    ...Array.from({ length: 24 }, (_, i) => ({
      id:
        i === 0
          ? "demo-student"
          : `demo-student-${String(i + 1).padStart(2, "0")}`,
      email:
        i === 0 ? "student@demo.kit.local" : `student${i + 1}@demo.kit.local`,
      name: `Студент ${String(i + 1).padStart(2, "0")} Демо`,
      role: "STUDENT" as const,
      canManageGrades: false,
    })),
  ];
  // Idempotent upserts insert synthetic records only. They never replace existing records or passwords.
  await db.$transaction(
    async (tx) => {
      await tx.scale.upsert({
        where: { id: "demo100" },
        update: {},
        create: {
          id: "demo100",
          name: "Демонстрационная шкала 0–100",
          min: 0,
          max: 100,
        },
      });
      await tx.setting.upsert({
        where: { id: "main" },
        update: {},
        create: { id: "main", loadThreshold: 2 },
      });
      for (const account of accounts) {
        const existing = await tx.user.findUnique({
          where: { id: account.id },
        });
        if (existing && existing.email !== account.email)
          throw new Error("Seed ID collides with a non-demo record; aborted");
        await tx.user.upsert({
          where: { id: account.id },
          update: {},
          create: {
            ...account,
            passwordHash,
            bio:
              account.role === "TEACHER"
                ? "Демонстрационный профиль преподавателя. Данные вымышлены."
                : "",
          },
        });
      }
      await tx.period.upsert({
        where: { id: "demo-period" },
        update: {},
        create: {
          id: "demo-period",
          name: `Демонстрационный учебный период ${localDay.slice(0, 4)}`,
          startsAt: periodStart,
          endsAt: periodEnd,
        },
      });
      for (const [i, name] of ["ИС-21 · демо", "ПР-22 · демо"].entries()) {
        await tx.group.upsert({
          where: { id: `demo-group-${i + 1}` },
          update: {},
          create: {
            id: `demo-group-${i + 1}`,
            name,
            course: 2,
            program:
              i === 0
                ? "Информационные системы · демонстрация"
                : "Программирование · демонстрация",
          },
        });
      }
      for (const [i, name] of [
        "Разработка веб-приложений",
        "Базы данных",
        "Прикладная математика",
      ].entries()) {
        await tx.subject.upsert({
          where: { id: `demo-subject-${i + 1}` },
          update: {},
          create: { id: `demo-subject-${i + 1}`, name },
        });
      }
      for (const [i, name] of [
        "301 · демо",
        "204 · демо",
        "Лаборатория 1 · демо",
      ].entries()) {
        await tx.room.upsert({
          where: { id: `demo-room-${i + 1}` },
          update: {},
          create: { id: `demo-room-${i + 1}`, name },
        });
      }
      for (let i = 0; i < 24; i++) {
        const userId =
          i === 0
            ? "demo-student"
            : `demo-student-${String(i + 1).padStart(2, "0")}`;
        await tx.membership.upsert({
          where: { id: `demo-membership-${i + 1}` },
          update: {},
          create: {
            id: `demo-membership-${i + 1}`,
            userId,
            groupId: `demo-group-${i < 12 ? 1 : 2}`,
            periodId: "demo-period",
            startsAt: periodStart,
          },
        });
      }
      for (let group = 1; group <= 2; group++) {
        for (let subject = 1; subject <= 3; subject++) {
          const n = (group - 1) * 3 + subject;
          await tx.assignment.upsert({
            where: { id: `demo-assignment-${n}` },
            update: {},
            create: {
              id: `demo-assignment-${n}`,
              teacherId: subject === 2 ? "demo-teacher-2" : "demo-teacher",
              groupId: `demo-group-${group}`,
              subjectId: `demo-subject-${subject}`,
              periodId: "demo-period",
            },
          });
        }
      }
      for (let offset = 0; offset < 19; offset++) {
        if (offset % 7 > 4) continue;
        for (let group = 1; group <= 2; group++) {
          for (let pair = 0; pair < 3; pair++) {
            const subject = pair + 1;
            const slot = group === 1 ? pair : pair + 3;
            const startHour = 8 + slot * 2;
            const startsAt = at(
              dateAt(offset),
              `${String(startHour).padStart(2, "0")}:30`,
            );
            const endsAt = new Date(startsAt.getTime() + 80 * 60000);
            await tx.lesson.upsert({
              where: { id: `demo-lesson-${offset}-${group}-${pair}` },
              update: {},
              create: {
                id: `demo-lesson-${offset}-${group}-${pair}`,
                assignmentId: `demo-assignment-${(group - 1) * 3 + subject}`,
                teacherId: subject === 2 ? "demo-teacher-2" : "demo-teacher",
                groupId: `demo-group-${group}`,
                roomId:
                  offset === 7 && group === 1 && pair === 0
                    ? "demo-room-2"
                    : `demo-room-${subject}`,
                startsAt,
                endsAt,
                status:
                  offset === 7 && group === 1 && pair === 0
                    ? "SUBSTITUTED"
                    : offset === 10 && group === 2 && pair === 2
                      ? "CANCELLED"
                      : "SCHEDULED",
                type: pair === 0 ? "Практика" : "Лекция",
                note: "Демонстрационный проект. Данные вымышлены.",
              },
            });
          }
        }
      }
      for (const [i, offset] of [7, 9, 11, 14, 16].entries()) {
        const lessonId = `demo-lesson-${offset}-1-0`;
        const lesson = await tx.lesson.findUniqueOrThrow({
          where: { id: lessonId },
        });
        await tx.assessment.upsert({
          where: { id: `demo-assessment-${i + 1}` },
          update: {},
          create: {
            id: `demo-assessment-${i + 1}`,
            assignmentId: "demo-assignment-1",
            teacherId: "demo-teacher",
            groupId: "demo-group-1",
            lessonId,
            roomId: lesson.roomId,
            title: [
              "Практика: интерфейс приложения",
              "Контрольная: HTTP и формы",
              "Работа с данными",
              "Зачёт по веб-разработке",
              "Разбор учебного проекта",
            ][i],
            type: i === 3 ? "Зачёт" : "Контрольная",
            startsAt: lesson.startsAt,
            endsAt: lesson.endsAt,
            description: "Синтетическое событие. Демонстрационное расписание.",
          },
        });
      }
      for (let i = 0; i < 24; i++) {
        const studentId =
          i === 0
            ? "demo-student"
            : `demo-student-${String(i + 1).padStart(2, "0")}`;
        for (let j = 0; j < 3; j++) {
          await tx.grade.upsert({
            where: { id: `demo-grade-${i + 1}-${j + 1}` },
            update: {},
            create: {
              id: `demo-grade-${i + 1}-${j + 1}`,
              studentId,
              assignmentId: `demo-assignment-${i < 12 ? j + 1 : j + 4}`,
              value: 72 + ((i * 7 + j * 9) % 28),
              kind: "SCORE",
              workType: "Демонстрационная практика",
              date: at(dateAt(j)),
              authorId: j === 1 ? "demo-teacher-2" : "demo-teacher",
              comment:
                "Демонстрационная шкала. Это не официальная итоговая оценка.",
            },
          });
        }
      }
      const newsItems = [
        {
          id: "demo-news-1",
          title: "Всё для учебного дня — в одном месте",
          body: "Добро пожаловать в демонстрационный КИТ Campus. Расписание, контрольные и новости собраны в одном кабинете. Проект не является официальным сайтом колледжа.\n\nВсе сведения и пользователи вымышлены.",
          category: "Портал",
          status: "PUBLISHED" as const,
          audience: "PUBLIC" as const,
        },
        {
          id: "demo-news-2",
          title: "Учебная лаборатория: от идеи к прототипу",
          body: "Синтетическое объявление: на следующей неделе демонстрационная группа разберёт создание небольшого веб-приложения. Подробности доступны в календаре контрольных.",
          category: "Учёба",
          status: "PUBLISHED" as const,
          audience: "AUTHENTICATED" as const,
        },
        {
          id: "demo-news-3",
          title: "Напоминание группе ИС-21",
          body: "Демонстрационное адресное объявление для первой учебной группы. Проверьте актуальную аудиторию перед занятием.",
          category: "Группы",
          status: "PUBLISHED" as const,
          audience: "GROUP" as const,
          groupId: "demo-group-1",
        },
        {
          id: "demo-news-draft",
          title: "Черновик демонстрационного объявления",
          body: "Этот материал должен быть виден только администратору.",
          category: "Служебное",
          status: "DRAFT" as const,
          audience: "PUBLIC" as const,
        },
        {
          id: "demo-news-4",
          title: "Как подготовиться к защите проекта",
          body: "Демонстрационный учебный материал: начните с проблемы пользователя, покажите работающий сценарий и честно расскажите об ограничениях. Результаты испытаний приводятся только после выполнения проверок.",
          category: "События",
          status: "PUBLISHED" as const,
          audience: "PUBLIC" as const,
        },
      ];
      for (const item of newsItems)
        await tx.news.upsert({
          where: { id: item.id },
          update: {},
          create: { ...item, authorId: "demo-admin", publishedAt: new Date() },
        });
      for (const account of accounts.filter((a) => a.role !== "ADMIN")) {
        await tx.notification.upsert({
          where: { id: `demo-welcome-${account.id}` },
          update: { href: "/campus/schedule" },
          create: {
            id: `demo-welcome-${account.id}`,
            userId: account.id,
            title: "Добро пожаловать в демонстрацию",
            body: "Демонстрационный проект. Данные вымышлены. Актуальное расписание доступно в личном кабинете.",
            href: "/campus/schedule",
          },
        });
      }
      await tx.notification.upsert({
        where: { id: "demo-change" },
        update: { href: "/campus/schedule" },
        create: {
          id: "demo-change",
          userId: "demo-student",
          title: "Аудитория изменена",
          body: "Демонстрация сравнения: аудитория 301 → 204. Проверяйте актуальную карточку занятия.",
          href: "/campus/schedule",
          before: { room: "301 · демо" },
          after: { room: "204 · демо" },
        },
      });
      if (!(await tx.audit.findUnique({ where: { id: "demo-seed-audit" } }))) {
        await tx.audit.create({
          data: {
            id: "demo-seed-audit",
            actorId: "demo-admin",
            action: "DEMO_SEED",
            entity: "System",
            entityId: "demo",
            reason: "Создание синтетической демонстрационной среды",
          },
        });
      }
    },
    { timeout: 120000 },
  );

  if (primaryAccountsExisted === 0 && !existsSync(".demo-credentials")) {
    writeFileSync(
      ".demo-credentials",
      `Демонстрационный проект. Данные вымышлены.\nЛокальные учётные записи (не production):\nadmin@demo.kit.local\nteacher@demo.kit.local\nstudent@demo.kit.local\nПароль для этих новых demo-аккаунтов: ${password}\n\nSeed не меняет пароль уже существующего аккаунта.\n`,
      { mode: 0o600 },
    );
  }
  console.log(
    primaryAccountsExisted
      ? "Synthetic demo data verified. Existing passwords preserved; no new credentials generated."
      : "Synthetic demo data seeded. Local credentials: .demo-credentials.",
  );
}
main()
  .catch(() => {
    console.error(
      "Seed failed; check database availability, migration and DEMO_SEED configuration. No credentials logged.",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
