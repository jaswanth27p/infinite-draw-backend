-- AlterTable
ALTER TABLE "User" ADD COLUMN     "notifyAccessRemoved" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyFileShared" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyGeneralAccessChanged" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyRoleChanged" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Star" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Star_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Star_userId_idx" ON "Star"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Star_userId_fileId_key" ON "Star"("userId", "fileId");

-- AddForeignKey
ALTER TABLE "Star" ADD CONSTRAINT "Star_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Star" ADD CONSTRAINT "Star_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;
