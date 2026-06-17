import { v } from 'convex/values';
import { action } from './_generated/server';
import { everosEnabled, searchGroupMemoryResult, episodeText, worldGroupId } from './util/everos';

const MAX_TOP_K = 50;
const DEFAULT_TOP_K = 20;

// 大事记 — town-wide history timeline backed by EverOS group memory.
// EverOS search is an HTTP call, so this must be an action (not a query).
// Fail-soft: never throws to the client. `degraded` is true when EverOS was
// reachable-but-failed, so the UI can show an error instead of "no events".
export const townEvents = action({
  args: {
    worldId: v.id('worlds'),
    query: v.optional(v.string()),
    topK: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ enabled: boolean; degraded: boolean; events: TimelineEvent[] }> => {
    if (!everosEnabled()) {
      return { enabled: false, degraded: false, events: [] };
    }
    // Clamp client-supplied topK: this action is public, so guard cost/latency.
    const topK = Math.min(MAX_TOP_K, Math.max(1, Math.floor(args.topK ?? DEFAULT_TOP_K)));
    const groupId = worldGroupId(args.worldId);
    const { ok, episodes } = await searchGroupMemoryResult(
      groupId,
      args.query?.trim() || '同福客栈最近发生的事',
      topK,
    );
    if (!ok) {
      return { enabled: true, degraded: true, events: [] };
    }
    const events: TimelineEvent[] = episodes
      .map((ep) => ({
        text: episodeText(ep),
        timestamp: typeof ep.timestamp === 'number' ? ep.timestamp : undefined,
        participants: Array.isArray(ep.participants)
          ? ep.participants.filter((p): p is string => typeof p === 'string').map(decodeParticipant)
          : [],
      }))
      .filter((e) => e.text.length > 0)
      .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
    return { enabled: true, degraded: false, events };
  },
});

// Participants come back as EverOS sender_ids like "wulin_%E4%BD%9F...".
// Strip the scope prefix and URL-decode back to the character's display name.
function decodeParticipant(id: string): string {
  const raw = id.startsWith('wulin_') ? id.slice('wulin_'.length) : id;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export type TimelineEvent = {
  text: string;
  timestamp?: number;
  participants: string[];
};
