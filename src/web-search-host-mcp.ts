/**
 * Web Search MCP Server (Host-side)
 * Uses Safari (headless) to search DuckDuckGo on macOS
 * Runs on the host, not inside the container
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { execSync } from 'child_process';

interface SearchArgs {
  query: string;
  maxResults?: number;
}

function escapeAppleScript(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
}

function searchWeb(args: SearchArgs): {
  success: boolean;
  results?: string[];
  error?: string;
} {
  try {
    const escapedQuery = escapeAppleScript(args.query);
    const maxResults = args.maxResults || 10;

    // Use AppleScript to control Safari for web search
    const appleScript = `
      tell application "Safari"
        activate
        if count of windows is 0 then make new window
        set newTab to make new tab at end of tabs of window 1
        set URL of newTab to "https://duckduckgo.com/?q=${escapedQuery}&ia=web"
        delay 4
        set searchResults to do JavaScript "
          (function() {
            var results = [];
            var items = document.querySelectorAll('article[data-testid=\\"result\\"]');
            var limit = Math.min(items.length, ${maxResults});
            for (var i = 0; i < limit; i++) {
              var item = items[i];
              var titleEl = item.querySelector('h2 a');
              var title = titleEl ? titleEl.textContent.trim() : '';
              var url = titleEl ? titleEl.href : '';
              var snippetEl = item.querySelector('[data-testid=\\"result-snippet\\"]');
              var snippet = snippetEl ? snippetEl.textContent.trim() : '';
              if (title && url) {
                results.push({ title: title, url: url, snippet: snippet });
              }
            }
            return JSON.stringify(results);
          })()
        " in newTab
        close newTab
        return searchResults
      end tell
    `;

    const singleLineScript = appleScript
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ');

    const result = execSync(`osascript -e '${singleLineScript}'`, {
      encoding: 'utf-8',
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    });

    const results = JSON.parse(result.trim());
    const formattedResults = results.map(
      (r: { title: string; url: string; snippet: string }) =>
        `Title: ${r.title}\nURL: ${r.url}\nSnippet: ${r.snippet || 'No snippet'}`,
    );

    return { success: true, results: formattedResults };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, error: errorMsg };
  }
}

async function main(): Promise<void> {
  const server = new Server(
    { name: 'web-search', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'web_search',
        description:
          'Search the web using Safari browser on macOS. Returns search results from DuckDuckGo.',
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

      const result = searchWeb(searchArgs);

      if (result.success && result.results) {
        return {
          content: [{ type: 'text', text: result.results.join('\n\n') }],
        };
      } else {
        return {
          content: [{ type: 'text', text: `Search failed: ${result.error}` }],
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
