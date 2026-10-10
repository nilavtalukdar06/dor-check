import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node --env-file=.env --import tsx prisma/seed.ts",
  },
  datasource: {
    // Migrations need a direct (non-pooled) connection; the app uses the pooled
    // DATABASE_URL through the pg adapter in src/lib/prisma.ts.
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});
