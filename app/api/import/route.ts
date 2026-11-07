import { createHash, randomUUID } from "node:crypto";
import { Prisma, LessonStatus } from "@prisma/client";
import { z } from "zod";
import { actor } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppError, apiError } from "@/lib/errors";
import {
  csvHeaders,
  csvTemplates,
  importKinds,
  inspectCsv,
  type CsvIssue,
  type ImportKind,
} from "@/lib/csv";

export const dynamic = "force-dynamic";
const envelope = z
  .object({
    kind: z.enum(importKinds),
    csv: z.string().max(262144),
    mode: z.enum(["preview", "commit"]),
    key: z.string().min(8).max(100).optional(),
  })
  .strict();

async function readLimited(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new AppError(415, "Ожидается JSON");
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, "Пустой запрос");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 300000) {
      await reader.cancel();
      throw new AppError(413, "Размер запроса превышает 300 КБ");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError(400, "Некорректный JSON");
  }
}

function requireSameOrigin(request: Request) {
  const configured = process.env.NEXTAUTH_URL;
  const expected = configured
    ? new URL(configured).origin
    : new URL(request.url).origin;
  if (request.headers.get("origin") !== expected)
    throw new AppError(403, "Запрос разрешён только с сайта портала");
}

async function inspectDatabase(
  tx: Prisma.TransactionClient,
  kind: ImportKind,
  rows: Record<string, unknown>[],
) {
  const errors: CsvIssue[] = [];
  for (const [index, row] of rows.entries()) {
    const issue = (message: string) => errors.push({ row: index + 2, message });
    if (kind === "groups" || kind === "subjects" || kind === "rooms") {
      const where = {
        name: { equals: String(row.name), mode: "insensitive" as const },
      };
      const existing =
        kind === "groups"
          ? await tx.group.findFirst({ where })
          : kind === "subjects"
            ? await tx.subject.findFirst({ where })
            : await tx.room.findFirst({ where });
      if (existing)
        issue("Запись уже существует. Политика дублей: отклонить весь импорт");
    } else {
      const assignment = await tx.assignment.findUnique({
        where: { id: String(row.assignmentId) },
        include: { teacher: true, group: true, subject: true, period: true },
      });
      const room = await tx.room.findUnique({
        where: { id: String(row.roomId) },
      });
      if (
        !assignment ||
        !assignment.active ||
        !assignment.teacher.active ||
        assignment.teacher.role !== "TEACHER" ||
        !assignment.group.active ||
        !assignment.subject.active ||
        !assignment.period.active
      )
        issue("Назначение отсутствует или неактивно");
      if (!room?.active) issue("Аудитория отсутствует или неактивна");
      const start = new Date(String(row.startsAt)),
        end = new Date(String(row.endsAt));
      if (
        assignment &&
        (start < assignment.period.startsAt || end > assignment.period.endsAt)
      )
        issue("Дата занятия выходит за границы учебного периода");
      if (assignment) {
        const duplicate = await tx.lesson.findFirst({
          where: { assignmentId: assignment.id, startsAt: start },
        });
        if (duplicate)
          issue(
            "Занятие уже существует. Политика дублей: отклонить весь импорт",
          );
        if (row.status !== "CANCELLED") {
          const conflict = await tx.lesson.findFirst({
            where: {
              status: { not: "CANCELLED" },
              startsAt: { lt: end },
              endsAt: { gt: start },
              OR: [
                { teacherId: assignment.teacherId },
                { groupId: assignment.groupId },
                { roomId: String(row.roomId) },
              ],
            },
          });
          if (conflict)
            issue(
              "Время пересекается с занятием преподавателя, группы или аудитории",
            );
        }
      }
    }
  }
  if (kind === "schedule") {
    const assignments = await tx.assignment.findMany({
      where: { id: { in: rows.map((r) => String(r.assignmentId)) } },
    });
    for (let i = 0; i < rows.length; i++)
      for (let j = 0; j < i; j++) {
        const a = rows[i],
          b = rows[j];
        if (a.status === "CANCELLED" || b.status === "CANCELLED") continue;
        const aa = assignments.find((x) => x.id === a.assignmentId),
          bb = assignments.find((x) => x.id === b.assignmentId);
        if (
          aa &&
          bb &&
          new Date(String(a.startsAt)) < new Date(String(b.endsAt)) &&
          new Date(String(a.endsAt)) > new Date(String(b.startsAt)) &&
          (aa.teacherId === bb.teacherId ||
            aa.groupId === bb.groupId ||
            a.roomId === b.roomId)
        )
          errors.push({
            row: i + 2,
            message: `Пересечение со строкой ${j + 2}: преподаватель, группа или аудитория заняты`,
          });
      }
  }
  return errors;
}

export async function GET(request: Request) {
  const requestId = randomUUID();
  try {
    const user = await actor();
    if (user.role !== "ADMIN")
      throw new AppError(403, "Импорт доступен администратору");
    const kind = z
      .enum(importKinds)
      .parse(new URL(request.url).searchParams.get("kind"));
    return new Response(csvTemplates[kind], {
      headers: csvHeaders(`template-${kind}.csv`),
    });
  } catch (error) {
    return apiError(error, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  try {
    requireSameOrigin(request);
    const user = await actor();
    if (user.role !== "ADMIN")
      throw new AppError(403, "Импорт доступен администратору");
    const parsed = envelope.safeParse(await readLimited(request));
    if (!parsed.success)
      throw new AppError(400, "Проверьте вид импорта, CSV и режим операции");
    const { kind, csv, mode, key } = parsed.data;
    const digest = createHash("sha256").update(`${kind}\n${csv}`).digest("hex");
    const scope = key ? `import:${user.id}:${key}` : undefined;
    if (mode === "commit" && !scope)
      throw new AppError(400, "Для импорта нужен ключ повторной отправки");
    const result = await db.$transaction(
      async (tx) => {
        if (scope && mode === "commit") {
          const existing = await tx.idempotency.findUnique({
            where: { key: scope },
          });
          if (existing) {
            const saved = existing.result as {
              digest?: string;
              imported?: number;
            };
            if (existing.userId !== user.id || saved.digest !== digest)
              throw new AppError(
                409,
                "Этот ключ уже использован для другого файла",
              );
            return {
              imported: saved.imported,
              repeated: true,
              policy: "reject",
            };
          }
        }
        const inspected = inspectCsv(kind, csv);
        if (!inspected.errors.length)
          inspected.errors.push(
            ...(await inspectDatabase(tx, kind, inspected.rows)),
          );
        if (mode === "preview") return { ...inspected, policy: "reject" };
        if (inspected.errors.length)
          return { ...inspected, imported: 0, policy: "reject" };
        for (const row of inspected.rows) {
          if (kind === "groups")
            await tx.group.create({
              data: {
                name: String(row.name),
                course: Number(row.course),
                program: String(row.program),
              },
            });
          else if (kind === "subjects")
            await tx.subject.create({ data: { name: String(row.name) } });
          else if (kind === "rooms")
            await tx.room.create({ data: { name: String(row.name) } });
          else {
            const assignment = await tx.assignment.findUniqueOrThrow({
              where: { id: String(row.assignmentId) },
            });
            const lesson = await tx.lesson.create({
              data: {
                assignmentId: assignment.id,
                teacherId: assignment.teacherId,
                groupId: assignment.groupId,
                roomId: String(row.roomId),
                startsAt: new Date(String(row.startsAt)),
                endsAt: new Date(String(row.endsAt)),
                status: row.status as LessonStatus,
                note: String(row.note || ""),
              },
            });
            const members = await tx.membership.findMany({
              where: {
                groupId: assignment.groupId,
                periodId: assignment.periodId,
                startsAt: { lte: lesson.startsAt },
                OR: [{ endsAt: null }, { endsAt: { gt: lesson.startsAt } }],
                user: { active: true },
              },
              select: { userId: true },
            });
            const userIds = [
              ...new Set([
                assignment.teacherId,
                ...members.map((m) => m.userId),
              ]),
            ];
            await tx.notification.createMany({
              data: userIds.map((userId) => ({
                userId,
                title: "Опубликовано занятие",
                body: "В расписании появилось занятие. Проверьте дату, время и аудиторию.",
                href: "/campus/schedule",
                after: {
                  lessonId: lesson.id,
                  startsAt: lesson.startsAt.toISOString(),
                  endsAt: lesson.endsAt.toISOString(),
                  roomId: lesson.roomId,
                  status: lesson.status,
                },
              })),
            });
          }
        }
        await tx.audit.create({
          data: {
            actorId: user.id,
            action: "CSV_IMPORT",
            entity: kind,
            entityId: digest.slice(0, 16),
            reason: `Импорт ${inspected.rows.length} строк; политика дублей reject`,
          },
        });
        await tx.idempotency.create({
          data: {
            key: scope!,
            userId: user.id,
            result: { digest, imported: inspected.rows.length },
          },
        });
        return { imported: inspected.rows.length, policy: "reject" };
      },
      { isolationLevel: "Serializable", timeout: 15000, maxWait: 5000 },
    );
    if (mode === "commit" && "errors" in result && result.errors.length) {
      return Response.json(
        {
          data: result,
          error: {
            message:
              "Импорт отклонён: исправьте ошибки строк и повторите предварительную проверку. Данные не изменены.",
            requestId,
            code: "CSV_INVALID",
          },
        },
        {
          status: 422,
          headers: {
            "Cache-Control": "private, no-store",
            "X-Request-ID": requestId,
          },
        },
      );
    }
    return Response.json(
      { data: result },
      {
        headers: {
          "Cache-Control": "private, no-store",
          "X-Request-ID": requestId,
        },
      },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2002", "P2034", "P2004"].includes(error.code)
    )
      return apiError(
        new AppError(
          409,
          "Данные изменились или обнаружен конфликт расписания. Выполните предварительную проверку снова.",
        ),
        requestId,
      );
    return apiError(error, requestId);
  }
}
