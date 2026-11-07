import { Prisma, User } from "@prisma/client";
import { z } from "zod";
import { randomUUID, createHash } from "node:crypto";
import { hash } from "bcryptjs";
import { db } from "./db";
import { AppError } from "./errors";
import { requireAdmin, requireAssignment } from "./policy";

export const safeUser = {
  id: true,
  email: true,
  name: true,
  role: true,
  active: true,
  canManageGrades: true,
  bio: true,
  phone: true,
  createdAt: true,
} as const;
export const assignmentInclude = {
  subject: true,
  group: true,
  period: true,
  teacher: { select: { id: true, name: true, bio: true } },
} as const;
const lessonInclude = {
  assignment: { include: assignmentInclude },
  room: true,
  teacher: { select: { id: true, name: true } },
} as const;
const assessmentInclude = {
  assignment: { include: assignmentInclude },
  room: true,
} as const;
const gradeInclude = {
  assignment: { include: assignmentInclude },
  scale: true,
  student: { select: { id: true, name: true } },
  assessment: true,
} as const;
export const currentMembership = (userId: string, at = new Date()) => ({
  userId,
  startsAt: { lte: at },
  OR: [{ endsAt: null }, { endsAt: { gt: at } }],
});
export async function scope(u: User) {
  if (u.role === "ADMIN") return {};
  if (u.role === "TEACHER")
    return {
      active: true,
      teacherId: u.id,
      teacher: { active: true },
      group: { active: true },
      period: { active: true },
      subject: { active: true },
    };
  const members = await db.membership.findMany({
    where: currentMembership(u.id),
    select: { groupId: true, periodId: true, startsAt: true, endsAt: true },
  });
  return {
    active: true,
    OR: members.map((m) => ({ groupId: m.groupId, periodId: m.periodId })),
  };
}
export async function newsScope(
  u: User | null,
): Promise<Prisma.NewsWhereInput> {
  if (u?.role === "ADMIN") return {};
  const base: Prisma.NewsWhereInput = {
    status: "PUBLISHED",
    publishedAt: { lte: new Date() },
  };
  if (!u) return { ...base, audience: "PUBLIC" };
  const ms = await db.membership.findMany({
    where: currentMembership(u.id),
    select: { groupId: true },
  });
  return {
    ...base,
    OR: [
      { audience: "PUBLIC" },
      { audience: "AUTHENTICATED" },
      { audience: "ROLE", targetRole: u.role },
      { audience: "GROUP", groupId: { in: ms.map((x) => x.groupId) } },
    ],
  };
}
export async function readPortal(
  u: User,
  resource: string,
  q: URLSearchParams,
): Promise<unknown> {
  const a = await scope(u);
  const take = Math.min(100, Math.max(1, Number(q.get("limit")) || 100));
  const skip = Math.max(0, Number(q.get("offset")) || 0);
  const start = q.get("from"),
    end = q.get("to");
  const time: Prisma.DateTimeFilter = {
    gte: start ? date(start) : new Date(Date.now() - 30 * 86400000),
    lte: end ? date(end) : new Date(Date.now() + 60 * 86400000),
  };
  const windows =
    u.role === "STUDENT"
      ? await db.membership.findMany({ where: { userId: u.id } })
      : [];
  const dateWindows = windows.map((m) => ({
    groupId: m.groupId,
    assignment: { periodId: m.periodId },
    startsAt: { gte: m.startsAt, ...(m.endsAt ? { lt: m.endsAt } : {}) },
  }));
  const filter: Prisma.LessonWhereInput = {
    assignment: a,
    startsAt: time,
    ...(u.role === "STUDENT" ? { OR: dateWindows } : {}),
  };
  if (u.role === "TEACHER") {
    filter.assignment = {
      active: true,
      period: { active: true },
      group: { active: true },
      subject: { active: true },
    };
    filter.teacherId = u.id;
  }
  if (q.get("groupId")) filter.groupId = q.get("groupId")!;
  if (q.get("teacherId")) {
    if (u.role === "TEACHER" && q.get("teacherId") !== u.id)
      throw new AppError(403, "Нет доступа к чужому расписанию");
    filter.teacherId = q.get("teacherId")!;
  }
  if (q.get("roomId")) filter.roomId = q.get("roomId")!;
  switch (resource) {
    case "overview":
      return {
        user: pickUser(u),
        lessons: await readPortal(u, "schedule", q),
        assessments: await readPortal(u, "assessments", q),
        grades: await readPortal(u, "grades", q),
        notifications: await readPortal(u, "notifications", q),
        news: await readPortal(u, "news", q),
        assignments: await readPortal(u, "assignments", q),
        settings: await db.setting.findUnique({ where: { id: "main" } }),
      };
    case "schedule":
      return db.lesson.findMany({
        where: filter,
        include: lessonInclude,
        orderBy: { startsAt: "asc" },
        take,
        skip,
      });
    case "assessments":
      return db.assessment.findMany({
        where: {
          assignment: a,
          startsAt: time,
          ...(u.role === "STUDENT" ? { OR: dateWindows } : {}),
        },
        include: assessmentInclude,
        orderBy: { startsAt: "asc" },
        take,
        skip,
      });
    case "grades": {
      const where: Prisma.GradeWhereInput =
        u.role === "STUDENT" ? { studentId: u.id } : { assignment: a };
      if (
        q.get("studentId") &&
        q.get("studentId") !== u.id &&
        u.role === "STUDENT"
      )
        throw new AppError(403, "Доступ к чужим оценкам запрещён");
      if (q.get("studentId")) where.studentId = q.get("studentId")!;
      if (q.get("assignmentId")) where.assignmentId = q.get("assignmentId")!;
      if (q.get("periodId"))
        where.AND = { assignment: { periodId: q.get("periodId")! } };
      return db.grade.findMany({
        where,
        include: gradeInclude,
        orderBy: { date: "desc" },
        take,
        skip,
      });
    }
    case "gradeHistory": {
      if (u.role === "STUDENT" || (u.role === "ADMIN" && !u.canManageGrades))
        throw new AppError(403, "История доступна только уполномоченным");
      const g = await db.grade.findUnique({ where: { id: q.get("id") || "" } });
      if (!g) throw new AppError(404, "Запись не найдена");
      await requireAssignment(u, g.assignmentId);
      return db.gradeHistory.findMany({
        where: { gradeId: g.id },
        orderBy: { createdAt: "desc" },
        take,
      });
    }
    case "assignments": {
      const assignments = await db.assignment.findMany({
        where: a,
        include: assignmentInclude,
        take,
        skip,
      });
      if (u.role === "STUDENT") return assignments;
      return Promise.all(
        assignments.map(async (x) => ({
          ...x,
          group: {
            ...x.group,
            memberships: await db.membership.findMany({
              where: {
                groupId: x.groupId,
                periodId: x.periodId,
                ...currentMembershipPlaceholder(),
              },
              include: {
                user: { select: { id: true, name: true, active: true } },
              },
            }),
          },
        })),
      );
    }
    case "notifications":
      return db.notification.findMany({
        where: { userId: u.id },
        orderBy: { createdAt: "desc" },
        take,
        skip,
      });
    case "profile": {
      if (q.get("id") && q.get("id") !== u.id)
        throw new AppError(403, "Чужой профиль недоступен");
      return {
        ...pickUser(u),
        memberships: await db.membership.findMany({
          where: { userId: u.id },
          include: { group: true, period: true },
        }),
        assignments: await db.assignment.findMany({
          where: { teacherId: u.id, active: true },
          include: assignmentInclude,
        }),
      };
    }
    case "news":
      return db.news.findMany({
        where: await newsScope(u),
        include: { author: { select: { name: true } } },
        orderBy: { publishedAt: "desc" },
        take,
        skip,
      });
    case "rooms":
      return db.room.findMany({
        where: { active: true },
        take,
        skip,
        orderBy: { name: "asc" },
      });
    case "groups":
      return db.group.findMany({
        where: u.role === "ADMIN" ? {} : { assignments: { some: a } },
        take,
        skip,
      });
    case "subjects":
      return db.subject.findMany({
        where: u.role === "ADMIN" ? {} : { assignments: { some: a } },
        take,
        skip,
      });
    case "periods":
      return db.period.findMany({ take, skip, orderBy: { startsAt: "desc" } });
    case "users": {
      if (u.role === "STUDENT") throw new AppError(403, "Недостаточно прав");
      const pairs =
        u.role === "TEACHER"
          ? await db.assignment.findMany({
              where: a,
              select: { groupId: true, periodId: true },
            })
          : [];
      return db.user.findMany({
        where:
          u.role === "ADMIN"
            ? {}
            : {
                role: "STUDENT",
                active: true,
                memberships: {
                  some: {
                    ...currentMembershipPlaceholder(),
                    AND: { OR: pairs },
                  },
                },
              },
        select:
          u.role === "ADMIN"
            ? safeUser
            : { id: true, name: true, role: true, active: true },
        take,
        skip,
      });
    }
    case "audit":
      requireAdmin(u);
      return db.audit.findMany({
        include: { actor: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take,
        skip,
      });
    case "scales":
      return db.scale.findMany({ take, skip, orderBy: { name: "asc" } });
    case "settings":
      return db.setting.findUnique({ where: { id: "main" } });
    default:
      throw new AppError(404, "Раздел не найден");
  }
}
function pickUser(u: User) {
  const { passwordHash: _, ...v } = u;
  void _;
  return v;
}
const text = (v: unknown, max = 500) => z.string().trim().max(max).parse(v);
const id = (v: unknown) => z.string().min(1).max(100).parse(v);
function date(v: unknown) {
  const s = z.string().datetime({ offset: true }).parse(v);
  return new Date(s);
}
const optionalText = (v: unknown, max = 500) => (v == null ? "" : text(v, max));
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
type TX = Prisma.TransactionClient;
async function audit(
  tx: TX,
  u: User,
  entity: string,
  entityId: string,
  reason?: string,
) {
  await tx.audit.create({
    data: { actorId: u.id, action: "SAVE", entity, entityId, reason },
  });
}
async function notify(
  tx: TX,
  assignmentId: string,
  title: string,
  body: string,
  href: string,
  before?: unknown,
  after?: unknown,
) {
  const a = await tx.assignment.findUniqueOrThrow({
    where: { id: assignmentId },
  });
  const members = await tx.membership.findMany({
    where: {
      groupId: a.groupId,
      periodId: a.periodId,
      ...currentMembershipPlaceholder(),
    },
    select: { userId: true },
  });
  const changedTeachers = [before, after].flatMap((x) =>
    x && typeof x === "object" && "teacherId" in x
      ? [String((x as { teacherId: string }).teacherId)]
      : [],
  );
  const ids = [
    ...new Set([
      a.teacherId,
      ...changedTeachers,
      ...members.map((m) => m.userId),
    ]),
  ];
  const snapshot = async (value: unknown) => {
    if (!value || typeof value !== "object") return null;
    const v = value as Record<string, unknown>;
    const room =
      typeof v.roomId === "string"
        ? await tx.room.findUnique({
            where: { id: v.roomId },
            select: { name: true },
          })
        : null;
    const teacher =
      typeof v.teacherId === "string"
        ? await tx.user.findUnique({
            where: { id: v.teacherId },
            select: { name: true },
          })
        : null;
    return {
      startsAt: v.startsAt,
      endsAt: v.endsAt,
      room: room?.name || "Не указана",
      teacher: teacher?.name || "Не указан",
      status: v.status,
      ...(v.title ? { title: v.title } : {}),
      ...(v.note ? { note: v.note } : {}),
    };
  };
  const beforeSnapshot = await snapshot(before),
    afterSnapshot = await snapshot(after);
  await tx.notification.createMany({
    data: ids.map((userId) => ({
      userId,
      title,
      body,
      href,
      ...(beforeSnapshot ? { before: json(beforeSnapshot) } : {}),
      ...(afterSnapshot ? { after: json(afterSnapshot) } : {}),
    })),
  });
}
function currentMembershipPlaceholder() {
  return {
    startsAt: { lte: new Date() },
    OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
  };
}
async function assignment(tx: TX, u: User, assignmentId: string) {
  await tx.$queryRaw`SELECT id FROM "Assignment" WHERE id=${assignmentId} FOR SHARE`;
  const a = await tx.assignment.findUnique({
    where: { id: assignmentId },
    include: { period: true, teacher: true, group: true, subject: true },
  });
  if (
    !a ||
    !a.active ||
    !a.teacher.active ||
    !a.group.active ||
    !a.period.active ||
    !a.subject.active
  )
    throw new AppError(403, "Назначение недоступно или отозвано");
  if (u.role === "STUDENT" || (u.role === "TEACHER" && a.teacherId !== u.id))
    throw new AppError(403, "Нет доступа к этому назначению");
  return a;
}
function version(v: unknown) {
  return z.coerce.number().int().positive().parse(v);
}
function checkPeriod(
  a: { period: { startsAt: Date; endsAt: Date } },
  s: Date,
  e: Date,
) {
  if (s < a.period.startsAt || e > a.period.endsAt || e <= s)
    throw new AppError(
      422,
      "Время должно быть внутри учебного периода; конец позже начала",
    );
}
export async function writePortal(u: User, input: Record<string, unknown>) {
  const action = id(input.action);
  const key = id(input.key);
  const digest = createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
  const scoped = createHash("sha256")
    .update(u.id + ":" + key)
    .digest("hex");
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${scoped}))`;
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${u.id} FOR SHARE`;
      const fresh = await tx.user.findUnique({ where: { id: u.id } });
      if (!fresh?.active) throw new AppError(401, "Войдите в систему");
      u = fresh;
      if (action === "saveGrade" || action === "saveAssessment") {
        if (action === "saveGrade" && u.role === "ADMIN" && !u.canManageGrades)
          throw new AppError(403, "Нет полномочия управления оценками");
        await assignment(tx, u, id(input.assignmentId));
      } else if (!["saveProfile", "readNotification"].includes(action))
        requireAdmin(u);
      const previous = await tx.idempotency.findUnique({
        where: { key: scoped },
      });
      if (previous) {
        const r = previous.result as { hash: string; data: unknown };
        if (r.hash !== digest)
          throw new AppError(
            409,
            "Ключ повтора уже использован для другого действия",
          );
        return r.data;
      }
      const data = await mutate(tx, u, action, input);
      await tx.idempotency.create({
        data: {
          key: scoped,
          userId: u.id,
          result: json({ hash: digest, data }),
        },
      });
      return data;
    },
    { maxWait: 5000, timeout: 15000 },
  );
}
async function mutate(
  tx: TX,
  u: User,
  action: string,
  p: Record<string, unknown>,
): Promise<unknown> {
  if (action === "saveProfile")
    return tx.user.update({
      where: { id: u.id },
      data: {
        bio: optionalText(p.bio, 1200),
        phone: optionalText(p.phone, 40),
      },
      select: safeUser,
    });
  if (action === "readNotification") {
    const n = await tx.notification.updateMany({
      where: { id: id(p.id), userId: u.id },
      data: { readAt: new Date() },
    });
    if (!n.count) throw new AppError(404, "Уведомление не найдено");
    return { ok: true };
  }
  if (action === "saveLesson") {
    requireAdmin(u);
    const a = await assignment(tx, u, id(p.assignmentId));
    const startsAt = date(p.startsAt),
      endsAt = date(p.endsAt);
    checkPeriod(a, startsAt, endsAt);
    const old = p.id
      ? await tx.lesson.findUnique({
          where: { id: id(p.id) },
          include: { assessments: true },
        })
      : null;
    if (p.id && !old) throw new AppError(404, "Занятие не найдено");
    const reason = old ? text(p.reason, 500) : optionalText(p.reason);
    if (old && !reason) throw new AppError(422, "Укажите причину изменения");
    if (
      old?.assessments.length &&
      (old.startsAt.getTime() !== startsAt.getTime() ||
        old.endsAt.getTime() !== endsAt.getTime() ||
        old.assignmentId !== a.id)
    )
      throw new AppError(
        409,
        "С занятием связана контрольная. Сначала отвяжите её или измените дату контрольной явно",
      );
    const data = {
      assignmentId: a.id,
      teacherId: p.teacherId ? id(p.teacherId) : a.teacherId,
      groupId: a.groupId,
      roomId: id(p.roomId),
      startsAt,
      endsAt,
      status: z
        .enum(["SCHEDULED", "CANCELLED", "MOVED", "SUBSTITUTED"])
        .parse(p.status || "SCHEDULED"),
      type: optionalText(p.type, 100) || "Практика",
      note: optionalText(p.note),
    };
    const teacher = await tx.user.findUnique({ where: { id: data.teacherId } });
    const room = await tx.room.findUnique({ where: { id: data.roomId } });
    if (!room?.active)
      throw new AppError(422, "Аудитория неактивна или не найдена");
    if (!teacher?.active || teacher.role !== "TEACHER")
      throw new AppError(422, "Преподаватель недоступен");
    if (old) {
      await tx.assessment.updateMany({
        where: { lessonId: old.id },
        data: {
          roomId: data.roomId,
          teacherId: data.teacherId,
          ...(data.status === "CANCELLED" ? { status: "CANCELLED" } : {}),
          version: { increment: 1 },
        },
      });
    }
    let result;
    if (old) {
      const r = await tx.lesson.updateMany({
        where: { id: old.id, version: version(p.version) },
        data: { ...data, version: { increment: 1 } },
      });
      if (!r.count)
        throw new AppError(409, "Запись уже изменена. Обновите страницу");
      result = await tx.lesson.findUniqueOrThrow({ where: { id: old.id } });
    } else result = await tx.lesson.create({ data });
    if (old && old.assignmentId !== a.id)
      await notify(
        tx,
        old.assignmentId,
        "Занятие перенесено в другую группу",
        reason,
        "/campus/schedule",
        old,
        result,
      );
    await audit(tx, u, "Lesson", result.id, reason);
    await notify(
      tx,
      a.id,
      old ? "Расписание изменилось" : "Новое занятие",
      reason || data.type,
      "/campus/schedule",
      old,
      result,
    );
    return result;
  }
  if (action === "saveAssessment") {
    const a = await assignment(tx, u, id(p.assignmentId));
    const startsAt = date(p.startsAt),
      endsAt = p.endsAt ? date(p.endsAt) : null;
    checkPeriod(a, startsAt, endsAt || new Date(startsAt.getTime() + 1));
    const old = p.id
      ? await tx.assessment.findUnique({ where: { id: id(p.id) } })
      : null;
    if (p.id && !old) throw new AppError(404, "Событие не найдено");
    if (old) {
      await assignment(tx, u, old.assignmentId);
      if (old.assignmentId !== a.id)
        throw new AppError(
          422,
          "Принадлежность контрольной нельзя менять; создайте новое событие",
        );
    }
    if (p.roomId) {
      const room = await tx.room.findUnique({ where: { id: id(p.roomId) } });
      if (!room?.active)
        throw new AppError(422, "Аудитория неактивна или не найдена");
    }
    const lessonId = p.lessonId ? id(p.lessonId) : null;
    if (lessonId) {
      const l = await tx.lesson.findUnique({ where: { id: lessonId } });
      if (
        !l ||
        l.assignmentId !== a.id ||
        l.status === "CANCELLED" ||
        startsAt < l.startsAt ||
        startsAt >= l.endsAt ||
        (endsAt && endsAt > l.endsAt)
      )
        throw new AppError(
          422,
          "Контрольная должна соответствовать связанному занятию и его времени",
        );
    }
    const data = {
      assignmentId: a.id,
      teacherId: a.teacherId,
      groupId: a.groupId,
      lessonId,
      roomId: p.roomId ? id(p.roomId) : null,
      title: text(p.title, 200),
      type: text(p.type || "Контрольная", 80),
      startsAt,
      endsAt,
      description: optionalText(p.description, 3000),
      status: z
        .enum(["SCHEDULED", "CANCELLED", "MOVED"])
        .parse(p.status || "SCHEDULED"),
    };
    let result;
    if (old) {
      const r = await tx.assessment.updateMany({
        where: { id: old.id, version: version(p.version) },
        data: { ...data, version: { increment: 1 } },
      });
      if (!r.count)
        throw new AppError(409, "Событие уже изменено. Обновите страницу");
      result = await tx.assessment.findUniqueOrThrow({ where: { id: old.id } });
    } else result = await tx.assessment.create({ data });
    await audit(tx, u, "Assessment", result.id, optionalText(p.reason));
    await notify(
      tx,
      a.id,
      old ? "Контрольная изменена" : "Новая контрольная",
      data.title,
      "/campus/assessments",
      old,
      result,
    );
    return result;
  }
  if (action === "saveGrade") {
    if (u.role === "ADMIN" && !u.canManageGrades)
      throw new AppError(403, "Нет отдельного полномочия управления оценками");
    const a = await assignment(tx, u, id(p.assignmentId));
    const old = p.id
      ? await tx.grade.findUnique({ where: { id: id(p.id) } })
      : null;
    if (p.id && !old) throw new AppError(404, "Оценка не найдена");
    if (old) {
      await assignment(tx, u, old.assignmentId);
      if (old.assignmentId !== a.id || old.studentId !== id(p.studentId))
        throw new AppError(422, "Нельзя менять принадлежность оценки");
    }
    const studentId = id(p.studentId);
    const dateAt = p.date ? date(p.date) : new Date();
    checkPeriod(a, dateAt, new Date(dateAt.getTime() + 1));
    await tx.$queryRaw`SELECT id FROM "Membership" WHERE "userId"=${studentId} AND "groupId"=${a.groupId} FOR SHARE`;
    const member = await tx.membership.findFirst({
      where: {
        userId: studentId,
        groupId: a.groupId,
        periodId: a.periodId,
        startsAt: { lte: dateAt },
        OR: [{ endsAt: null }, { endsAt: { gt: dateAt } }],
        user: { active: true, role: "STUDENT" },
      },
    });
    if (!member)
      throw new AppError(422, "Студент не состоит в группе в выбранную дату");
    const kind = z
      .enum(["SCORE", "ABSENT", "UNGRADED"])
      .parse(p.kind || "SCORE");
    const scale = await tx.scale.findUnique({
      where: { id: typeof p.scaleId === "string" ? p.scaleId : "demo100" },
    });
    if (!scale) throw new AppError(422, "Шкала не найдена");
    if (
      kind === "SCORE" &&
      (p.value === null || p.value === undefined || p.value === "")
    )
      throw new AppError(422, "Введите балл: пустое значение не равно нулю");
    const value =
      kind === "SCORE"
        ? z.coerce.number().int().min(scale.min).max(scale.max).parse(p.value)
        : null;
    const assessmentId = p.assessmentId ? id(p.assessmentId) : null;
    if (assessmentId) {
      const assessment = await tx.assessment.findUnique({
        where: { id: assessmentId },
      });
      if (!assessment || assessment.assignmentId !== a.id)
        throw new AppError(422, "Контрольная другого назначения");
    }
    const reason = old ? text(p.reason, 500) : optionalText(p.reason);
    if (old && reason.length < 3)
      throw new AppError(
        422,
        "Укажите причину исправления оценки (от 3 символов)",
      );
    const data = {
      assignmentId: a.id,
      studentId,
      assessmentId,
      scaleId: scale.id,
      value,
      kind,
      workType: text(p.workType || "Практическая работа", 120),
      date: dateAt,
      comment: optionalText(p.comment, 1200),
      authorId: u.id,
    };
    let result;
    if (old) {
      const r = await tx.grade.updateMany({
        where: { id: old.id, version: version(p.version) },
        data: { ...data, version: { increment: 1 } },
      });
      if (!r.count)
        throw new AppError(409, "Оценка уже изменена. Обновите журнал");
      result = await tx.grade.findUniqueOrThrow({ where: { id: old.id } });
      await tx.gradeHistory.create({
        data: {
          gradeId: old.id,
          oldValue: json(old),
          newValue: json(result),
          reason,
          actorId: u.id,
        },
      });
    } else result = await tx.grade.create({ data });
    await tx.notification.create({
      data: {
        userId: studentId,
        title: old ? "Оценка исправлена" : "Новая оценка",
        body: data.workType,
        href: "/campus/grades",
      },
    });
    await audit(tx, u, "Grade", result.id, reason);
    return result;
  }
  requireAdmin(u);
  if (action === "saveScale") {
    const data = {
      name: text(p.name, 120),
      min: z.coerce.number().int().min(-10000).max(10000).parse(p.min),
      max: z.coerce.number().int().min(-10000).max(10000).parse(p.max),
    };
    if (data.min >= data.max)
      throw new AppError(422, "Максимум шкалы должен быть больше минимума");
    if (p.id) {
      const old = await tx.scale.findUniqueOrThrow({ where: { id: id(p.id) } });
      if (old.min !== data.min || old.max !== data.max)
        throw new AppError(
          409,
          "Границы сохранённой шкалы неизменяемы: создайте новую шкалу",
        );
    }
    const result = p.id
      ? await tx.scale.update({ where: { id: id(p.id) }, data })
      : await tx.scale.create({ data });
    await audit(tx, u, "Scale", result.id);
    return result;
  }
  if (action === "saveSettings") {
    const result = await tx.setting.upsert({
      where: { id: "main" },
      create: {
        id: "main",
        loadThreshold: z.coerce
          .number()
          .int()
          .min(1)
          .max(10)
          .parse(p.loadThreshold),
      },
      update: {
        loadThreshold: z.coerce
          .number()
          .int()
          .min(1)
          .max(10)
          .parse(p.loadThreshold),
      },
    });
    await audit(tx, u, "Setting", "main");
    return result;
  }
  if (action === "saveUser") {
    if (p.id === u.id && (p.active === false || (p.role && p.role !== "ADMIN")))
      throw new AppError(
        422,
        "Нельзя отключить собственный административный доступ",
      );
    const data = {
      name: text(p.name, 150),
      email: z.string().email().max(200).parse(p.email).toLowerCase(),
      role: z.enum(["STUDENT", "TEACHER", "ADMIN"]).parse(p.role || "STUDENT"),
      active: p.active !== false,
      canManageGrades: p.canManageGrades === true,
    };
    const password = p.password
      ? z.string().min(12).max(72).parse(p.password)
      : undefined;
    if (password && Buffer.byteLength(password, "utf8") > 72)
      throw new AppError(422, "Пароль должен занимать не более 72 байт UTF-8");
    if (!p.id && !password)
      throw new AppError(
        422,
        "Для нового пользователя нужен пароль от 12 символов",
      );
    const user = p.id
      ? await tx.user.update({
          where: { id: id(p.id) },
          data: {
            ...data,
            ...(password ? { passwordHash: await hash(password, 12) } : {}),
          },
          select: safeUser,
        })
      : await tx.user.create({
          data: { ...data, passwordHash: await hash(password!, 12) },
          select: safeUser,
        });
    if (p.groupId) {
      if (user.role !== "STUDENT")
        throw new AppError(422, "Группа назначается студенту");
      const groupId = id(p.groupId),
        periodId = id(p.periodId);
      const group = await tx.group.findUnique({ where: { id: groupId } }),
        period = await tx.period.findUnique({ where: { id: periodId } });
      if (!group?.active || !period?.active)
        throw new AppError(422, "Группа или период недоступны");
      const ms = await tx.membership.findFirst({
        where: { userId: user.id, groupId, periodId, endsAt: null },
      });
      if (!ms) {
        const now = new Date();
        await tx.membership.updateMany({
          where: { userId: user.id, periodId, endsAt: null },
          data: { endsAt: now },
        });
        await tx.membership.create({
          data: { userId: user.id, groupId, periodId, startsAt: now },
        });
      }
    }
    await audit(tx, u, "User", user.id);
    return user;
  }
  if (action === "saveAssignment") {
    const existing = p.id
      ? await tx.assignment.findUnique({ where: { id: id(p.id) } })
      : null;
    if (existing) {
      const result = await tx.assignment.update({
        where: { id: existing.id },
        data: { active: p.active !== false },
      });
      await audit(tx, u, "Assignment", result.id);
      return result;
    }
    const teacher = await tx.user.findUnique({
      where: { id: id(p.teacherId) },
    });
    if (!teacher?.active || teacher.role !== "TEACHER")
      throw new AppError(422, "Выберите активного преподавателя");
    const result = await tx.assignment.create({
      data: {
        teacherId: teacher.id,
        groupId: id(p.groupId),
        subjectId: id(p.subjectId),
        periodId: id(p.periodId),
        active: true,
      },
    });
    await audit(tx, u, "Assignment", result.id);
    return result;
  }
  if (action === "saveNews") {
    const audience = z
        .enum(["PUBLIC", "AUTHENTICATED", "ROLE", "GROUP"])
        .parse(p.audience || "PUBLIC"),
      status = z
        .enum(["DRAFT", "PUBLISHED", "ARCHIVED"])
        .parse(p.status || "DRAFT");
    const data = {
      title: text(p.title, 200),
      body: text(p.body, 20000),
      category: text(p.category || "Новости", 80),
      audience,
      status,
      targetRole:
        audience === "ROLE"
          ? z.enum(["STUDENT", "TEACHER", "ADMIN"]).parse(p.targetRole)
          : null,
      groupId: audience === "GROUP" ? id(p.groupId) : null,
      authorId: u.id,
      publishedAt: status === "PUBLISHED" ? new Date() : null,
    };
    const result = p.id
      ? await tx.news.update({ where: { id: id(p.id) }, data })
      : await tx.news.create({ data });
    await audit(tx, u, "News", result.id);
    if (status === "PUBLISHED" && audience !== "PUBLIC") {
      const users = await tx.user.findMany({
        where: {
          active: true,
          ...(audience === "ROLE"
            ? { role: data.targetRole! }
            : audience === "GROUP"
              ? {
                  memberships: {
                    some: {
                      groupId: data.groupId!,
                      ...currentMembershipPlaceholder(),
                    },
                  },
                }
              : {}),
        },
        select: { id: true },
        take: 10000,
      });
      await tx.notification.createMany({
        data: users.map((x) => ({
          userId: x.id,
          title: "Новое объявление",
          body: data.title,
          href: "/news/" + result.id,
        })),
      });
    }
    return result;
  }
  let result;
  if (action === "saveGroup") {
    const data = {
      name: text(p.name, 80),
      course: z.coerce
        .number()
        .int()
        .min(1)
        .max(6)
        .parse(p.course || 1),
      program: text(p.program || "Демонстрационная программа", 200),
      active: p.active !== false,
    };
    result = p.id
      ? await tx.group.update({ where: { id: id(p.id) }, data })
      : await tx.group.create({ data });
  } else if (action === "saveSubject") {
    const data = { name: text(p.name, 150), active: p.active !== false };
    result = p.id
      ? await tx.subject.update({ where: { id: id(p.id) }, data })
      : await tx.subject.create({ data });
  } else if (action === "saveRoom") {
    const data = { name: text(p.name, 80), active: p.active !== false };
    result = p.id
      ? await tx.room.update({ where: { id: id(p.id) }, data })
      : await tx.room.create({ data });
  } else if (action === "savePeriod") {
    const data = {
      name: text(p.name, 150),
      startsAt: date(p.startsAt),
      endsAt: date(p.endsAt),
      active: p.active !== false,
    };
    if (data.endsAt <= data.startsAt)
      throw new AppError(422, "Некорректный диапазон периода");
    result = p.id
      ? await tx.period.update({ where: { id: id(p.id) }, data })
      : await tx.period.create({ data });
  } else throw new AppError(404, "Действие не найдено");
  await audit(tx, u, action.slice(4), result.id);
  return result;
}
export function requestId() {
  return randomUUID();
}
