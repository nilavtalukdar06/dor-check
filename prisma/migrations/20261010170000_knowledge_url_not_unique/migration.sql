-- A document's identity is now (sourceId, externalKey). The URL is only a citation, and many of our
-- own documents (tariffs from one origin) legitimately point at the same page.
DROP INDEX "KnowledgeDocument_sourceId_url_key";
CREATE INDEX "KnowledgeDocument_sourceId_url_idx" ON "KnowledgeDocument"("sourceId", "url");
