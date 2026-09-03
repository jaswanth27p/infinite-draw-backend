-- CreateEnum
CREATE TYPE "FileVersionOrigin" AS ENUM ('MANUAL', 'AUTO');

-- AlterTable
ALTER TABLE "FileVersion" ADD COLUMN "origin" "FileVersionOrigin" NOT NULL DEFAULT 'MANUAL';

-- CreateIndex
-- Partial index backing the idle-sweep query's WHERE clause (sub-project 22,
-- Task 2) -- not representable in schema.prisma's DSL, added here only,
-- same treatment as sub-project 19's pg_trgm expression index.
CREATE INDEX "File_idle_sweep_idx" ON "File" ("updatedAt") WHERE "deletedAt" IS NULL;
