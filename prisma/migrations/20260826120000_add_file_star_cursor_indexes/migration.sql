-- CreateIndex
CREATE INDEX "File_ownerId_deletedAt_updatedAt_idx" ON "File"("ownerId", "deletedAt", "updatedAt");

-- CreateIndex
CREATE INDEX "Star_userId_createdAt_idx" ON "Star"("userId", "createdAt");
