import prisma from "../src/lib/prisma";
import { resetDemo, seed } from "./seed/index";

async function main() {
  const reset = process.argv.includes("--reset");
  const started = Date.now();
  if (reset) {
    console.log("Removing demo rows…");
    await resetDemo();
  }
  console.log("Seeding…");
  await seed();
  console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
