import { inngest } from "@/inngest/client";
import { sourceSyncRequested } from "@/inngest/events";

/** The knowledge base keeps a copy of the directory: refresh it after a change. */
export async function reindexDirectory(requestedById: string) {
  try {
    await inngest.send(sourceSyncRequested.create({ sourceId: "internal-directory", requestedById }));
  } catch {
    console.warn("directory: could not queue the knowledge re-index");
  }
}
