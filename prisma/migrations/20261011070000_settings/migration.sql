-- Settings: the preferred language can be "auto" (the default: reply in the language the person writes in),
-- and read-aloud keeps ElevenLabs' stability and similarity. No settings screen existed before, so every
-- existing "en-IN" is just the old default and becomes "auto".
ALTER TABLE "UserPreference" ALTER COLUMN "language" SET DEFAULT 'auto';
UPDATE "UserPreference" SET "language" = 'auto' WHERE "language" = 'en-IN';
ALTER TABLE "UserPreference" ADD COLUMN "speechStability" DOUBLE PRECISION NOT NULL DEFAULT 0.5;
ALTER TABLE "UserPreference" ADD COLUMN "speechSimilarity" DOUBLE PRECISION NOT NULL DEFAULT 0.75;
