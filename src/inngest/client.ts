import { Inngest } from "inngest";

// Local development needs INNGEST_DEV=1 (set in .env); production needs
// INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY. Never hardcode isDev here.
export const inngest = new Inngest({ id: "dorcheck" });
