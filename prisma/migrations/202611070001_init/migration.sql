-- CreateEnum
CREATE TYPE "Role" AS ENUM ('STUDENT', 'TEACHER', 'ADMIN');

-- CreateEnum
CREATE TYPE "LessonStatus" AS ENUM ('SCHEDULED', 'CANCELLED', 'MOVED', 'SUBSTITUTED');

-- CreateEnum
CREATE TYPE "GradeKind" AS ENUM ('SCORE', 'ABSENT', 'UNGRADED');

-- CreateEnum
CREATE TYPE "NewsStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "Audience" AS ENUM ('PUBLIC', 'AUTHENTICATED', 'ROLE', 'GROUP');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'STUDENT',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "canManageGrades" BOOLEAN NOT NULL DEFAULT false,
    "bio" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "course" INTEGER NOT NULL DEFAULT 1,
    "program" TEXT NOT NULL DEFAULT 'Демонстрационная программа',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Period" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Period_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3),

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lesson" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'Практика',
    "status" "LessonStatus" NOT NULL DEFAULT 'SCHEDULED',
    "note" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "lessonId" TEXT,
    "roomId" TEXT,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'Контрольная',
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3),
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scale" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "min" INTEGER NOT NULL DEFAULT 0,
    "max" INTEGER NOT NULL DEFAULT 100,

    CONSTRAINT "Scale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Grade" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "assessmentId" TEXT,
    "scaleId" TEXT NOT NULL DEFAULT 'demo100',
    "value" INTEGER,
    "kind" "GradeKind" NOT NULL DEFAULT 'SCORE',
    "workType" TEXT NOT NULL DEFAULT 'Практическая работа',
    "date" TIMESTAMPTZ(3) NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',
    "authorId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Grade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradeHistory" (
    "id" TEXT NOT NULL,
    "gradeId" TEXT NOT NULL,
    "oldValue" JSONB NOT NULL,
    "newValue" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GradeHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "News" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Новости',
    "status" "NewsStatus" NOT NULL DEFAULT 'DRAFT',
    "audience" "Audience" NOT NULL DEFAULT 'PUBLIC',
    "targetRole" "Role",
    "groupId" TEXT,
    "authorId" TEXT NOT NULL,
    "publishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "News_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Audit" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Idempotency" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Idempotency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "blockedUntil" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL DEFAULT 'main',
    "loadThreshold" INTEGER NOT NULL DEFAULT 2,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Group_name_key" ON "Group"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Period_name_key" ON "Period"("name");

-- CreateIndex
CREATE INDEX "Membership_userId_periodId_idx" ON "Membership"("userId", "periodId");

-- CreateIndex
CREATE INDEX "Membership_groupId_periodId_idx" ON "Membership"("groupId", "periodId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_groupId_periodId_startsAt_key" ON "Membership"("userId", "groupId", "periodId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_name_key" ON "Subject"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Room_name_key" ON "Room"("name");

-- CreateIndex
CREATE INDEX "Assignment_groupId_periodId_active_idx" ON "Assignment"("groupId", "periodId", "active");

-- CreateIndex
CREATE INDEX "Assignment_teacherId_active_idx" ON "Assignment"("teacherId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Assignment_teacherId_groupId_subjectId_periodId_key" ON "Assignment"("teacherId", "groupId", "subjectId", "periodId");

-- CreateIndex
CREATE UNIQUE INDEX "Assignment_id_groupId_key" ON "Assignment"("id", "groupId");

-- CreateIndex
CREATE INDEX "Lesson_groupId_startsAt_idx" ON "Lesson"("groupId", "startsAt");

-- CreateIndex
CREATE INDEX "Lesson_teacherId_startsAt_idx" ON "Lesson"("teacherId", "startsAt");

-- CreateIndex
CREATE INDEX "Lesson_roomId_startsAt_idx" ON "Lesson"("roomId", "startsAt");

-- CreateIndex
CREATE INDEX "Assessment_groupId_startsAt_idx" ON "Assessment"("groupId", "startsAt");

-- CreateIndex
CREATE INDEX "Assessment_teacherId_startsAt_idx" ON "Assessment"("teacherId", "startsAt");

-- CreateIndex
CREATE INDEX "Grade_studentId_assignmentId_date_idx" ON "Grade"("studentId", "assignmentId", "date");

-- CreateIndex
CREATE INDEX "Grade_assignmentId_date_idx" ON "Grade"("assignmentId", "date");

-- CreateIndex
CREATE INDEX "GradeHistory_gradeId_createdAt_idx" ON "GradeHistory"("gradeId", "createdAt");

-- CreateIndex
CREATE INDEX "News_status_audience_publishedAt_idx" ON "News"("status", "audience", "publishedAt");

-- CreateIndex
CREATE INDEX "News_groupId_idx" ON "News"("groupId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Audit_createdAt_idx" ON "Audit"("createdAt");

-- CreateIndex
CREATE INDEX "Audit_entity_entityId_idx" ON "Audit"("entity", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "Idempotency_key_key" ON "Idempotency"("key");

-- CreateIndex
CREATE INDEX "Idempotency_createdAt_idx" ON "Idempotency"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LoginAttempt_key_key" ON "LoginAttempt"("key");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "Period"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "Period"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_assignmentId_groupId_fkey" FOREIGN KEY ("assignmentId", "groupId") REFERENCES "Assignment"("id", "groupId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_assignmentId_groupId_fkey" FOREIGN KEY ("assignmentId", "groupId") REFERENCES "Assignment"("id", "groupId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_scaleId_fkey" FOREIGN KEY ("scaleId") REFERENCES "Scale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeHistory" ADD CONSTRAINT "GradeHistory_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "Grade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeHistory" ADD CONSTRAINT "GradeHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "News" ADD CONSTRAINT "News_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "News" ADD CONSTRAINT "News_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Audit" ADD CONSTRAINT "Audit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Idempotency" ADD CONSTRAINT "Idempotency_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Race-safe resource reservations. Every time range is half-open: adjacent lessons are allowed.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_valid_interval" CHECK ("endsAt" > "startsAt");
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_teacher_overlap" EXCLUDE USING gist
  ("teacherId" WITH =, tstzrange("startsAt", "endsAt", '[)') WITH &&)
  WHERE ("status" <> 'CANCELLED') DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_group_overlap" EXCLUDE USING gist
  ("groupId" WITH =, tstzrange("startsAt", "endsAt", '[)') WITH &&)
  WHERE ("status" <> 'CANCELLED') DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_room_overlap" EXCLUDE USING gist
  ("roomId" WITH =, tstzrange("startsAt", "endsAt", '[)') WITH &&)
  WHERE ("status" <> 'CANCELLED') DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_valid_interval" CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt");
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_status_check" CHECK ("status" IN ('SCHEDULED', 'CANCELLED', 'MOVED', 'COMPLETED'));
-- A duration-less assessment reserves only its instant and does not invent a duration.
-- The range constructor's null upper bound would mean infinity; a closed point range avoids that.
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_teacher_overlap" EXCLUDE USING gist
  ("teacherId" WITH =, (CASE WHEN "endsAt" IS NULL THEN tstzrange("startsAt", "startsAt", '[]') ELSE tstzrange("startsAt", "endsAt", '[)') END) WITH &&)
  WHERE ("status" <> 'CANCELLED') DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_group_overlap" EXCLUDE USING gist
  ("groupId" WITH =, (CASE WHEN "endsAt" IS NULL THEN tstzrange("startsAt", "startsAt", '[]') ELSE tstzrange("startsAt", "endsAt", '[)') END) WITH &&)
  WHERE ("status" <> 'CANCELLED') DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_room_overlap" EXCLUDE USING gist
  ("roomId" WITH =, (CASE WHEN "endsAt" IS NULL THEN tstzrange("startsAt", "startsAt", '[]') ELSE tstzrange("startsAt", "endsAt", '[)') END) WITH &&)
  WHERE ("status" <> 'CANCELLED' AND "roomId" IS NOT NULL) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "Membership" ADD CONSTRAINT "Membership_valid_interval" CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt");
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_no_overlapping_group" EXCLUDE USING gist
  ("userId" WITH =, "periodId" WITH =, tstzrange("startsAt", "endsAt", '[)') WITH &&)
  DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "Period" ADD CONSTRAINT "Period_valid_interval" CHECK ("endsAt" > "startsAt");
ALTER TABLE "Group" ADD CONSTRAINT "Group_course_range" CHECK ("course" BETWEEN 1 AND 9);
ALTER TABLE "Scale" ADD CONSTRAINT "Scale_range" CHECK ("max" > "min");
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_kind_value" CHECK (("kind" = 'SCORE' AND "value" IS NOT NULL) OR ("kind" <> 'SCORE' AND "value" IS NULL));
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_version_positive" CHECK ("version" > 0);
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_version_positive" CHECK ("version" > 0);
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_version_positive" CHECK ("version" > 0);
ALTER TABLE "Setting" ADD CONSTRAINT "Setting_threshold" CHECK ("loadThreshold" BETWEEN 1 AND 20);
ALTER TABLE "GradeHistory" ADD CONSTRAINT "GradeHistory_reason_required" CHECK (length(trim("reason")) >= 3);
ALTER TABLE "News" ADD CONSTRAINT "News_audience_target" CHECK (
  ("audience" <> 'ROLE' OR "targetRole" IS NOT NULL) AND
  ("audience" <> 'GROUP' OR "groupId" IS NOT NULL)
);
ALTER TABLE "News" ADD CONSTRAINT "News_publication_date" CHECK ("status" <> 'PUBLISHED' OR "publishedAt" IS NOT NULL);

CREATE FUNCTION check_grade_integrity() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE lower_bound integer; upper_bound integer; assessment_assignment text;
BEGIN
  SELECT "min", "max" INTO lower_bound, upper_bound FROM public."Scale" WHERE "id" = NEW."scaleId";
  IF NEW."kind" = 'SCORE' AND (NEW."value" < lower_bound OR NEW."value" > upper_bound) THEN
    RAISE EXCEPTION 'Grade outside configured scale' USING ERRCODE = '23514';
  END IF;
  IF NEW."assessmentId" IS NOT NULL THEN
    SELECT "assignmentId" INTO assessment_assignment FROM public."Assessment" WHERE "id" = NEW."assessmentId";
    IF assessment_assignment IS DISTINCT FROM NEW."assignmentId" THEN
      RAISE EXCEPTION 'Assessment and grade assignment mismatch' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public."Assignment" a JOIN public."Membership" m
      ON m."groupId" = a."groupId" AND m."periodId" = a."periodId"
    WHERE a."id" = NEW."assignmentId" AND m."userId" = NEW."studentId"
      AND m."startsAt" <= NEW."date" AND (m."endsAt" IS NULL OR m."endsAt" > NEW."date")
  ) THEN
    RAISE EXCEPTION 'Student is not a member of assignment group on grade date' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER "Grade_integrity" BEFORE INSERT OR UPDATE ON "Grade" FOR EACH ROW EXECUTE FUNCTION check_grade_integrity();

CREATE FUNCTION forbid_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'History is append-only' USING ERRCODE = '23514';
END; $$;
CREATE TRIGGER "GradeHistory_append_only" BEFORE UPDATE OR DELETE ON "GradeHistory" FOR EACH ROW EXECUTE FUNCTION forbid_history_mutation();
CREATE TRIGGER "Audit_append_only" BEFORE UPDATE OR DELETE ON "Audit" FOR EACH ROW EXECUTE FUNCTION forbid_history_mutation();
CREATE TRIGGER "Grade_no_delete" BEFORE DELETE ON "Grade" FOR EACH ROW EXECUTE FUNCTION forbid_history_mutation();

-- Foreign-key/join indexes for journal and schedule access.
CREATE INDEX "Lesson_assignmentId_startsAt_idx" ON "Lesson"("assignmentId", "startsAt");
CREATE INDEX "Assessment_assignmentId_startsAt_idx" ON "Assessment"("assignmentId", "startsAt");
CREATE INDEX "Assessment_roomId_idx" ON "Assessment"("roomId");
CREATE INDEX "Grade_assessmentId_idx" ON "Grade"("assessmentId");
CREATE INDEX "Grade_authorId_idx" ON "Grade"("authorId");
CREATE INDEX "News_authorId_idx" ON "News"("authorId");
CREATE INDEX "Audit_actorId_idx" ON "Audit"("actorId");
