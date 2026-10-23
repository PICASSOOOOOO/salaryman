ALTER TABLE "desktop_basement_presence"
  DROP CONSTRAINT IF EXISTS "desktop_basement_presence_x_check",
  DROP CONSTRAINT IF EXISTS "desktop_basement_presence_y_check";

ALTER TABLE "desktop_basement_presence"
  ADD CONSTRAINT "desktop_basement_presence_x_check"
  CHECK (
    ("level" = 1 AND "x" BETWEEN 0 AND 56569)
    OR ("level" BETWEEN 2 AND 6 AND "x" BETWEEN 0 AND 10000)
  ),
  ADD CONSTRAINT "desktop_basement_presence_y_check"
  CHECK (
    ("level" = 1 AND "y" BETWEEN 0 AND 28284)
    OR ("level" BETWEEN 2 AND 6 AND "y" BETWEEN 0 AND 10000)
  );
