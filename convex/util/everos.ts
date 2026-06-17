// EverOS Cloud memory layer client. No dependencies — plain fetch.
// Docs: https://docs.evermind.ai/llms-full.txt
//
// Enabled only when EVEROS_API_KEY is set. Every call is fail-soft: on any
// error we log and return a neutral value so the game never breaks if the
// memory service is slow or down. The local Convex memory system stays as the
// source of truth; EverOS runs alongside it.

const DEFAULT_BASE_URL = 'https://api.evermind.ai';

// Hard cap per EverOS request. A stalled call must never hold a Convex action
// open until the platform-level timeout — that would stall conversation
// generation and memory writes. Abort and fail-soft instead.
const REQUEST_TIMEOUT_MS = 8000;

// Prefix keeps this project's memory scopes from colliding with anything else
// in the same EverOS account.
const SCOPE_PREFIX = 'wulin';

export function everosEnabled(): boolean {
  return !!process.env.EVEROS_API_KEY;
}

function config() {
  const apiKey = process.env.EVEROS_API_KEY;
  if (!apiKey) return null;
  const baseUrl = (process.env.EVEROS_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  return { apiKey, baseUrl };
}

// One EverOS user_id per character. Names are Chinese; encode for safety.
export function characterUserId(playerName: string): string {
  return `${SCOPE_PREFIX}_${encodeURIComponent(playerName)}`;
}

// Single shared group for town-wide public memory (powers the 大事记 timeline).
export function worldGroupId(worldId: string): string {
  return `${SCOPE_PREFIX}_world_${worldId}`;
}

export interface EverosMessage {
  role: 'user' | 'assistant';
  timestamp: number; // unix ms
  content: string;
}

export interface EverosGroupMessage extends EverosMessage {
  sender_id: string;
  sender_name?: string;
}

export interface EverosEpisode {
  episode?: string;
  summary?: string;
  memory_type?: string;
  timestamp?: number;
  participants?: string[];
}

// EverOS responses come from an external service — never trust their shape.
// Pull out a clean EverosEpisode[] regardless of what comes back.
function extractEpisodes(json: any): EverosEpisode[] {
  const raw = json?.data?.episodes;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((ep): ep is EverosEpisode => !!ep && typeof ep === 'object');
}

async function post(path: string, body: unknown): Promise<any | null> {
  const cfg = config();
  if (!cfg) return null;
  try {
    const res = await fetch(`${cfg.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`EverOS ${path} failed: HTTP ${res.status} ${text}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error(`EverOS ${path} error:`, e);
    return null;
  }
}

// Store messages in a character's personal memory.
export async function addPersonalMemory(
  userId: string,
  sessionId: string,
  messages: EverosMessage[],
): Promise<void> {
  await post('/api/v1/memories', { user_id: userId, session_id: sessionId, messages });
}

// Store messages in the shared town memory with per-character attribution.
export async function addGroupMemory(
  groupId: string,
  messages: EverosGroupMessage[],
): Promise<void> {
  await post('/api/v1/memories/group', { group_id: groupId, messages });
}

// Force extraction so memories are searchable sooner (default is async).
export async function flushPersonal(userId: string, sessionId: string): Promise<void> {
  await post('/api/v1/memories/flush', { user_id: userId, session_id: sessionId });
}

export async function flushGroup(groupId: string): Promise<void> {
  await post('/api/v1/memories/group/flush', { group_id: groupId });
}

// Retrieve a character's relevant memories. Returns [] when disabled or on error.
export async function searchPersonalMemory(
  userId: string,
  query: string,
  topK = 5,
): Promise<EverosEpisode[]> {
  const json = await post('/api/v1/memories/search', {
    user_id: userId,
    query,
    filters: { user_id: userId },
    method: 'hybrid',
    memory_types: ['episodic_memory', 'profile'],
    top_k: topK,
  });
  return extractEpisodes(json);
}

// Retrieve town-wide public events (for the 大事记 timeline).
export async function searchGroupMemory(
  groupId: string,
  query: string,
  topK = 10,
): Promise<EverosEpisode[]> {
  return (await searchGroupMemoryResult(groupId, query, topK)).episodes;
}

// Same search, but distinguishes a real outage (ok: false, post returned null)
// from a genuine empty result (ok: true, episodes: []). The timeline UI needs
// this to show "service degraded" instead of "no events yet".
export async function searchGroupMemoryResult(
  groupId: string,
  query: string,
  topK = 10,
): Promise<{ ok: boolean; episodes: EverosEpisode[] }> {
  const json = await post('/api/v1/memories/search', {
    group_id: groupId,
    query,
    filters: { group_id: groupId },
    method: 'hybrid',
    memory_types: ['episodic_memory'],
    top_k: topK,
  });
  return { ok: json !== null, episodes: extractEpisodes(json) };
}

// Render episodes into prompt-ready bullet lines.
export function episodesToPromptLines(episodes: EverosEpisode[]): string[] {
  if (!Array.isArray(episodes)) {
    return [];
  }
  return episodes
    .map((ep) => episodeText(ep))
    .filter((text) => text.length > 0)
    .map((text) => ` - ${text}`);
}

// Coerce an episode's text field to a trimmed string. The field may be missing,
// null, or a non-string if EverOS changes its response shape.
export function episodeText(ep: EverosEpisode): string {
  const raw = ep?.episode ?? ep?.summary ?? '';
  return typeof raw === 'string' ? raw.trim() : String(raw).trim();
}
