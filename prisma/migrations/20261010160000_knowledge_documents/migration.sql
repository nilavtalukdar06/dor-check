-- Knowledge documents get a stable identity inside their source and a metadata column.
ALTER TABLE "KnowledgeDocument" ADD COLUMN "externalKey" TEXT;
ALTER TABLE "KnowledgeDocument" ADD COLUMN "metadata" JSONB;
CREATE UNIQUE INDEX "KnowledgeDocument_sourceId_externalKey_key" ON "KnowledgeDocument"("sourceId", "externalKey");
