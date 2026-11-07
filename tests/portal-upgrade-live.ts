import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { ApiClient, baseURL } from "./helpers";

const testUrl = process.env.TEST_DATABASE_URL;
assert(
  testUrl,
  "TEST_DATABASE_URL is required; this script never targets the main database",
);
const parsedDatabase = new URL(testUrl);
assert.equal(
  parsedDatabase.pathname,
  "/campus_test",
  "Only the isolated campus_test database is allowed",
);
assert(
  ["localhost", "127.0.0.1"].includes(parsedDatabase.hostname),
  "Only a local test database is allowed",
);
assert.equal(
  process.env.PORTAL_BASE_URL,
  "http://localhost:3001",
  "Set PORTAL_BASE_URL=http://localhost:3001 explicitly",
);
assert.equal(
  baseURL,
  "http://localhost:3001",
  "Only the isolated server on port3001 is allowed",
);
const db = new PrismaClient({ datasourceUrl: testUrl });
const runId = randomUUID();
let stage = "initialization";

type Row = Record<string, any>;
const visibleMarker =
  /демо|(?:^|[\s·])тест(?:овый|овая|овые)?(?:$|[\s·])|\b(?:demo|test)\b/iu;

async function data(response: Response, expectedStatus = 200): Promise<any> {
  assert.equal(
    response.status,
    expectedStatus,
    `Unexpected HTTP status during ${stage}`,
  );
  const body = await response.json();
  assert("data" in body, `Missing data response during ${stage}`);
  return body.data;
}

async function rejected(
  response: Response,
  status: number,
  gradeRange = false,
) {
  assert.equal(
    response.status,
    status,
    `Unexpected rejection status during ${stage}`,
  );
  const body = await response.json();
  assert(body.error?.message, `Missing user-facing error during ${stage}`);
  if (gradeRange)
    assert.match(
      body.error.message,
      /0.*100/,
      "Invalid score needs a clear0–100 message",
    );
}

async function main() {
  stage = "logins";
  const [admin, teacher, student, otherTeacher] = await Promise.all([
    new ApiClient("admin@demo.kit.local").login(),
    new ApiClient("teacher@demo.kit.local").login(),
    new ApiClient("student@demo.kit.local").login(),
    new ApiClient("teacher2@demo.kit.local").login(),
  ]);
  const studentAccount = await db.user.findUniqueOrThrow({
    where: { id: "demo-student" },
  });
  const teacherAccount = await db.user.findUniqueOrThrow({
    where: { id: "demo-teacher" },
  });

  stage = "isolated server/database identity";
  const sentinelId = `upgrade-environment-${runId}`;
  await db.notification.create({
    data: {
      id: sentinelId,
      userId: studentAccount.id,
      title: "Проверка окружения",
      body: "Проверка соединения с изолированной базой",
      href: "/campus",
    },
  });
  const notifications: Row[] = await data(await student.get("notifications"));
  assert(
    notifications.some((entry) => entry.id === sentinelId),
    "Port3001 must serve campus_test before any HTTP writes",
  );
  await db.notification.delete({ where: { id: sentinelId } });

  stage = "rosters and neutral default content";
  const groups = await db.group.findMany({
    where: { id: { in: ["demo-group-1", "demo-group-2"] } },
    include: {
      memberships: {
        where: {
          startsAt: { lte: new Date() },
          OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
          user: { role: "STUDENT", active: true },
        },
        include: { user: { select: { name: true, email: true } } },
      },
    },
    orderBy: { id: "asc" },
  });
  assert.equal(groups.length, 2, "Both existing groups must remain available");
  for (const group of groups) {
    assert(
      group.memberships.length >= 18,
      "Existing groups should each contain at least18 students",
    );
    for (const text of [
      group.name,
      group.program,
      ...group.memberships.flatMap((member) => [
        member.user.name,
        member.user.email,
      ]),
    ]) {
      assert(
        !visibleMarker.test(text),
        "Default group/student content contains obsolete visible markers",
      );
    }
  }
  const publicRows: Row[] = [
    ...(await db.user.findMany({
      select: { name: true, email: true, bio: true },
    })),
    ...(await db.room.findMany({ select: { name: true } })),
    ...(await db.scale.findMany({ select: { name: true } })),
    ...(await db.period.findMany({ select: { name: true } })),
    ...(await db.news.findMany({ select: { title: true, body: true } })),
  ];
  for (const row of publicRows)
    for (const value of Object.values(row))
      assert(
        !visibleMarker.test(String(value)),
        "Default visible content contains obsolete markers",
      );

  stage = "teacher group filters";
  const assignments: Row[] = await data(await teacher.get("assignments"));
  assert(assignments.length > 0, "Teacher needs active assignments");
  for (const group of groups) {
    const filtered: Row[] = await data(
      await teacher.get("grades", `&groupId=${encodeURIComponent(group.id)}`),
    );
    assert(
      filtered.length > 0,
      "Both populated groups should have existing grade rows",
    );
    assert(
      filtered.every(
        (grade) =>
          grade.assignment.groupId === group.id &&
          grade.assignment.teacherId === teacherAccount.id,
      ),
      "Group filter must intersect teacher ownership",
    );
    const searched: Row[] = await data(
      await teacher.get(
        "grades",
        `&groupSearch=${encodeURIComponent(group.name.toLocaleLowerCase("ru"))}`,
      ),
    );
    assert(searched.length > 0, "Group search should find matching grades");
    assert(
      searched.every(
        (grade) =>
          grade.assignment.groupId === group.id &&
          grade.assignment.teacherId === teacherAccount.id,
      ),
      "Group search must intersect teacher ownership",
    );
    const scopedAssignments: Row[] = await data(
      await teacher.get("assignments", `&groupId=${group.id}`),
    );
    assert(
      scopedAssignments.length > 0 &&
        scopedAssignments.every(
          (assignment) =>
            assignment.groupId === group.id &&
            assignment.teacherId === teacherAccount.id,
        ),
      "Journal assignments must follow the selected group",
    );
  }
  const intersection: Row[] = await data(
    await teacher.get(
      "grades",
      `&groupId=${groups[0].id}&groupSearch=${encodeURIComponent(groups[1].name)}`,
    ),
  );
  assert.equal(
    intersection.length,
    0,
    "Group selection and search must intersect",
  );
  const missing: Row[] = await data(
    await teacher.get("grades", `&groupId=missing-${runId}`),
  );
  assert.equal(
    missing.length,
    0,
    "Unknown group must not fall back to all grades",
  );
  const foreignAssignment = await db.assignment.findFirstOrThrow({
    where: { teacherId: "demo-teacher-2", active: true },
  });
  const foreignGrades: Row[] = await data(
    await teacher.get(
      "grades",
      `&groupId=${foreignAssignment.groupId}&assignmentId=${foreignAssignment.id}`,
    ),
  );
  assert.equal(
    foreignGrades.length,
    0,
    "Group filtering must not expose another teacher's subject",
  );

  stage = "API grade range and non-score semantics";
  const assignment = assignments.find((entry) =>
    entry.group.memberships?.some(
      (member: Row) => member.user.id === studentAccount.id,
    ),
  );
  assert(
    assignment,
    "Primary student must belong to a scoped teacher assignment",
  );
  const gradePayload = {
    action: "saveGrade",
    assignmentId: assignment.id,
    studentId: studentAccount.id,
    scaleId: "demo100",
    date: new Date().toISOString(),
    workType: "Практическая работа",
    comment: `Проверка диапазона ${runId}`,
    kind: "SCORE",
  };
  const originalGradeCount = await db.grade.count();
  for (const value of [-1, 101])
    await rejected(
      await teacher.post({ ...gradePayload, key: randomUUID(), value }),
      422,
      true,
    );
  assert.equal(
    await db.grade.count(),
    originalGradeCount,
    "Rejected scores must not create grades",
  );
  for (const value of [0, 100]) {
    const saved = await data(
      await teacher.post({ ...gradePayload, key: randomUUID(), value }),
    );
    assert.equal(
      saved.value,
      value,
      "Boundary score should be returned unchanged",
    );
    const persisted = await db.grade.findUniqueOrThrow({
      where: { id: saved.id },
    });
    assert.equal(
      persisted.value,
      value,
      "Boundary score should persist unchanged",
    );
  }
  for (const [kind, value] of [
    ["ABSENT", ""],
    ["UNGRADED", null],
  ] as const) {
    const saved = await data(
      await teacher.post({ ...gradePayload, key: randomUUID(), kind, value }),
    );
    assert.equal(
      saved.value,
      null,
      "Non-score states must preserve null rather than coercing to zero",
    );
    const persisted = await db.grade.findUniqueOrThrow({
      where: { id: saved.id },
    });
    assert.equal(persisted.kind, kind);
    assert.equal(persisted.value, null);
  }

  stage = "database score constraint on legacy scale";
  const broadScale = await db.scale.create({
    data: { name: "Расширенная шкала проверки", min: -100, max: 200 },
  });
  for (const value of [-1, 101]) {
    let databaseError: unknown;
    try {
      await db.$transaction(async (tx) => {
        await tx.grade.create({
          data: {
            studentId: studentAccount.id,
            assignmentId: assignment.id,
            scaleId: broadScale.id,
            value,
            kind: "SCORE",
            date: new Date(),
            authorId: teacherAccount.id,
          },
        });
        // Roll back even if the required check is accidentally missing.
        throw new Error("INVALID_SCORE_ACCEPTED");
      });
    } catch (error) {
      databaseError = error;
    }
    assert(databaseError, "Invalid direct database write must fail");
    assert.match(
      String(databaseError),
      /Grade_score_0_100/,
      "The0–100 database constraint must reject scores even when a legacy scale is wider",
    );
  }
  assert.equal(
    await db.grade.count(),
    originalGradeCount + 4,
    "Direct rejected writes must leave no records",
  );

  stage = "club catalogue and authentication";
  await rejected(await new ApiClient().fetch("/api/clubs"), 401);
  const catalogue = await data(await student.fetch("/api/clubs"));
  assert(
    catalogue.clubs.length >= 5,
    "Catalogue should contain at least five clubs",
  );
  for (const pattern of [/кибер/i, /стрель/i, /тяж[её]л.*атлет/i, /бокс/i])
    assert(
      catalogue.clubs.some((club: Row) => pattern.test(club.name)),
      "A requested club is missing",
    );
  for (const club of catalogue.clubs) {
    assert(
      club.teacher?.id && club.teacher.name,
      "Each club must show a named teacher",
    );
    assert(
      club.schedule && club.location,
      "Each club must provide its schedule and location",
    );
    assert(
      !visibleMarker.test(
        `${club.name} ${club.description} ${club.teacher.name}`,
      ),
      "Club cards contain obsolete markers",
    );
  }
  const cyber = catalogue.clubs.find((club: Row) => /кибер/i.test(club.name));
  assert(
    cyber && cyber.teacher.id === teacherAccount.id,
    "Cybersecurity club must be led by primary teacher",
  );
  assert.equal(
    cyber.application,
    null,
    "Use a fresh campus_test clone for application mutation checks",
  );

  stage = "concurrent club applications and duplicate protection";
  const notificationCount = await db.notification.count();
  const apply = {
    action: "apply",
    clubId: cyber.id,
    message: "Хочу научиться защищать компьютерные сети.",
  };
  const simultaneous = await Promise.all([
    student.post(apply, "/api/clubs"),
    student.post(apply, "/api/clubs"),
  ]);
  const applications = await Promise.all(
    simultaneous.map((response) => data(response)),
  );
  assert.equal(
    applications[0].id,
    applications[1].id,
    "Concurrent submissions must return one application",
  );
  const application = applications[0];
  assert.equal(application.status, "PENDING");
  assert.equal(
    await db.clubApplication.count({
      where: { clubId: cyber.id, studentId: studentAccount.id },
    }),
    1,
  );
  assert.equal(
    await db.notification.count(),
    notificationCount + 2,
    "Application should notify student and leader exactly once",
  );
  const repeated = await data(await student.post(apply, "/api/clubs"));
  assert.equal(
    repeated.id,
    application.id,
    "Repeated submission must return the existing application",
  );
  assert.equal(
    await db.notification.count(),
    notificationCount + 2,
    "Retry must not add notifications",
  );

  stage = "club role and ownership enforcement";
  await rejected(
    await student.post(
      { ...apply, studentId: "another-student" },
      "/api/clubs",
    ),
    422,
  );
  await rejected(await teacher.post(apply, "/api/clubs"), 403);
  const review = {
    action: "review",
    applicationId: application.id,
    status: "APPROVED",
  };
  await rejected(await student.post(review, "/api/clubs"), 403);
  await rejected(await otherTeacher.post(review, "/api/clubs"), 403);
  assert.equal(
    (
      await db.clubApplication.findUniqueOrThrow({
        where: { id: application.id },
      })
    ).status,
    "PENDING",
    "Forbidden reviews must leave the application pending",
  );
  const foreignOrigin = await fetch(`${baseURL}/api/clubs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://invalid.example",
      Cookie: teacher.cookieHeader(),
    },
    body: JSON.stringify(review),
  });
  await rejected(foreignOrigin, 403);
  const otherInbox = await data(await otherTeacher.fetch("/api/clubs"));
  assert(
    !otherInbox.applications.some((entry: Row) => entry.id === application.id),
    "Unrelated teacher must not see the application's personal details",
  );

  stage = "club approval persistence and student notification";
  const approved = await data(await teacher.post(review, "/api/clubs"));
  assert.equal(approved.status, "APPROVED");
  const savedApplication = await db.clubApplication.findUniqueOrThrow({
    where: { id: application.id },
  });
  assert.equal(savedApplication.reviewedById, teacherAccount.id);
  assert(savedApplication.reviewedAt);
  const refreshed = await data(await student.fetch("/api/clubs"));
  assert.equal(
    refreshed.clubs.find((club: Row) => club.id === cyber.id)?.application
      .status,
    "APPROVED",
    "Student must see the persisted decision after refresh",
  );
  assert(
    refreshed.applications.every(
      (entry: Row) => entry.student.id === studentAccount.id,
    ),
    "Student may read only their own applications",
  );
  const approvalNotice = await db.notification.findFirst({
    where: {
      userId: studentAccount.id,
      href: "/campus/clubs",
      title: "Вы приняты в кружок",
      body: { contains: cyber.name },
    },
  });
  assert(approvalNotice, "Student must receive a notification about approval");
  const adminInbox = await data(await admin.fetch("/api/clubs"));
  assert(
    adminInbox.applications.some((entry: Row) => entry.id === application.id),
    "Administrator should see the application",
  );
  console.log(
    JSON.stringify({
      portalUpgradeLive: "passed",
      groups: groups.length,
      studentsPerGroup: groups.map((group) => group.memberships.length),
      scoreBoundaries: [0, 100],
      invalidScoresRejected: [-1, 101],
      clubs: catalogue.clubs.length,
      duplicateApplications: "prevented",
      approval: "persisted",
    }),
  );
}

main()
  .catch((error) => {
    console.error(
      JSON.stringify({
        portalUpgradeLive: "failed",
        stage,
        message:
          error instanceof assert.AssertionError
            ? error.message
            : "Request or database operation failed",
      }),
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
