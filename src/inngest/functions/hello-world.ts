import { inngest } from "../client";
import { helloRequested } from "../events";

/** Two steps, so the Inngest dashboard shows a run with both steps completing. */
export const helloWorld = inngest.createFunction(
  { id: "hello-world", triggers: [helloRequested] },
  async ({ event, step }) => {
    const greeting = await step.run("greet", () => `Hello, ${event.data.name}!`);
    const shouted = await step.run("shout", () => greeting.toUpperCase());
    return { greeting, shouted };
  },
);
