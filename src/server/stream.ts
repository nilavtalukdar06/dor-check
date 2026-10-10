import { StreamChat } from "stream-chat";
import { COMMENT_MAX } from "@/lib/comments";

export const CHANNEL_TYPE = "report";
/** Owns the channels. Never signs in. */
const SYSTEM_USER = "ttd-system";

export const streamConfigured = () => !!(process.env.NEXT_PUBLIC_STREAM_KEY && process.env.STREAM_SECRET);

export function streamServer() {
  const key = process.env.NEXT_PUBLIC_STREAM_KEY;
  const secret = process.env.STREAM_SECRET;
  if (!key || !secret) throw new Error("Stream is not configured (NEXT_PUBLIC_STREAM_KEY / STREAM_SECRET).");
  // Channel-type changes can take longer than the SDK's 3 second default.
  return StreamChat.getInstance(key, secret, { timeout: 20000 });
}

/**
 * The "report" channel type. Members can read and watch; nobody can post from the browser.
 * Every comment goes through our server (screening, rate limit, DB mirror), which Stream lets
 * through because server-side calls skip permission checks. Idempotent; runs once per process.
 */
const READ = ["read-channel", "read-channel-members"];
let typeReady: Promise<void> | null = null;
export function ensureChannelType() {
  typeReady ??= (async () => {
    const client = streamServer();
    const config = {
      grants: {
        // The default for a signed-in person is nothing: they cannot create or open channels themselves.
        user: [] as string[],
        guest: [] as string[],
        anonymous: [] as string[],
        channel_member: READ,
        channel_moderator: [...READ, "delete-message", "flag-message"],
      },
      typing_events: false,
      read_events: false,
      reactions: false,
      replies: false,
      quotes: false,
      uploads: false,
      url_enrichment: false,
      mutes: false,
      search: false,
      polls: false,
      connect_events: false,
      max_message_length: COMMENT_MAX + 200,
    };
    try {
      await client.updateChannelType(CHANNEL_TYPE, config);
    } catch (e) {
      // Not there yet: create it. Any other failure is real, so let it surface.
      if (!/not found|does not exist|404/i.test(String((e as Error).message))) throw e;
      await client.createChannelType({ name: CHANNEL_TYPE, ...config });
    }
  })().catch((e) => {
    typeReady = null;
    throw e;
  });
  return typeReady;
}

/** Create or update the Stream user. `name` is what the discussion may show publicly. */
export async function upsertStreamUser(id: string, name: string) {
  const client = streamServer();
  await client.upsertUsers([{ id, name }]);
  return client;
}

/** The channel for a report, created on first use. */
export async function ensureReportChannel(channelId: string, reference: string) {
  await ensureChannelType();
  const client = streamServer();
  await client.upsertUsers([{ id: SYSTEM_USER, name: "Travel Trap Detector" }]);
  const channel = client.channel(CHANNEL_TYPE, channelId, { name: `Discussion ${reference}`, created_by_id: SYSTEM_USER } as never);
  await channel.create();
  return channel;
}

/** Make a person a member (staff as moderators) so they can read and watch. */
export async function joinChannel(channelId: string, reference: string, userId: string, staff: boolean) {
  const channel = await ensureReportChannel(channelId, reference);
  await channel.addMembers([{ user_id: userId, channel_role: staff ? "channel_moderator" : "channel_member" }]);
  return channel;
}

export function streamToken(userId: string) {
  return streamServer().createToken(userId);
}
