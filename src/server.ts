#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import * as dotenv from 'dotenv';
import { OdooClient } from './clients/odoo-client.js';
import { OdooConfig } from './types/odoo.js';
import {
  getSalesOrdersTool,
  getSalesOrderDetailsTool,
  getSalesStatsTool,
  handleGetSalesOrders,
  handleGetSalesOrderDetails,
  handleGetSalesStats
} from './tools/sales-orders.js';

dotenv.config();

const ConfigSchema = z.object({
  ODOO_URL: z.string().url('Invalid Odoo URL').optional(),
  ODOO_DATABASE: z.string().min(1, 'Database name is required').optional(),
  ODOO_USERNAME: z.string().min(1, 'Username is required').optional(),
  ODOO_API_KEY: z.string().min(1, 'Password is required').optional(),
  // New format
  ODOO_HOST: z.string().url('Invalid Odoo host').optional(),
  ODOO_DB: z.string().min(1, 'Database name is required').optional(),
  ODOO_USER: z.string().min(1, 'Username is required').optional(),
  ODOO_PASS: z.string().min(1, 'Password is required').optional()
});

function validateConfig(): OdooConfig {
  try {
    const config = ConfigSchema.parse({
      ODOO_URL: process.env.ODOO_URL,
      ODOO_DATABASE: process.env.ODOO_DATABASE,
      ODOO_USERNAME: process.env.ODOO_USERNAME,
      ODOO_API_KEY: process.env.ODOO_API_KEY,
      ODOO_HOST: process.env.ODOO_HOST,
      ODOO_DB: process.env.ODOO_DB,
      ODOO_USER: process.env.ODOO_USER,
      ODOO_PASS: process.env.ODOO_PASS
    });

    // Use new format first, fallback to old format
    const url = config.ODOO_HOST || config.ODOO_URL;
    const database = config.ODOO_DB || config.ODOO_DATABASE;
    const username = config.ODOO_USER || config.ODOO_USERNAME;
    const password = config.ODOO_PASS || config.ODOO_API_KEY;

    if (!url || !database || !username || !password) {
      throw new Error('Missing required configuration. Provide either ODOO_HOST/ODOO_DB/ODOO_USER/ODOO_PASS or ODOO_URL/ODOO_DATABASE/ODOO_USERNAME/ODOO_API_KEY');
    }

    // Clean URL (remove path components like /start)
    try {
      const urlObj = new URL(url);
      const cleanUrl = `${urlObj.protocol}//${urlObj.hostname}${urlObj.port ? ':' + urlObj.port : ''}`;

      return {
        url: cleanUrl,
        database,
        username,
        password
      };
    } catch (error) {
      return {
        url,
        database,
        username,
        password
      };
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
      throw new Error(`Configuration validation failed:\\n${messages.join('\\n')}`);
    }
    throw error;
  }
}

const GetSalesOrdersArgsSchema = z.object({
  domain: z.string().optional(),
  limit: z.number().min(1).max(1000).optional(),
  offset: z.number().min(0).optional(),
  fields: z.string().optional()
});

const GetSalesOrderDetailsArgsSchema = z.object({
  order_id: z.number().min(1),
  include_lines: z.boolean().optional()
});

const GetSalesStatsArgsSchema = z.object({
  date_from: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).optional(),
  date_to: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).optional(),
  group_by: z.enum(['user_id', 'team_id', 'state', 'partner_id']).optional()
});

class OdooMCPServer {
  private server: Server;
  private odooClient: OdooClient;

  constructor() {
    this.server = new Server(
      {
        name: 'odoo-mcp-server',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    const config = validateConfig();
    this.odooClient = new OdooClient(config);

    this.setupToolHandlers();
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        getSalesOrdersTool,
        getSalesOrderDetailsTool,
        getSalesStatsTool
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'get_sales_orders': {
            const validatedArgs = GetSalesOrdersArgsSchema.parse(args);
            const result = await handleGetSalesOrders(this.odooClient, validatedArgs);
            return {
              content: [
                {
                  type: 'text',
                  text: result
                }
              ]
            };
          }

          case 'get_sales_order_details': {
            const validatedArgs = GetSalesOrderDetailsArgsSchema.parse(args);
            const result = await handleGetSalesOrderDetails(this.odooClient, validatedArgs);
            return {
              content: [
                {
                  type: 'text',
                  text: result
                }
              ]
            };
          }

          case 'get_sales_stats': {
            const validatedArgs = GetSalesStatsArgsSchema.parse(args);
            const result = await handleGetSalesStats(this.odooClient, validatedArgs);
            return {
              content: [
                {
                  type: 'text',
                  text: result
                }
              ]
            };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        if (error instanceof z.ZodError) {
          const messages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
          return {
            content: [
              {
                type: 'text',
                text: `Validation error:\\n${messages.join('\\n')}`
              }
            ],
            isError: true
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`
            }
          ],
          isError: true
        };
      }
    });
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Odoo MCP Server running on stdio');
  }
}

async function main(): Promise<void> {
  try {
    const server = new OdooMCPServer();
    await server.run();
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}