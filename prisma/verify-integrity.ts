/** Reversible database probes; run only against the seeded synthetic demo DB. */
import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const db = new PrismaClient();
const prefix = `integrity-${randomUUID()}`;
async function main() {
  if (process.env.NODE_ENV === 'production' || process.env.DEMO_SEED !== '1') throw new Error('DEMO_SEED=1 and isolated demo DB required');
  const counts: Record<string, number> = {
    users: await db.user.count(), groups: await db.group.count(), memberships: await db.membership.count(),
    assignments: await db.assignment.count(), lessons: await db.lesson.count(), assessments: await db.assessment.count(),
    grades: await db.grade.count(), news: await db.news.count(), notifications: await db.notification.count(),
  };
  const base = await db.lesson.findUniqueOrThrow({ where: { id: 'demo-lesson-7-1-0' } });
  const startsAt = new Date(base.startsAt.getTime() + 6 * 86400000);
  const endsAt = new Date(startsAt.getTime() + 3600000);
  try {
    const races = await Promise.allSettled([
      db.lesson.create({ data: { id: `${prefix}-lesson`, assignmentId: 'demo-assignment-1', teacherId: 'demo-teacher', groupId: 'demo-group-1', roomId: 'demo-room-1', startsAt, endsAt } }),
      db.assessment.create({ data: { id: `${prefix}-assessment`, assignmentId: 'demo-assignment-2', teacherId: 'demo-teacher-2', groupId: 'demo-group-1', roomId: 'demo-room-2', title: 'Synthetic database integrity probe', startsAt, endsAt } }),
    ]);
    assert.equal(races.filter(r => r.status === 'fulfilled').length, 1, 'Exactly one conflicting cross-table transaction must commit');
    const grade = await db.grade.findUniqueOrThrow({ where: { id: 'demo-grade-1-1' } });
    await assert.rejects(() => db.grade.update({ where: { id: grade.id }, data: { version: { increment: 1 }, value: grade.value === 100 ? 99 : 100 } }));
    const after = await db.grade.findUniqueOrThrow({ where: { id: grade.id } });
    assert.equal(after.version, grade.version);
    assert.equal(after.value, grade.value);
    console.log(JSON.stringify({ counts, crossTableRace: 'PASS: one commit, one rejection', unauditedCorrection: 'PASS: rejected, grade unchanged' }));
  } finally {
    await db.assessment.deleteMany({ where: { id: `${prefix}-assessment` } });
    await db.lesson.deleteMany({ where: { id: `${prefix}-lesson` } });
  }
}
main().catch(() => { console.error('Database integrity probe failed. No personal values logged.'); process.exitCode = 1; }).finally(() => db.$disconnect());
