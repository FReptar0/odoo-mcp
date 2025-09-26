import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { OdooClient } from '../clients/odoo-client.js';
import { SaleOrder, SaleOrderLine } from '../types/odoo.js';

export const getSalesOrdersTool: Tool = {
  name: 'get_sales_orders',
  description: 'Extract sales orders from Odoo database with optional domain filtering. By default, returns confirmed sales orders only.',
  inputSchema: {
    type: 'object',
    properties: {
      domain: {
        type: 'string',
        description: 'Optional Odoo domain filter as JSON string. Example: "[[\\"state\\", \\"=\\", \\"sale\\"], [\\"date_order\\", \\">=\\", \\"2024-01-01\\"]]". If not provided, defaults to confirmed sales orders only.',
        default: '[["state", "=", "sale"]]'
      },
      limit: {
        type: 'number',
        description: 'Maximum number of records to return (default: 100)',
        default: 100,
        minimum: 1,
        maximum: 1000
      },
      offset: {
        type: 'number',
        description: 'Number of records to skip (default: 0)',
        default: 0,
        minimum: 0
      },
      fields: {
        type: 'string',
        description: 'Comma-separated list of fields to include. If not provided, returns all standard fields.',
        default: 'id,name,partner_id,date_order,state,amount_untaxed,amount_tax,amount_total,currency_id,user_id,team_id,invoice_status,delivery_status'
      }
    }
  }
};

export const getSalesOrderDetailsTool: Tool = {
  name: 'get_sales_order_details',
  description: 'Get detailed information for a specific sales order including order lines',
  inputSchema: {
    type: 'object',
    properties: {
      order_id: {
        type: 'number',
        description: 'The ID of the sales order to retrieve details for',
        minimum: 1
      },
      include_lines: {
        type: 'boolean',
        description: 'Whether to include order lines details (default: true)',
        default: true
      }
    },
    required: ['order_id']
  }
};

export const getSalesStatsTool: Tool = {
  name: 'get_sales_stats',
  description: 'Get sales statistics and summaries from Odoo database',
  inputSchema: {
    type: 'object',
    properties: {
      date_from: {
        type: 'string',
        description: 'Start date for statistics (YYYY-MM-DD format)',
        pattern: '^\\d{4}-\\d{2}-\\d{2}$'
      },
      date_to: {
        type: 'string',
        description: 'End date for statistics (YYYY-MM-DD format)',
        pattern: '^\\d{4}-\\d{2}-\\d{2}$'
      },
      group_by: {
        type: 'string',
        description: 'Field to group statistics by (e.g., "user_id", "team_id", "state")',
        enum: ['user_id', 'team_id', 'state', 'partner_id']
      }
    }
  }
};

export async function handleGetSalesOrders(
  client: OdooClient,
  args: any
): Promise<string> {
  try {
    const domain = args.domain ? JSON.parse(args.domain) : [['state', '=', 'sale']];
    const limit = args.limit || 100;
    const offset = args.offset || 0;
    const fields = args.fields ? args.fields.split(',').map((f: string) => f.trim()) : [
      'id', 'name', 'partner_id', 'date_order', 'state', 'amount_untaxed',
      'amount_tax', 'amount_total', 'currency_id', 'user_id', 'team_id',
      'invoice_status', 'delivery_status'
    ];

    const result = await client.searchRead<SaleOrder>('sale.order', {
      domain,
      fields,
      limit,
      offset,
      order: 'date_order desc'
    });

    if (!result.success) {
      return `Error retrieving sales orders: ${result.error}`;
    }

    const orders = result.data || [];
    const totalAmount = orders.reduce((sum: number, order: SaleOrder) => sum + (order.amount_total || 0), 0);

    return JSON.stringify({
      summary: {
        total_orders: orders.length,
        total_amount: totalAmount,
        currency: orders[0]?.currency_id?.[1] || 'Unknown'
      },
      orders: orders.map((order: SaleOrder) => ({
        id: order.id,
        name: order.name,
        customer: order.partner_id?.[1] || 'Unknown',
        date_order: order.date_order,
        state: order.state,
        amount_total: order.amount_total,
        salesperson: order.user_id?.[1] || 'Unknown',
        sales_team: order.team_id?.[1] || 'Unknown',
        invoice_status: order.invoice_status,
        delivery_status: order.delivery_status
      }))
    }, null, 2);
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`;
  }
}

export async function handleGetSalesOrderDetails(
  client: OdooClient,
  args: any
): Promise<string> {
  try {
    const orderId = args.order_id;
    const includeLines = args.include_lines !== false;

    const orderResult = await client.searchRead<SaleOrder>('sale.order', {
      domain: [['id', '=', orderId]],
      limit: 1
    });

    if (!orderResult.success) {
      return `Error retrieving sales order: ${orderResult.error}`;
    }

    if (!orderResult.data || orderResult.data.length === 0) {
      return `Sales order with ID ${orderId} not found`;
    }

    const order = orderResult.data[0];
    const response: any = {
      order: {
        id: order.id,
        name: order.name,
        customer: order.partner_id?.[1] || 'Unknown',
        date_order: order.date_order,
        state: order.state,
        amount_untaxed: order.amount_untaxed,
        amount_tax: order.amount_tax,
        amount_total: order.amount_total,
        currency: order.currency_id?.[1] || 'Unknown',
        salesperson: order.user_id?.[1] || 'Unknown',
        sales_team: order.team_id?.[1] || 'Unknown',
        invoice_status: order.invoice_status,
        delivery_status: order.delivery_status,
        create_date: order.create_date,
        write_date: order.write_date
      }
    };

    if (includeLines && order.order_line && order.order_line.length > 0) {
      const linesResult = await client.searchRead<SaleOrderLine>('sale.order.line', {
        domain: [['id', 'in', order.order_line]],
        fields: ['id', 'product_id', 'name', 'product_uom_qty', 'qty_delivered', 'qty_invoiced', 'price_unit', 'price_subtotal', 'price_total', 'discount']
      });

      if (linesResult.success) {
        response.order_lines = linesResult.data?.map((line: SaleOrderLine) => ({
          id: line.id,
          product: line.product_id?.[1] || 'Unknown',
          description: line.name,
          quantity: line.product_uom_qty,
          delivered: line.qty_delivered,
          invoiced: line.qty_invoiced,
          unit_price: line.price_unit,
          subtotal: line.price_subtotal,
          total: line.price_total,
          discount: line.discount
        })) || [];
      }
    }

    return JSON.stringify(response, null, 2);
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`;
  }
}

export async function handleGetSalesStats(
  client: OdooClient,
  args: any
): Promise<string> {
  try {
    let domain = [['state', '=', 'sale']];

    if (args.date_from) {
      domain.push(['date_order', '>=', args.date_from]);
    }
    if (args.date_to) {
      domain.push(['date_order', '<=', args.date_to]);
    }

    const ordersResult = await client.searchRead<SaleOrder>('sale.order', {
      domain,
      fields: ['id', 'name', 'partner_id', 'date_order', 'amount_total', 'user_id', 'team_id', 'state']
    });

    if (!ordersResult.success) {
      return `Error retrieving sales statistics: ${ordersResult.error}`;
    }

    const orders = ordersResult.data || [];
    const totalAmount = orders.reduce((sum: number, order: SaleOrder) => sum + (order.amount_total || 0), 0);
    const averageAmount = orders.length > 0 ? totalAmount / orders.length : 0;

    const stats: any = {
      summary: {
        total_orders: orders.length,
        total_amount: totalAmount,
        average_order_value: averageAmount,
        date_range: {
          from: args.date_from || 'All time',
          to: args.date_to || 'All time'
        }
      }
    };

    if (args.group_by && orders.length > 0) {
      const grouped = orders.reduce((acc: Record<string, { count: number; total_amount: number }>, order: SaleOrder) => {
        const key = order[args.group_by as keyof SaleOrder];
        const groupKey = Array.isArray(key) ? key[1] : key?.toString() || 'Unknown';

        if (!acc[groupKey]) {
          acc[groupKey] = { count: 0, total_amount: 0 };
        }
        acc[groupKey].count++;
        acc[groupKey].total_amount += order.amount_total || 0;
        return acc;
      }, {} as Record<string, { count: number; total_amount: number }>);

      stats.grouped_by = args.group_by;
      stats.groups = Object.entries(grouped).map(([key, value]: [string, { count: number; total_amount: number }]) => ({
        name: key,
        order_count: value.count,
        total_amount: value.total_amount,
        average_amount: value.total_amount / value.count
      }));
    }

    return JSON.stringify(stats, null, 2);
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`;
  }
}