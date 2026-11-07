import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { randomBytes } from "node:crypto";
import { writeFileSync, existsSync } from "node:fs";

const db = new PrismaClient();
const studentNames = [
  "Александр Смирнов",
  "Алина Исаева",
  "Артём Ковалёв",
  "Виктория Белова",
  "Дамир Ахметов",
  "Дарья Морозова",
  "Егор Соколов",
  "Елизавета Попова",
  "Илья Ким",
  "Камилла Нурланова",
  "Максим Петров",
  "Мария Васильева",
  "Андрей Волков",
  "Аружан Садыкова",
  "Владимир Орлов",
  "Диана Каримова",
  "Иван Фёдоров",
  "Ксения Павлова",
  "Никита Новиков",
  "Полина Михайлова",
  "Роман Лебедев",
  "Сабина Алиева",
  "Тимур Омаров",
  "Юлия Семёнова",
];

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
      name: "Мария Кузнецова",
      role: "ADMIN" as const,
      canManageGrades: true,
    },
    {
      id: "demo-teacher",
      email: "teacher@demo.kit.local",
      name: "Анна Соколова",
      role: "TEACHER" as const,
      canManageGrades: false,
    },
    {
      id: "demo-teacher-2",
      email: "teacher2@demo.kit.local",
      name: "Данияр Ахметов",
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
      name: studentNames[i],
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
          name: "Балльная шкала 0–100",
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
        if (
          existing &&
          existing.email !== account.email &&
          existing.email !==
            account.email.replace("@demo.kit.local", "@kit.local")
        )
          throw new Error("Seed ID collides with a non-demo record; aborted");
        await tx.user.upsert({
          where: { id: account.id },
          update: {},
          create: {
            ...account,
            passwordHash,
            bio:
              account.role === "TEACHER"
                ? "Преподаватель учебных дисциплин и руководитель занятий."
                : "",
          },
        });
      }
      await tx.period.upsert({
        where: { id: "demo-period" },
        update: {},
        create: {
          id: "demo-period",
          name: `Учебный период ${localDay.slice(0, 4)}`,
          startsAt: periodStart,
          endsAt: periodEnd,
        },
      });
      for (const [i, name] of ["ИС-21", "ПР-22"].entries()) {
        await tx.group.upsert({
          where: { id: `demo-group-${i + 1}` },
          update: {},
          create: {
            id: `demo-group-${i + 1}`,
            name,
            course: 2,
            program: i === 0 ? "Информационные системы" : "Программирование",
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
      for (const [i, name] of ["301", "204", "Лаборатория 1"].entries()) {
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
                note: "",
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
            description: "Подготовьте материалы по теме занятия.",
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
              workType: "Практическая работа",
              date: at(dateAt(j)),
              authorId: j === 1 ? "demo-teacher-2" : "demo-teacher",
              comment: "",
            },
          });
        }
      }
      const newsItems = [
        {
          id: "demo-news-1",
          title: "Всё для учебного дня — в одном месте",
          body: "Добро пожаловать в КИТ Campus. Расписание, контрольные, оценки и новости собраны в одном кабинете. Выберите нужный раздел в меню, чтобы спланировать учебный день.",
          category: "Портал",
          status: "PUBLISHED" as const,
          audience: "PUBLIC" as const,
        },
        {
          id: "demo-news-2",
          title: "Учебная лаборатория: от идеи к прототипу",
          body: "На занятиях учебной лаборатории группа разберёт создание небольшого веб-приложения: от идеи и макета до работающего прототипа. Подробности доступны в календаре контрольных.",
          category: "Учёба",
          status: "PUBLISHED" as const,
          audience: "AUTHENTICATED" as const,
        },
        {
          id: "demo-news-3",
          title: "Напоминание группе ИС-21",
          body: "Уважаемые студенты группы ИС-21, перед занятием проверьте актуальную аудиторию и время в расписании.",
          category: "Группы",
          status: "PUBLISHED" as const,
          audience: "GROUP" as const,
          groupId: "demo-group-1",
        },
        {
          id: "demo-news-draft",
          title: "Черновик объявления",
          body: "Этот материал должен быть виден только администратору.",
          category: "Служебное",
          status: "DRAFT" as const,
          audience: "PUBLIC" as const,
        },
        {
          id: "demo-news-4",
          title: "Как подготовиться к защите проекта",
          body: "Начните защиту с проблемы пользователя, покажите работающий сценарий и расскажите о выбранном решении. Подготовьте короткий план выступления и ответы на возможные вопросы.",
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
            title: "Добро пожаловать в КИТ Campus",
            body: "Актуальное расписание доступно в личном кабинете. Здесь же вы найдёте оценки, контрольные и кружки.",
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
          body: "Аудитория изменена: 301 → 204. Проверяйте актуальную карточку занятия.",
          href: "/campus/schedule",
          before: { room: "301" },
          after: { room: "204" },
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
      `КИТ Campus — локальные учётные записи\nadmin@demo.kit.local\nteacher@demo.kit.local\nstudent@demo.kit.local\nПароль: ${password}\n\nСуществующие пароли при повторном наполнении не меняются.\n`,
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
