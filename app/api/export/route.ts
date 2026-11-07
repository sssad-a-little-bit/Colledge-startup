import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { actor } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppError, apiError } from "@/lib/errors";
import { csvHeaders, encodeCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";
const MAX_ROWS = 10000;

export async function GET(request: Request) {
  const requestId = randomUUID();
  try {
    const user = await actor();
    const params = new URL(request.url).searchParams;
    const resource = params.get("resource");
    const requestedStudent = params.get("studentId");
    const assignmentId = params.get("assignmentId");
    if (
      user.role === "STUDENT" &&
      requestedStudent &&
      requestedStudent !== user.id
    )
      throw new AppError(403, "Разрешён экспорт только собственных записей");
    let data: unknown[][];
    if (resource === "groups") {
      if (user.role !== "ADMIN")
        throw new AppError(403, "Экспорт справочника доступен администратору");
      const groups = await db.group.findMany({
        orderBy: { name: "asc" },
        take: MAX_ROWS + 1,
      });
      if (groups.length > MAX_ROWS)
        throw new AppError(413, "Слишком много записей для одного экспорта");
      data = [
        ["id", "name", "course", "program", "active"],
        ...groups.map((group) => [
          group.id,
          group.name,
          group.course,
          group.program,
          group.active,
        ]),
      ];
    } else if (resource === "grades") {
      if (user.role === "ADMIN" && !user.canManageGrades)
        throw new AppError(
          403,
          "Требуется отдельное полномочие доступа к оценкам",
        );
      const scope: Prisma.GradeWhereInput =
        user.role === "STUDENT"
          ? { studentId: user.id }
          : user.role === "TEACHER"
            ? {
                assignment: {
                  teacherId: user.id,
                  active: true,
                  period: { active: true },
                  group: { active: true },
                  subject: { active: true },
                },
              }
            : {};
      const grades = await db.grade.findMany({
        where: {
          AND: [
            scope,
            ...(assignmentId ? [{ assignmentId }] : []),
            ...(requestedStudent ? [{ studentId: requestedStudent }] : []),
          ],
        },
        include: {
          student: { select: { name: true } },
          assignment: { include: { subject: true, group: true, period: true } },
          scale: true,
        },
        orderBy: [{ date: "desc" }, { id: "asc" }],
        take: MAX_ROWS + 1,
      });
      if (grades.length > MAX_ROWS)
        throw new AppError(
          413,
          "Уточните учебное назначение: экспорт ограничен 10000 строк",
        );
      data = [
        [
          "id",
          "studentId",
          "studentName",
          "group",
          "subject",
          "period",
          "dateUTC",
          "kind",
          "value",
          "scale",
          "workType",
          "comment",
          "version",
        ],
        ...grades.map((grade) => [
          grade.id,
          grade.studentId,
          grade.student.name,
          grade.assignment.group.name,
          grade.assignment.subject.name,
          grade.assignment.period.name,
          grade.date,
          grade.kind,
          grade.value,
          `${grade.scale.name} (${grade.scale.min}–${grade.scale.max})`,
          grade.workType,
          grade.comment,
          grade.version,
        ]),
      ];
    } else if (resource === "schedule") {
      let scope: Prisma.LessonWhereInput = {};
      if (user.role === "TEACHER")
        scope = {
          teacherId: user.id,
          assignment: {
            active: true,
            period: { active: true },
            group: { active: true },
            subject: { active: true },
          },
        };
      if (user.role === "STUDENT") {
        const memberships = await db.membership.findMany({
          where: { userId: user.id },
        });
        scope = {
          OR: memberships.map((member) => ({
            groupId: member.groupId,
            assignment: { periodId: member.periodId },
            startsAt: {
              gte: member.startsAt,
              ...(member.endsAt ? { lt: member.endsAt } : {}),
            },
          })),
        };
      }
      const lessons = await db.lesson.findMany({
        where: { AND: [scope, ...(assignmentId ? [{ assignmentId }] : [])] },
        include: {
          teacher: { select: { name: true } },
          assignment: { include: { subject: true, group: true, period: true } },
          room: true,
        },
        orderBy: [{ startsAt: "asc" }, { id: "asc" }],
        take: MAX_ROWS + 1,
      });
      if (lessons.length > MAX_ROWS)
        throw new AppError(
          413,
          "Уточните учебное назначение: экспорт ограничен 10000 строк",
        );
      data = [
        [
          "id",
          "assignmentId",
          "subject",
          "group",
          "teacher",
          "room",
          "startsAtUTC",
          "endsAtUTC",
          "displayTimezone",
          "type",
          "status",
          "note",
          "version",
        ],
        ...lessons.map((lesson) => [
          lesson.id,
          lesson.assignmentId,
          lesson.assignment.subject.name,
          lesson.assignment.group.name,
          lesson.teacher.name,
          lesson.room.name,
          lesson.startsAt,
          lesson.endsAt,
          "Asia/Almaty",
          lesson.type,
          lesson.status,
          lesson.note,
          lesson.version,
        ]),
      ];
    } else
      throw new AppError(400, "Укажите ресурс: grades, schedule или groups");
    return new Response(encodeCsv(data), {
      headers: { ...csvHeaders(`${resource}.csv`), "X-Request-ID": requestId },
    });
  } catch (error) {
    return apiError(error, requestId);
  }
}
