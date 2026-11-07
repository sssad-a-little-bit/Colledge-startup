-- A single transaction-level lock protocol covers both scheduling tables.
-- Per-table GiST exclusions alone cannot protect cross-table write races.
CREATE FUNCTION lock_teaching_resources() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE resources text[]; resource text;
BEGIN
  IF current_setting('transaction_isolation') = 'repeatable read' THEN
    RAISE EXCEPTION 'Scheduling writes require read committed or serializable isolation' USING ERRCODE = '23514';
  END IF;
  resources := ARRAY['teacher:' || NEW."teacherId", 'group:' || NEW."groupId", 'room:' || NEW."roomId"];
  IF TG_OP = 'UPDATE' THEN
    resources := resources || ARRAY['teacher:' || OLD."teacherId", 'group:' || OLD."groupId", 'room:' || OLD."roomId"];
  END IF;
  FOR resource IN SELECT DISTINCT value FROM unnest(resources) value WHERE value IS NOT NULL ORDER BY value LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('campus-schedule:' || resource, 0));
  END LOOP;
  RETURN NEW;
END; $$;
CREATE TRIGGER "Lesson_lock_resources" BEFORE INSERT OR UPDATE ON "Lesson" FOR EACH ROW EXECUTE FUNCTION lock_teaching_resources();
CREATE TRIGGER "Assessment_lock_resources" BEFORE INSERT OR UPDATE ON "Assessment" FOR EACH ROW EXECUTE FUNCTION lock_teaching_resources();

CREATE FUNCTION check_cross_teaching_resources() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE invalid boolean;
BEGIN
  -- Deferred triggers inspect final transaction state, so linked room substitutions may be atomic.
  SELECT EXISTS (
    SELECT 1 FROM public."Lesson" l JOIN public."Assessment" a ON
      (a."teacherId" = l."teacherId" OR a."groupId" = l."groupId" OR a."roomId" = l."roomId")
      AND tstzrange(l."startsAt", l."endsAt", '[)') &&
        CASE WHEN a."endsAt" IS NULL THEN tstzrange(a."startsAt", a."startsAt", '[]') ELSE tstzrange(a."startsAt", a."endsAt", '[)') END
    WHERE l."status" <> 'CANCELLED' AND a."status" <> 'CANCELLED'
      AND ((TG_TABLE_NAME = 'Lesson' AND l."id" = NEW."id") OR (TG_TABLE_NAME = 'Assessment' AND a."id" = NEW."id"))
      AND NOT (a."assignmentId" = l."assignmentId" AND a."teacherId" = l."teacherId" AND a."groupId" = l."groupId"
        AND a."startsAt" >= l."startsAt" AND COALESCE(a."endsAt", a."startsAt") <= l."endsAt"
        AND (a."roomId" IS NULL OR a."roomId" = l."roomId"))
  ) INTO invalid;
  IF invalid THEN
    RAISE EXCEPTION 'Assessment conflicts with an incompatible lesson' USING ERRCODE = '23P01';
  END IF;
  -- An explicit link may not silently point to a cancelled/moved lesson or another assignment.
  SELECT EXISTS (
    SELECT 1 FROM public."Assessment" a JOIN public."Lesson" l ON a."lessonId" = l."id"
    WHERE a."status" <> 'CANCELLED'
      AND ((TG_TABLE_NAME = 'Lesson' AND l."id" = NEW."id") OR (TG_TABLE_NAME = 'Assessment' AND a."id" = NEW."id"))
      AND (l."status" = 'CANCELLED' OR a."assignmentId" <> l."assignmentId" OR a."groupId" <> l."groupId"
        OR a."teacherId" <> l."teacherId" OR a."startsAt" < l."startsAt" OR COALESCE(a."endsAt", a."startsAt") > l."endsAt"
        OR (a."roomId" IS NOT NULL AND a."roomId" <> l."roomId"))
  ) INTO invalid;
  IF invalid THEN
    RAISE EXCEPTION 'Linked assessment must be updated together with lesson' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER "Lesson_cross_resource_integrity" AFTER INSERT OR UPDATE ON "Lesson"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_cross_teaching_resources();
CREATE CONSTRAINT TRIGGER "Assessment_cross_resource_integrity" AFTER INSERT OR UPDATE ON "Assessment"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_cross_teaching_resources();

CREATE FUNCTION require_grade_correction_history() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW."version" <> OLD."version" + 1 OR NEW."studentId" <> OLD."studentId" OR NEW."assignmentId" <> OLD."assignmentId" THEN
    RAISE EXCEPTION 'Grade correction requires version increment and immutable ownership' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public."GradeHistory" h WHERE h."gradeId" = NEW."id" AND h."actorId" = NEW."authorId"
      AND h."oldValue"->>'version' = OLD."version"::text AND h."newValue"->>'version' = NEW."version"::text
      AND h."oldValue"->>'kind' = OLD."kind"::text AND h."newValue"->>'kind' = NEW."kind"::text
      AND h."oldValue"->'value' = COALESCE(to_jsonb(OLD."value"), 'null'::jsonb)
      AND h."newValue"->'value' = COALESCE(to_jsonb(NEW."value"), 'null'::jsonb)
      AND length(trim(h."reason")) >= 3
  ) THEN
    RAISE EXCEPTION 'Grade correction requires append-only before/after history in same transaction' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER "Grade_correction_history_required" AFTER UPDATE ON "Grade"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_grade_correction_history();

CREATE FUNCTION forbid_assessment_reassignment_with_grades() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."assignmentId" <> OLD."assignmentId" AND EXISTS (SELECT 1 FROM "Grade" WHERE "assessmentId" = OLD."id") THEN
    RAISE EXCEPTION 'Assessment with grades cannot change assignment' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER "Assessment_grade_ownership" BEFORE UPDATE ON "Assessment" FOR EACH ROW EXECUTE FUNCTION forbid_assessment_reassignment_with_grades();
