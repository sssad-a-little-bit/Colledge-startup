import { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import { readFileSync, renameSync, writeFileSync } from "node:fs";

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
const addedStudentNames = [
  "Алексей Громов",
  "Валерия Тарасова",
  "Денис Захаров",
  "Елена Романова",
  "Кирилл Назаров",
  "София Абдуллина",
  "Даниил Андреев",
  "Злата Борисова",
  "Матвей Сергеев",
  "Милана Юсупова",
  "Руслан Тлеубеков",
  "Таисия Крылова",
];
const teacherBio = "Преподаватель учебных дисциплин и руководитель занятий.";

function localPassword() {
  const contents = readFileSync(".demo-credentials", "utf8");
  let password: string | undefined;
  try {
    const parsed = JSON.parse(contents);
    password = parsed.password || parsed.accounts?.[0]?.password;
  } catch {
    password = contents.match(
      /(?:Пароль[^\n:]*|Password|password)\s*[:=]\s*(\S+)/i,
    )?.[1];
  }
  if (!password || password.length < 12)
    throw new Error("The local credentials file has no usable password.");
  return password;
}

function checkLocalDatabase() {
  if (process.env.LOCAL_PORTAL_SETUP !== "1")
    throw new Error("Explicit LOCAL_PORTAL_SETUP=1 is required.");
  const url = new URL(process.env.DATABASE_URL || "");
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/campus"
  )
    throw new Error("Only the local campus database may be prepared.");
}

function cleanRoomSnapshot(
  value: Prisma.JsonValue,
): Prisma.InputJsonValue | undefined {
  if (value === null) return undefined;
  const replacements: Record<string, string> = {
    "301 · демо": "301",
    "204 · демо": "204",
    "Лаборатория 1 · демо": "Лаборатория 1",
  };
  function walk(item: Prisma.JsonValue): Prisma.JsonValue {
    if (typeof item === "string") return replacements[item] || item;
    if (Array.isArray(item)) return item.map(walk);
    if (item && typeof item === "object")
      return Object.fromEntries(
        Object.entries(item).map(([key, child]) => [key, walk(child ?? null)]),
      );
    return item;
  }
  const cleaned = walk(value);
  return JSON.stringify(cleaned) === JSON.stringify(value)
    ? undefined
    : (cleaned as Prisma.InputJsonValue);
}

async function main() {
  checkLocalDatabase();
  const password = localPassword();
  const primaryIds = ["demo-admin", "demo-teacher", "demo-student"];
  const primary = await db.user.findMany({ where: { id: { in: primaryIds } } });
  if (primary.length !== primaryIds.length)
    throw new Error("The existing portal accounts were not found.");
  for (const account of primary) {
    if (!(await compare(password, account.passwordHash)))
      throw new Error(
        "The local credentials file no longer matches a primary account. Existing passwords were preserved.",
      );
  }
  const passwordHash = await hash(password, 12);
  const now = new Date();
  const result = await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('campus-local-setup'))`;
      const totals = {
        studentsAdded: 0,
        teachersAdded: 0,
        membershipsAdded: 0,
        clubsAdded: 0,
        gradesRelabelled: 0,
      };

      const staff = [
        {
          id: "demo-admin",
          oldName: "Администратор Демо",
          name: "Мария Кузнецова",
          oldEmail: "admin@demo.kit.local",
          email: "admin@kit.local",
        },
        {
          id: "demo-teacher",
          oldName: "Анна Демонстрационная",
          name: "Анна Соколова",
          oldEmail: "teacher@demo.kit.local",
          email: "teacher@kit.local",
        },
        {
          id: "demo-teacher-2",
          oldName: "Данияр Учебный",
          name: "Данияр Ахметов",
          oldEmail: "teacher2@demo.kit.local",
          email: "teacher2@kit.local",
        },
      ];
      for (const account of staff) {
        await tx.user.updateMany({
          where: { id: account.id, name: account.oldName },
          data: { name: account.name },
        });
        await tx.user.updateMany({
          where: { id: account.id, email: account.oldEmail },
          data: { email: account.email },
        });
      }
      await tx.user.updateMany({
        where: {
          id: { in: ["demo-teacher", "demo-teacher-2"] },
          bio: "Демонстрационный профиль преподавателя. Данные вымышлены.",
        },
        data: { bio: teacherBio },
      });
      for (const [i, name] of studentNames.entries()) {
        const id =
          i === 0
            ? "demo-student"
            : `demo-student-${String(i + 1).padStart(2, "0")}`;
        const oldEmail =
          i === 0 ? "student@demo.kit.local" : `student${i + 1}@demo.kit.local`;
        const email = oldEmail.replace("@demo.kit.local", "@kit.local");
        await tx.user.updateMany({
          where: { id, name: `Студент ${String(i + 1).padStart(2, "0")} Демо` },
          data: { name },
        });
        await tx.user.updateMany({
          where: { id, email: oldEmail },
          data: { email },
        });
      }

      for (const [i, name] of ["ИС-21", "ПР-22"].entries()) {
        const id = `demo-group-${i + 1}`;
        const program = i === 0 ? "Информационные системы" : "Программирование";
        await tx.group.updateMany({
          where: { id, name: `${name} · демо` },
          data: { name },
        });
        await tx.group.updateMany({
          where: { id, program: `${program} · демонстрация` },
          data: { program },
        });
      }
      for (const [i, name] of ["301", "204", "Лаборатория 1"].entries()) {
        await tx.room.updateMany({
          where: { id: `demo-room-${i + 1}`, name: `${name} · демо` },
          data: { name },
        });
      }
      const period = await tx.period.findUnique({
        where: { id: "demo-period" },
      });
      const periodYear = period?.name.match(
        /^Демонстрационный учебный период (\d{4})$/,
      )?.[1];
      if (period && periodYear)
        await tx.period.updateMany({
          where: { id: period.id, name: period.name },
          data: { name: `Учебный период ${periodYear}` },
        });
      await tx.scale.updateMany({
        where: { id: "demo100", name: "Демонстрационная шкала 0–100" },
        data: { name: "Балльная шкала 0–100" },
      });
      await tx.lesson.updateMany({
        where: {
          id: { startsWith: "demo-lesson-" },
          note: "Демонстрационный проект. Данные вымышлены.",
        },
        data: { note: "" },
      });
      await tx.assessment.updateMany({
        where: {
          id: { startsWith: "demo-assessment-" },
          description: "Синтетическое событие. Демонстрационное расписание.",
        },
        data: { description: "Подготовьте материалы по теме занятия." },
      });

      // Corrections retain the original record and satisfy the append-only history trigger.
      const grades = await tx.grade.findMany({
        where: {
          id: { startsWith: "demo-grade-" },
          OR: [
            { workType: "Демонстрационная практика" },
            {
              comment:
                "Демонстрационная шкала. Это не официальная итоговая оценка.",
            },
          ],
        },
      });
      for (const grade of grades) {
        const workType =
          grade.workType === "Демонстрационная практика"
            ? "Практическая работа"
            : grade.workType;
        const comment =
          grade.comment ===
          "Демонстрационная шкала. Это не официальная итоговая оценка."
            ? ""
            : grade.comment;
        const oldValue = JSON.parse(
          JSON.stringify(grade),
        ) as Prisma.InputJsonValue;
        const newValue = JSON.parse(
          JSON.stringify({
            ...grade,
            workType,
            comment,
            authorId: "demo-admin",
            version: grade.version + 1,
          }),
        ) as Prisma.InputJsonValue;
        await tx.gradeHistory.create({
          data: {
            gradeId: grade.id,
            oldValue,
            newValue,
            reason: "Уточнение названия работы и комментария",
            actorId: "demo-admin",
          },
        });
        const updated = await tx.grade.updateMany({
          where: {
            id: grade.id,
            version: grade.version,
            workType: grade.workType,
            comment: grade.comment,
          },
          data: {
            workType,
            comment,
            authorId: "demo-admin",
            version: { increment: 1 },
          },
        });
        if (!updated.count)
          throw new Error(
            "A grade changed during preparation. No setup changes were committed.",
          );
        totals.gradesRelabelled++;
      }

      const newsDefaults = [
        {
          id: "demo-news-1",
          oldBody:
            "Добро пожаловать в демонстрационный КИТ Campus. Расписание, контрольные и новости собраны в одном кабинете. Проект не является официальным сайтом колледжа.\n\nВсе сведения и пользователи вымышлены.",
          body: "Добро пожаловать в КИТ Campus. Расписание, контрольные, оценки и новости собраны в одном кабинете. Выберите нужный раздел в меню, чтобы спланировать учебный день.",
        },
        {
          id: "demo-news-2",
          oldBody:
            "Синтетическое объявление: на следующей неделе демонстрационная группа разберёт создание небольшого веб-приложения. Подробности доступны в календаре контрольных.",
          body: "На занятиях учебной лаборатории группа разберёт создание небольшого веб-приложения: от идеи и макета до работающего прототипа. Подробности доступны в календаре контрольных.",
        },
        {
          id: "demo-news-3",
          oldBody:
            "Демонстрационное адресное объявление для первой учебной группы. Проверьте актуальную аудиторию перед занятием.",
          body: "Уважаемые студенты группы ИС-21, перед занятием проверьте актуальную аудиторию и время в расписании.",
        },
        {
          id: "demo-news-4",
          oldBody:
            "Демонстрационный учебный материал: начните с проблемы пользователя, покажите работающий сценарий и честно расскажите об ограничениях. Результаты испытаний приводятся только после выполнения проверок.",
          body: "Начните защиту с проблемы пользователя, покажите работающий сценарий и расскажите о выбранном решении. Подготовьте короткий план выступления и ответы на возможные вопросы.",
        },
      ];
      for (const news of newsDefaults)
        await tx.news.updateMany({
          where: { id: news.id, body: news.oldBody },
          data: { body: news.body },
        });
      await tx.news.updateMany({
        where: {
          id: "demo-news-draft",
          title: "Черновик демонстрационного объявления",
        },
        data: { title: "Черновик объявления" },
      });
      await tx.notification.updateMany({
        where: {
          id: { startsWith: "demo-welcome-" },
          title: "Добро пожаловать в демонстрацию",
        },
        data: { title: "Добро пожаловать в КИТ Campus" },
      });
      await tx.notification.updateMany({
        where: {
          id: { startsWith: "demo-welcome-" },
          body: "Демонстрационный проект. Данные вымышлены. Актуальное расписание доступно в личном кабинете.",
        },
        data: {
          body: "Актуальное расписание доступно в личном кабинете. Здесь же вы найдёте оценки, контрольные и кружки.",
        },
      });
      await tx.notification.updateMany({
        where: {
          id: "demo-change",
          body: "Демонстрация сравнения: аудитория 301 → 204. Проверяйте актуальную карточку занятия.",
        },
        data: {
          body: "Аудитория изменена: 301 → 204. Проверяйте актуальную карточку занятия.",
        },
      });
      const changedRoom = await tx.notification.findUnique({
        where: { id: "demo-change" },
      });
      if (changedRoom) {
        const before = cleanRoomSnapshot(changedRoom.before);
        const after = cleanRoomSnapshot(changedRoom.after);
        if (before !== undefined || after !== undefined)
          await tx.notification.update({
            where: { id: changedRoom.id },
            data: {
              ...(before !== undefined ? { before } : {}),
              ...(after !== undefined ? { after } : {}),
            },
          });
      }

      // Fill the existing two teaching groups, without creating or replacing a group.
      const groupIds = ["demo-group-1", "demo-group-2"];
      const groups = await tx.group.findMany({
        where: { id: { in: groupIds }, active: true },
      });
      for (const group of groups) {
        const assignment = await tx.assignment.findFirst({
          where: {
            groupId: group.id,
            active: true,
            period: {
              active: true,
              startsAt: { lte: now },
              endsAt: { gt: now },
            },
          },
          include: { period: true },
          orderBy: { id: "asc" },
        });
        const activePeriod =
          assignment?.period ||
          (await tx.period.findFirst({
            where: {
              active: true,
              startsAt: { lte: now },
              endsAt: { gt: now },
            },
            orderBy: { startsAt: "desc" },
          }));
        if (!activePeriod)
          throw new Error(
            "An active teaching period is required for the existing group.",
          );
        const groupIndex = groupIds.indexOf(group.id);
        for (let position = 0; position < 6; position++) {
          const index = groupIndex * 6 + position;
          const number = index + 25;
          const id = `campus-student-${number}`;
          const existing = await tx.user.findUnique({ where: { id } });
          if (existing && existing.role !== "STUDENT")
            throw new Error(
              "A new student ID conflicts with an existing account.",
            );
          if (!existing) {
            await tx.user.create({
              data: {
                id,
                name: addedStudentNames[index],
                email: `student${number}@kit.local`,
                passwordHash,
                role: "STUDENT",
              },
            });
            totals.studentsAdded++;
          }
          const priorMembership = await tx.membership.findFirst({
            where: { userId: id, periodId: activePeriod.id },
          });
          if (!priorMembership) {
            await tx.membership.create({
              data: {
                id: `campus-membership-${number}`,
                userId: id,
                groupId: group.id,
                periodId: activePeriod.id,
                startsAt: activePeriod.startsAt,
              },
            });
            totals.membershipsAdded++;
          }
        }
      }

      const coaches = [
        {
          id: "campus-coach-shooting",
          name: "Сергей Орлов",
          email: "sergey.orlov@kit.local",
          bio: "Руководитель секции спортивной стрельбы.",
        },
        {
          id: "campus-coach-lifting",
          name: "Дмитрий Волков",
          email: "dmitry.volkov@kit.local",
          bio: "Руководитель секции тяжёлой атлетики.",
        },
        {
          id: "campus-coach-boxing",
          name: "Марат Сулейменов",
          email: "marat.suleymenov@kit.local",
          bio: "Руководитель секции бокса.",
        },
      ];
      for (const coach of coaches) {
        const existing = await tx.user.findUnique({ where: { id: coach.id } });
        if (existing && existing.role !== "TEACHER")
          throw new Error(
            "A club leader ID conflicts with an existing account.",
          );
        if (!existing) {
          await tx.user.create({
            data: { ...coach, role: "TEACHER", passwordHash },
          });
          totals.teachersAdded++;
        }
      }
      const clubs = [
        {
          id: "campus-club-cybersecurity",
          name: "Кибербезопасность",
          description:
            "Разбираем защиту данных, цифровую гигиену и командные задачи по информационной безопасности.",
          category: "Технологии",
          schedule: "Вторник и четверг, 16:00–17:30",
          location: "Лаборатория 1",
          teacherId: "demo-teacher",
        },
        {
          id: "campus-club-shooting",
          name: "Стрельба",
          description:
            "Спортивная секция для развития внимания, дисциплины и точности под руководством преподавателя.",
          category: "Спорт",
          schedule: "Среда, 16:00–17:30",
          location: "Спортивный тир",
          teacherId: "campus-coach-shooting",
        },
        {
          id: "campus-club-lifting",
          name: "Тяжёлая атлетика",
          description:
            "Регулярные занятия общей физической подготовкой и силовыми дисциплинами с руководителем секции.",
          category: "Спорт",
          schedule: "Понедельник и среда, 17:00–18:30",
          location: "Тренажёрный зал",
          teacherId: "campus-coach-lifting",
        },
        {
          id: "campus-club-boxing",
          name: "Бокс",
          description:
            "Занятия для развития координации, выносливости и спортивного мастерства в команде.",
          category: "Спорт",
          schedule: "Вторник и пятница, 17:00–18:30",
          location: "Спортивный зал",
          teacherId: "campus-coach-boxing",
        },
        {
          id: "campus-club-chess",
          name: "Шахматы",
          description:
            "Учимся планировать ходы, разбирать партии и участвуем в дружеских турнирах.",
          category: "Интеллект",
          schedule: "Четверг, 16:00–17:30",
          location: "Аудитория 204",
          teacherId: "demo-teacher-2",
        },
      ];
      for (const club of clubs) {
        const existing = await tx.club.findFirst({
          where: { OR: [{ id: club.id }, { name: club.name }] },
        });
        if (!existing) {
          const leader = await tx.user.findUnique({
            where: { id: club.teacherId },
            select: { role: true, active: true },
          });
          if (leader?.role !== "TEACHER" || !leader.active)
            throw new Error(
              "An active teacher is required to lead a new club.",
            );
          await tx.club.create({ data: club });
          totals.clubsAdded++;
        }
      }
      return totals;
    },
    { timeout: 120000 },
  );

  // Re-read actual logins so manually edited account addresses are preserved.
  const accounts = await db.user.findMany({
    where: { id: { in: primaryIds } },
    select: { id: true, email: true },
  });
  const emailFor = (id: string) =>
    accounts.find((account) => account.id === id)!.email;
  const credentials = `КИТ Campus — локальные учётные записи\n\nАдминистратор: ${emailFor("demo-admin")}\nПреподаватель: ${emailFor("demo-teacher")}\nСтудент: ${emailFor("demo-student")}\nПароль: ${password}\n\nУчётные записи новых студентов и руководителей используют этот же локальный пароль.\nСуществующие пароли не изменялись. Храните этот файл на своём компьютере.\n`;
  writeFileSync(".demo-credentials.campus-new", credentials, { mode: 0o600 });
  renameSync(".demo-credentials.campus-new", ".demo-credentials");
  console.log(JSON.stringify({ campusPrepared: true, ...result }));
}

main()
  .catch((error: unknown) => {
    // Do not print connection strings, credentials or Prisma query payloads.
    console.error(
      error instanceof Error && !error.name.startsWith("Prisma")
        ? error.message
        : "Local campus preparation failed. Check migration and database state locally; no credentials were logged.",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
