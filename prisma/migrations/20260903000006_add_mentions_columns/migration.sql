-- AlterTable
ALTER TABLE "User" ADD COLUMN "notifyMentioned" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN "mentionedUserIds" TEXT[] NOT NULL DEFAULT '{}';
