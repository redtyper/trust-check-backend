-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "personId" INTEGER,
ADD COLUMN     "screenshotPath" TEXT;

-- CreateTable
CREATE TABLE "Person" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "bankAccount" TEXT,
    "trustScore" INTEGER NOT NULL DEFAULT 50,
    "riskLevel" TEXT NOT NULL DEFAULT 'Nieznany',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
