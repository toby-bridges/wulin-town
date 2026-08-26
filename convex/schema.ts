import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { agentTables } from './agent/schema';
import { aiTownTables } from './aiTown/schema';
import { conversationId, playerId } from './aiTown/ids';
import { engineTables } from './engine/schema';

export default defineSchema({
  music: defineTable({
    storageId: v.string(),
    type: v.union(v.literal('background'), v.literal('player')),
  }),

  jianghuEvents: defineTable({
    worldId: v.id('worlds'),
    title: v.string(),
    description: v.string(),
    highlights: v.optional(v.string()),
    status: v.union(v.literal('active'), v.literal('archived')),
    startTime: v.number(),
    endTime: v.optional(v.number()),
  })
    .index('worldStatus', ['worldId', 'status'])
    .index('worldTime', ['worldId', 'startTime']),

  episodeRecaps: defineTable({
    worldId: v.id('worlds'),
    title: v.string(),
    body: v.string(),
    day: v.string(),
    eventIds: v.array(v.id('jianghuEvents')),
  }).index('worldDay', ['worldId', 'day']),

  messages: defineTable({
    conversationId,
    messageUuid: v.string(),
    author: playerId,
    text: v.string(),
    worldId: v.optional(v.id('worlds')),
  })
    .index('conversationId', ['worldId', 'conversationId'])
    .index('messageUuid', ['conversationId', 'messageUuid']),

  ...agentTables,
  ...aiTownTables,
  ...engineTables,
});
