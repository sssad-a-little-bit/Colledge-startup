import type { User } from "@prisma/client";
import { db } from "./db";
import { AppError } from "./errors";

export function requireAdmin(user: Pick<User, "role" | "active">) {
  if (!user.active || user.role !== "ADMIN") {
    throw new AppError(
      403,
      "Это действие доступно только администратору.",
      "FORBIDDEN",
    );
  }
}

/**
 * Assignment authorization is always fetched fresh. Role TEACHER grants no
 * blanket access to other teachers' subjects, groups or academic periods.
 * Optional at selects a dated membership; historical grades remain scoped by
 * studentId in the grades query, rather than broad group membership.
 */
export async function requireAssignment(
  user: Pick<User, "id" | "role" | "active">,
  assignmentId: string,
  at = new Date(),
) {
  if (!user.active)
    throw new AppError(401, "Аккаунт отключён.", "SESSION_REVOKED");
  const assignment = await db.assignment.findUnique({
    where: { id: assignmentId },
    include: {
      teacher: { select: { id: true, name: true, active: true } },
      group: true,
      subject: true,
      period: true,
    },
  });
  // Return the same denial for absent and inaccessible IDs.
  if (!assignment) {
    throw new AppError(
      403,
      "Учебное назначение недоступно или отозвано.",
      "ASSIGNMENT_FORBIDDEN",
    );
  }
  // Authorized administrators can inspect historical grade audit after revocation.
  if (user.role === "ADMIN") return assignment;
  if (
    !assignment.active ||
    !assignment.period.active ||
    !assignment.group.active ||
    !assignment.subject.active
  ) {
    throw new AppError(
      403,
      "Учебное назначение недоступно или отозвано.",
      "ASSIGNMENT_FORBIDDEN",
    );
  }
  if (
    user.role === "TEACHER" &&
    assignment.teacherId === user.id &&
    assignment.teacher.active
  )
    return assignment;
  if (user.role === "STUDENT") {
    const membership = await db.membership.findFirst({
      where: {
        userId: user.id,
        groupId: assignment.groupId,
        periodId: assignment.periodId,
        startsAt: { lte: at },
        OR: [{ endsAt: null }, { endsAt: { gt: at } }],
      },
      select: { id: true },
    });
    if (membership) return assignment;
  }
  throw new AppError(
    403,
    "Нет доступа к этому предмету и группе.",
    "ASSIGNMENT_FORBIDDEN",
  );
}
