/**
 * Email Notification MCP Server
 * Sends emails via shell sendmail command
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { execSync } from 'child_process';

interface EmailToolArgs {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
}

function createEmailContent(args: EmailToolArgs): string {
  const lines: string[] = [];

  lines.push(`To: ${args.to}`);
  lines.push(`Subject: ${args.subject}`);

  if (args.cc) {
    lines.push(`Cc: ${args.cc}`);
  }

  lines.push('');
  lines.push(args.body);

  return lines.join('\n');
}

function sendEmail(args: EmailToolArgs): { success: boolean; error?: string } {
  try {
    const content = createEmailContent(args);

    // Use sendmail to send the email
    const sendmail = execSync('/usr/sbin/sendmail -t', {
      input: content,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return { success: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, error: errorMsg };
  }
}

async function main(): Promise<void> {
  const server = new Server(
    { name: 'email-notification', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'send_email',
        description: 'Send an email notification via sendmail. Use this to notify the user of important events, alerts, or summaries.',
        inputSchema: {
          type: 'object',
          properties: {
            to: {
              type: 'string',
              description: 'Recipient email address',
            },
            subject: {
              type: 'string',
              description: 'Email subject line',
            },
            body: {
              type: 'string',
              description: 'Email body content',
            },
            cc: {
              type: 'string',
              description: 'CC recipient (optional)',
            },
            bcc: {
              type: 'string',
              description: 'BCC recipient (optional)',
            },
          },
          required: ['to', 'subject', 'body'],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === 'send_email') {
      const params = args as Record<string, unknown> | undefined;
      const emailArgs: EmailToolArgs = {
        to: String(params?.to ?? ''),
        subject: String(params?.subject ?? ''),
        body: String(params?.body ?? ''),
        cc: params?.cc ? String(params.cc) : undefined,
        bcc: params?.bcc ? String(params.bcc) : undefined,
      };

      if (!emailArgs.to || !emailArgs.subject || !emailArgs.body) {
        return {
          content: [{ type: 'text', text: 'Missing required fields: to, subject, body' }],
          isError: true,
        };
      }

      const result = sendEmail(emailArgs);

      if (result.success) {
        return {
          content: [{ type: 'text', text: `Email sent successfully to ${emailArgs.to}` }],
        };
      } else {
        return {
          content: [{ type: 'text', text: `Failed to send email: ${result.error}` }],
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
