-- Optional time tracking on tasks (hours spent).

ALTER TABLE "Task" ADD COLUMN "timeSpentHours" DECIMAL(8,2);
