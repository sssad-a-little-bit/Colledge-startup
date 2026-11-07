CREATE TYPE "ClubApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

ALTER TABLE "Group" ALTER COLUMN "program" SET DEFAULT 'Учебная программа';

CREATE TABLE "Club" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "category" TEXT NOT NULL DEFAULT '',
  "schedule" TEXT NOT NULL DEFAULT '',
  "location" TEXT NOT NULL DEFAULT '',
  "teacherId" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Club_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClubApplication" (
  "id" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "message" TEXT NOT NULL DEFAULT '',
  "status" "ClubApplicationStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ClubApplication_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClubApplication_review_consistency" CHECK (
    ("status" = 'PENDING' AND "reviewedById" IS NULL AND "reviewedAt" IS NULL)
    OR ("status" <> 'PENDING' AND "reviewedById" IS NOT NULL AND "reviewedAt" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "Club_name_key" ON "Club"("name");
CREATE INDEX "Club_teacherId_active_idx" ON "Club"("teacherId", "active");
CREATE UNIQUE INDEX "ClubApplication_clubId_studentId_key" ON "ClubApplication"("clubId", "studentId");
CREATE INDEX "ClubApplication_studentId_createdAt_idx" ON "ClubApplication"("studentId", "createdAt");
CREATE INDEX "ClubApplication_clubId_status_createdAt_idx" ON "ClubApplication"("clubId", "status", "createdAt");
CREATE INDEX "ClubApplication_reviewedById_idx" ON "ClubApplication"("reviewedById");

ALTER TABLE "Club" ADD CONSTRAINT "Club_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClubApplication" ADD CONSTRAINT "ClubApplication_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClubApplication" ADD CONSTRAINT "ClubApplication_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClubApplication" ADD CONSTRAINT "ClubApplication_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
