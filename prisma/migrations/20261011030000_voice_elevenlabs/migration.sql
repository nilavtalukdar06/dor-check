-- Speech moved from Sarvam to ElevenLabs: its voice settings are speed (the existing "pace"), stability and
-- similarity. "pitch" and "loudness" stay as unused nullable columns so no data is dropped.
ALTER TABLE "VoiceJob" ADD COLUMN "stability" DOUBLE PRECISION;
ALTER TABLE "VoiceJob" ADD COLUMN "similarity" DOUBLE PRECISION;
