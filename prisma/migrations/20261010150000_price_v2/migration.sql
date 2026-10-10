-- DropForeignKey
ALTER TABLE "Place" DROP CONSTRAINT "Place_districtId_fkey";

-- AlterTable
ALTER TABLE "Place" ADD COLUMN     "fullName" TEXT,
ADD COLUMN     "mapboxId" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'seed',
ALTER COLUMN "districtId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "PriceCheck" ADD COLUMN     "basis" TEXT,
ADD COLUMN     "confidence" "Level",
ADD COLUMN     "reversed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sampleSize" INTEGER;

-- AlterTable
ALTER TABLE "Source" ADD COLUMN     "benchmarkId" TEXT,
ADD COLUMN     "quote" TEXT,
ADD COLUMN     "unit" TEXT,
ADD COLUMN     "valueInr" INTEGER;

-- AlterTable
ALTER TABLE "TariffBenchmark" ADD COLUMN     "basis" TEXT NOT NULL DEFAULT 'curated',
ADD COLUMN     "confidence" "Level",
ADD COLUMN     "researchedAt" TIMESTAMP(3),
ADD COLUMN     "reviewStatus" TEXT NOT NULL DEFAULT 'approved',
ADD COLUMN     "sampleSize" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Place_mapboxId_key" ON "Place"("mapboxId");

-- CreateIndex
CREATE INDEX "Source_benchmarkId_idx" ON "Source"("benchmarkId");

-- AddForeignKey
ALTER TABLE "Place" ADD CONSTRAINT "Place_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Source" ADD CONSTRAINT "Source_benchmarkId_fkey" FOREIGN KEY ("benchmarkId") REFERENCES "TariffBenchmark"("id") ON DELETE CASCADE ON UPDATE CASCADE;

