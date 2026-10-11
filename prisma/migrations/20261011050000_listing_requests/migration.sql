-- Listing requests: a business can ask to be listed. A request is a Property with listingStatus PENDING
-- (and isActive false, so every public query already hides it) until a moderator approves or rejects it.
-- Existing rows default to APPROVED and stay listed.
ALTER TABLE "Property" ADD COLUMN "listingStatus" TEXT NOT NULL DEFAULT 'APPROVED';
ALTER TABLE "Property" ADD COLUMN "requestedById" TEXT;
ALTER TABLE "Property" ADD COLUMN "rejectionReason" TEXT;
ALTER TABLE "Property" ADD COLUMN "documentEvidenceId" TEXT;
CREATE INDEX "Property_listingStatus_idx" ON "Property"("listingStatus");
