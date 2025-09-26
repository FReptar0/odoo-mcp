# Odoo MCP Server

A Model Context Protocol (MCP) server that connects to Odoo v18 databases via XML-RPC to extract sales information for LLM interactions.

## Features

- :electric_plug: **XML-RPC Connection**: Direct connection to Odoo v18 via XML-RPC API
- :bar_chart: **Sales Data Extraction**: Extract sales orders with flexible domain filtering
- :mag: **Advanced Filtering**: Support for custom Odoo domain filters
- :chart_with_upwards_trend: **Sales Analytics**: Get sales statistics and summaries
- :white_check_mark: **Data Validation**: Comprehensive input validation using Zod
- :mag: **MCP Inspector**: Built-in testing support

## Tools Available

### 1. `get_sales_orders`

Extract sales orders from Odoo with optional filtering.

**Parameters:**

- `domain` (optional): Odoo domain filter as JSON string
- `limit` (optional): Maximum records to return (default: 100)
- `offset` (optional): Records to skip (default: 0)
- `fields` (optional): Comma-separated list of fields

**Default behavior**: Returns confirmed sales orders only (`state = 'sale'`)

### 2. `get_sales_order_details`

Get detailed information for a specific sales order.

**Parameters:**

- `order_id` (required): Sales order ID
- `include_lines` (optional): Include order lines (default: true)

### 3. `get_sales_stats`

Get sales statistics and summaries.

**Parameters:**

- `date_from` (optional): Start date (YYYY-MM-DD)
- `date_to` (optional): End date (YYYY-MM-DD)
- `group_by` (optional): Group by field (user_id, team_id, state, partner_id)

## Setup

### 1. Clone and Install Dependencies

```bash
git clone [repository-url]
cd odoo-mcp
npm install
```

### 2. Configure Environment

Copy the environment template and fill in your Odoo credentials:

```bash
cp .env.example .env
```

Edit `.env`:

```bash
ODOO_URL=<https://your-odoo-instance.com>
ODOO_DATABASE=your_database_name
ODOO_USERNAME=your_username
ODOO_API_KEY=your_api_key
```

**Note**: API keys are more secure than passwords. Generate an API key in Odoo:

1. Go to Settings > Users & Companies > Users
2. Select your user
3. Go to API Keys tab
4. Generate a new API key

### 3. Build the Project

```bash
npm run build
```

## Usage

### Development Mode

Run the server in development mode with hot reload:

```bash
npm run dev
```

### Production Mode

Build and run the compiled server:

```bash
npm run build
npm start
```

### Testing with MCP Inspector

Use the MCP Inspector to test your server before integrating with Claude:

```bash
npm run inspector
```

This will launch the MCP Inspector where you can:

1. Test tool calls
2. Inspect responses
3. Debug connection issues

## Integration with Claude

Add this server to your Claude configuration:

```json
{
  "mcpServers": {
    "odoo-sales": {
      "command": "node",
      "args": ["/path/to/odoo-mcp/dist/server.js"],
      "env": {
        "ODOO_URL": "<https://your-odoo-instance.com>",
        "ODOO_DATABASE": "your_database_name",
        "ODOO_USERNAME": "your_username",
        "ODOO_API_KEY": "your_api_key"
      }
    }
  }
}
```

## Example Usage

### Basic Sales Orders Query

```text
Get all confirmed sales orders from this month
```

### Custom Domain Filter

```text
Get sales orders for customer "John Smith" that are in draft state
```

The LLM will automatically construct the appropriate domain filter:

```json
[["partner_id", "ilike", "John Smith"], ["state", "=", "draft"]]
```

### Sales Statistics

```text
Show me sales statistics for the last quarter grouped by salesperson
```

## Project Structure

```text
odoo-mcp/
├── src/
│   ├── clients/
│   │   └── odoo-client.ts     # XML-RPC client for Odoo
│   ├── tools/
│   │   └── sales-orders.ts    # Sales order tools implementation
│   ├── types/
│   │   └── odoo.ts            # TypeScript interfaces
│   └── server.ts              # Main MCP server
├── dist/                      # Compiled JavaScript
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## Requirements

- **Node.js**: 18+
- **Odoo**: v18 (may work with older versions)
- **XML-RPC Access**: Odoo instance must allow XML-RPC connections

## Error Handling

The server includes comprehensive error handling for:

- Invalid Odoo credentials
- Network connection issues
- Invalid domain filters
- Missing required parameters
- Zod validation errors
- **XML-RPC vs HTML response detection**
- **Automatic URL correction suggestions**
- **Detailed diagnostic information**

### Enhanced Diagnostics

When connection issues occur, the server now provides:

1. **HTTP Endpoint Testing**: Verifies if the endpoint is reachable
2. **Content-Type Validation**: Detects if server returns HTML instead of XML-RPC
3. **URL Suggestions**: Provides corrected URLs for common configuration mistakes
4. **Specific Error Guidance**: Explains what each error means and how to fix it

#### Example Error Output

```text
Server returned HTML instead of XML-RPC response (found <TITLE> tag).

Endpoint returns Content-Type: text/html

This suggests:
1. URL might be pointing to Odoo web interface instead of XML-RPC endpoint
2. XML-RPC might be disabled on this Odoo instance
3. Authentication might be required at web server level
4. Wrong port or path

Try these URLs in your .env file:
1. ODOO_URL=https://your-domain.com:8069
2. ODOO_URL=https://your-domain.com/odoo
3. ODOO_URL=https://your-domain.com/web
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Author

FReptar0
