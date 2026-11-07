-- A custom scale must never allow scores outside the portal's 0–100 range.
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_score_0_100"
  CHECK ("value" IS NULL OR "value" BETWEEN 0 AND 100);
