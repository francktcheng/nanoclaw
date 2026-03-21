/**
 * Email Notification MCP Server
 * Sends emails via Gmail SMTP
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createTransport, TransportOptions } from 'nodemailer';

interface EmailToolArgs {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
}

function sendEmail(args: EmailToolArgs): { success: boolean; error?: string } {
  try {
    const transporter = createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASSWORD,
      },
    } as TransportOptions);

    transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: args.to,
      subject: args.subject,
      text: args.body,
      cc: args.cc,
      bcc: args.bcc,
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
        description: 'Send an email notification via Gmail SMTP. Use this to notify the user of important events, alerts, or summaries.',
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
