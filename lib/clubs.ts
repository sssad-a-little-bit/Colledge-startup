import { Prisma, User } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { AppError } from "./errors";

const teacherSelect = { id: true, name: true } as const;
const applicationInclude = {
  student: { select: { id: true, name: true, email: true } },
  club: { select: { id: true, name: true } },
} as const;

export async function readClubs(user: User) {
  const applicationScope: Prisma.ClubApplicationWhereInput =
    user.role === "ADMIN"
      ? {}
      : user.role === "TEACHER"
        ? { club: { teacherId: user.id } }
        : { studentId: user.id };
  const [clubs, applications] = await db.$transaction([
    db.club.findMany({
      where: { active: true, teacher: { active: true, role: "TEACHER" } },
      include: {
        teacher: { select: teacherSelect },
        _count: { select: { applications: true } },
        applications: {
          where: { studentId: user.id },
          select: { id: true, status: true, message: true, createdAt: true },
        },
      },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
    db.clubApplication.findMany({
      where: applicationScope,
      include: applicationInclude,
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
  ]);
  return {
    clubs: clubs.map(({ _count, applications: ownApplications, ...club }) => ({
      ...club,
      applicantCount: _count.applications,
      application: user.role === "STUDENT" ? ownApplications[0] || null : null,
    })),
    applications,
  };
}

const identifier = z.string().trim().min(1).max(100);
const applyInput = z
  .object({
    action: z.literal("apply"),
    clubId: identifier,
    message: z.string().trim().max(1200).optional().default(""),
  })
  .strict();
const reviewInput = z
  .object({
    action: z.literal("review"),
    applicationId: identifier,
    status: z.enum(["APPROVED", "DECLINED"]),
  })
  .strict();
const inputSchema = z.discriminatedUnion("action", [applyInput, reviewInput]);

export async function writeClub(user: User, body: Record<string, unknown>) {
  const input = inputSchema.parse(body);
  return db.$transaction(async (tx) => {
    // Account changes and application writes observe the same current actor.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id} FOR SHARE`;
    const actor = await tx.user.findUnique({ where: { id: user.id } });
    if (!actor?.active) throw new AppError(401, "Войдите в аккаунт заново");

    if (input.action === "apply") {
      if (actor.role !== "STUDENT")
        throw new AppError(403, "Заявку на кружок может подать студент");
      // The unique constraint plus per-pair lock makes retries and simultaneous
      // clicks return one application, with one set of notifications.
      const lock = `club-application:${input.clubId}:${actor.id}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lock}, 0))`;
      await tx.$queryRaw`SELECT id FROM "Club" WHERE id=${input.clubId} FOR SHARE`;
      const club = await tx.club.findUnique({
        where: { id: input.clubId },
        include: { teacher: { select: { active: true, role: true } } },
      });
      if (
        !club?.active ||
        !club.teacher.active ||
        club.teacher.role !== "TEACHER"
      )
        throw new AppError(404, "Запись в этот кружок сейчас недоступна");
      const existing = await tx.clubApplication.findUnique({
        where: { clubId_studentId: { clubId: club.id, studentId: actor.id } },
        include: applicationInclude,
      });
      if (existing) return existing;
      const application = await tx.clubApplication.create({
        data: { clubId: club.id, studentId: actor.id, message: input.message },
        include: applicationInclude,
      });
      await tx.notification.createMany({
        data: [
          {
            userId: actor.id,
            title: "Заявка на кружок отправлена",
            body: `«${club.name}»: руководитель рассмотрит вашу заявку.`,
            href: "/campus/clubs",
          },
          {
            userId: club.teacherId,
            title: "Новая заявка в кружок",
            body: `${actor.name} хочет записаться в кружок «${club.name}».`,
            href: "/campus/clubs",
          },
        ],
      });
      await tx.audit.create({
        data: {
          actorId: actor.id,
          action: "APPLY",
          entity: "ClubApplication",
          entityId: application.id,
        },
      });
      return application;
    }

    if (actor.role !== "TEACHER" && actor.role !== "ADMIN")
      throw new AppError(
        403,
        "Рассматривать заявки может только руководитель кружка",
      );
    await tx.$queryRaw`SELECT id FROM "ClubApplication" WHERE id=${input.applicationId} FOR UPDATE`;
    const current = await tx.clubApplication.findUnique({
      where: { id: input.applicationId },
      include: { club: true },
    });
    if (!current) throw new AppError(404, "Заявка не найдена");
    if (actor.role === "TEACHER" && current.club.teacherId !== actor.id)
      throw new AppError(
        403,
        "Вы можете рассматривать заявки только в свои кружки",
      );
    if (current.status === input.status)
      return tx.clubApplication.findUniqueOrThrow({
        where: { id: current.id },
        include: applicationInclude,
      });
    if (current.status !== "PENDING")
      throw new AppError(409, "Заявка уже рассмотрена. Обновите список");
    const application = await tx.clubApplication.update({
      where: { id: current.id },
      data: {
        status: input.status,
        reviewedById: actor.id,
        reviewedAt: new Date(),
      },
      include: applicationInclude,
    });
    await tx.notification.create({
      data: {
        userId: current.studentId,
        title:
          input.status === "APPROVED"
            ? "Вы приняты в кружок"
            : "Заявка в кружок рассмотрена",
        body:
          input.status === "APPROVED"
            ? `Ваша заявка в кружок «${current.club.name}» одобрена. Расписание доступно в разделе кружков.`
            : `Заявка в кружок «${current.club.name}» отклонена. Подробности можно уточнить у руководителя.`,
        href: "/campus/clubs",
      },
    });
    await tx.audit.create({
      data: {
        actorId: actor.id,
        action: input.status,
        entity: "ClubApplication",
        entityId: current.id,
      },
    });
    return application;
  });
}
