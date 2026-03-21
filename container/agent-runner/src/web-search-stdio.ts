/**
 * Web Search MCP Server (Container-compatible)
 * Uses Tavily Search API - optimized for AI agents
 * Works inside Linux containers
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import https from 'https';
import http from 'http';

interface SearchArgs {
  query: string;
  maxResults?: number;
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

interface TavilySearchResponse {
  results: TavilySearchResult[];
  answer?: string;
}

function searchTavily(query: string, maxResults: number): Promise<SearchResult[]> {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.TAVILY_API_KEY;

    if (!apiKey) {
      resolve([{
        title: 'Tavily API Key Required',
        url: 'https://tavily.com',
        snippet: 'Please set TAVILY_API_KEY environment variable to enable web search.',
      }]);
      return;
    }

    const data = JSON.stringify({
      query: query,
      max_results: Math.min(maxResults, 10),
      include_answer: true,
      include_raw_content: false,
    });

    const options = {
      hostname: 'api.tavily.com',
      port: 443,
      path: '/search',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
      },
    };

    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        const results: SearchResult[] = [];

        if (res.statusCode !== 200) {
          console.error(`Tavily API error: ${res.statusCode} - ${responseData}`);
          resolve([{
            title: `Tavily API Error (${res.statusCode})`,
            url: 'https://tavily.com',
            snippet: `Error response from Tavily API. Check your API key. Response: ${responseData.slice(0, 200)}`,
          }]);
          return;
        }

        try {
          const json: TavilySearchResponse = JSON.parse(responseData);
          const resultsList: SearchResult[] = [];

          // Add the answer if available
          if (json.answer) {
            resultsList.push({
              title: 'Answer',
              url: 'https://tavily.com',
              snippet: json.answer,
            });
          }

          // Add search results
          if (json.results && Array.isArray(json.results)) {
            for (const result of json.results.slice(0, maxResults)) {
              resultsList.push({
                title: result.title || 'Untitled',
                url: result.url,
                snippet: result.content || 'No description available',
              });
            }
          }

          if (resultsList.length === 0) {
            resultsList.push({
              title: 'No results found',
              url: `https://tavily.com/search?q=${encodeURIComponent(query)}`,
              snippet: `No results found for: ${query}`,
            });
          }

          resolve(resultsList);
        } catch (err) {
          reject(new Error(`Failed to parse Tavily API response: ${err instanceof Error ? err.message : String(err)}`));
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(`Tavily API request failed: ${e.message}`));
    });

    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Tavily API request timeout'));
    });

    req.write(data);
    req.end();
  });
}

async function main(): Promise<void> {
  const server = new Server(
    { name: 'web-search', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'web_search',
        description: 'Search the web using Tavily Search API. Returns current web search results with AI-optimized answers. Free tier: 1,000 searches/month.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query',
            },
            maxResults: {
              type: 'number',
              description: 'Maximum number of results to return (default: 10)',
            },
          },
          required: ['query'],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === 'web_search') {
      const params = args as Record<string, unknown> | undefined;
      const searchArgs: SearchArgs = {
        query: String(params?.query ?? ''),
        maxResults: params?.maxResults ? Number(params.maxResults) : 10,
      };

      if (!searchArgs.query) {
        return {
          content: [{ type: 'text', text: 'Missing required field: query' }],
          isError: true,
        };
      }

      try {
        const results = await searchTavily(searchArgs.query, searchArgs.maxResults || 10);
        const formattedResults = results.map(r =>
          `Title: ${r.title}\nURL: ${r.url}\nSnippet: ${r.snippet}`
        );

        return {
          content: [{ type: 'text', text: formattedResults.join('\n\n') }],
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text', text: `Search failed: ${errorMsg}` }],
          isError: true,
        };
      }
    }

    return {
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      isError: true,
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Server error:', err);
  process.exit(1);
});
