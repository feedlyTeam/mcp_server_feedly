#!/usr/bin/env node
import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const FEEDLY_BASE = 'https://api.feedly.com/v3';
const TOKEN = process.env.FEEDLY_TOKEN || '';
console.error('Loaded FEEDLY_TOKEN:', TOKEN ? '✅ present' : '❌ missing');

const HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  accept: 'application/json',
};

// 1) Create the MCP server
const server = new McpServer({ name: 'feedly', version: '1.0.0' });

// 2) Register tools with the three-argument form:

// Ping (test)
server.tool(
  'ping',
  { message: z.string() },
  async ({ message }) => {
    console.error('🏓 Ping handler received:', message);
    return { content: [{ type: 'text', text: `pong: ${message}` }] };
  }
);
console.error('✅ ping tool registered');

// Autocomplete Entities
server.tool(
  'feedly_autocomplete',
  {
    query: z.string(),
    count: z.number().int().default(10),
  },
  async ({ query, count }) => {
    console.error('🚀 Running autocomplete with:', query, count);
    const params = new URLSearchParams({ query, count: String(count) });
    const resp = await fetch(
      `${FEEDLY_BASE}/search/entities?${params.toString()}`,
      { headers: HEADERS }
    );
    const text = await resp.text();
    console.error('📥 Raw response:', text);
    if (!resp.ok) throw new Error(text);
    const data = JSON.parse(text);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);
console.error('✅ feedly_autocomplete tool registered');

// Search Articles
server.tool(
  'feedly_search',
  {
    query: z.string().optional(),
    entities: z
      .array(
        z.object({
          id: z.string(),
          label: z.string(),
          aliases: z.array(z.string()).optional(),
          type: z.string().optional(),
          salience: z.enum(['mention', 'about']).default('mention'),
        })
      )
      .optional(),
    source: z
      .object({
        items: z.array(
          z.object({
            id: z.string(),
            type: z.string(),
            tier: z.string().optional(),
            description: z.string().optional(),
          })
        ),
      })
      .default({
        items: [
          { type: 'publicationBucket', id: 'discovery:all-topics', tier: 'tier3' },
        ],
      }),
    count: z.number().int().min(1).max(100).default(10),
    newerThan: z.number().optional(),
    olderThan: z.number().optional(),
    unreadOnly: z.boolean().default(false),
    continuation: z.string().optional(),
    includeAiActions: z.boolean().default(true),
  },
  async ({
    query,
    entities,
    source,
    count,
    newerThan,
    olderThan,
    unreadOnly,
    continuation,
    includeAiActions,
  }) => {
    console.error('🧠 feedly_search handler invoked with query:', query);

    // Simple keyword search
    if (query && !entities) {
      const body: any = {
        layers: [
          { parts: [{ type: 'customKeyword', text: query }], salience: 'mention', type: 'matches' },
        ],
        source,
        count,
        unreadOnly,
        continuation,
        includeAiActions,
      };
      if (newerThan) body.newerThan = newerThan;
      if (olderThan) body.olderThan = olderThan;

      console.error('📤 Sending POST to /search/contents:', JSON.stringify(body, null, 2));
      const resp = await fetch(`${FEEDLY_BASE}/search/contents`, {
        method: 'POST',
        headers: { ...HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      console.error('📥 Feedly response status:', resp.status);
      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json();
      console.error('✅ Parsed Feedly response:', data);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }

    // Entity-based search
    const params = new URLSearchParams({
      count: String(count),
      unreadOnly: String(unreadOnly),
      includeAiActions: String(includeAiActions),
    });
    if (newerThan) params.set('newerThan', String(newerThan));
    if (olderThan) params.set('olderThan', String(olderThan));
    if (continuation) params.set('continuation', continuation!);

    const body: any = {
      source,
      layers: (entities || []).map(e => ({
        parts: [{ id: e.id, label: e.label, aliases: e.aliases || [], type: e.type || 'entity' }],
        type: 'matches',
        salience: e.salience,
      })),
    };
    console.error('📤 Sending POST to /search/contents with entities');
    const resp = await fetch(`${FEEDLY_BASE}/search/contents?${params.toString()}`, {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(await resp.text());
    const data = await resp.json();
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);
console.error('✅ feedly_search tool registered');

// Collect Articles
server.tool(
  'feedly_collect',
  {
    streamId: z.string(),
    count: z.number().int().min(1).max(100).default(20),
  },
  async ({ streamId, count }) => {
    console.error('📥 Collecting from stream:', streamId, 'count:', count);
    const url = new URL(`${FEEDLY_BASE}/streams/contents`);
    url.searchParams.set('streamId', streamId);
    url.searchParams.set('count', String(count));
    const resp = await fetch(url.toString(), { headers: HEADERS });
    if (!resp.ok) throw new Error(await resp.text());
    const data = await resp.json();
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);
console.error('✅ feedly_collect tool registered');

// Entity Lookup
server.tool(
  'feedly_entity_lookup',
  { entity_id: z.string() },
  async ({ entity_id }) => {
    console.error('🔍 Looking up entity:', entity_id);
    const encoded = encodeURIComponent(entity_id);
    const resp = await fetch(`${FEEDLY_BASE}/entities/${encoded}`, { headers: HEADERS });
    if (!resp.ok) throw new Error(await resp.text());
    const data = await resp.json();
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);
console.error('✅ feedly_entity_lookup tool registered');

// 6) Trend Report wrapper tool – natural language queries
server.tool(
  'trend_report',
  {
    topic: z.string().describe('Natural language topic to report on'),
    count: z.number().int().default(5).describe('Number of articles to include')
  },
  async ({ topic, count }) => {
    console.error('📈 trend_report invoked for topic:', topic, 'count:', count);
    // 1) Search articles for the topic
    const params = new URLSearchParams({ query: topic, count: String(count) });
    const searchResp = await fetch(`${FEEDLY_BASE}/search/contents`, {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ layers: [{ parts: [{ type: 'customKeyword', text: topic }], salience: 'mention', type: 'matches' }], count, source: { items: [{ type: 'publicationBucket', id: 'discovery:all-topics', tier: 'tier3' }] }
 })
    });
    if (!searchResp.ok) throw new Error('Search failed: ' + await searchResp.text());
    const searchData = await searchResp.json();
    // 2) Summarize titles
    const items = searchData.items || [];
    const lines = items.slice(0, count).map((i: any, idx: number) => `${idx + 1}. ${i.title}`);
const text = `Here are the latest ${lines.length} articles about "${topic}":\n${lines.join('\n')}`;

    return { content: [{ type: 'text', text }] };
  }
);
console.error('✅ trend_report tool registered');

// 3) Connect transport and start serving MCP
async function main() {
  // Use stdio transport:
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Dump what Claude will see
  const defs = transport.getToolDefinitions?.() || [];
  console.error('🏷️ (stdio) MCP bridge ready – ignore empty definitions log');
  process.stdin.resume();
  process.stdin.on('data', chunk =>
    console.error('🔄 STDIN CHUNK RECEIVED:', chunk.toString())
  );

  process.on('SIGINT', async () => {
    console.error('Shutting down Feedly MCP server...');
    await server.close();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    console.error('Shutting down Feedly MCP server...');
    await server.close();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
