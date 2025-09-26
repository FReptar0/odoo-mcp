export interface OdooConfig {
  url: string;
  database: string;
  username: string;
  password: string;
}

export interface SaleOrder {
  id: number;
  name: string;
  partner_id: [number, string];
  date_order: string;
  state: 'draft' | 'sent' | 'sale' | 'done' | 'cancel';
  amount_untaxed: number;
  amount_tax: number;
  amount_total: number;
  currency_id: [number, string];
  user_id: [number, string];
  team_id: [number, string];
  order_line: number[];
  create_date: string;
  write_date: string;
  commitment_date?: string;
  validity_date?: string;
  invoice_status: 'upselling' | 'invoiced' | 'to invoice' | 'no';
  delivery_status: 'pending' | 'partial' | 'full' | 'cancelled';
}

export interface SaleOrderLine {
  id: number;
  order_id: [number, string];
  product_id: [number, string];
  name: string;
  product_uom_qty: number;
  qty_delivered: number;
  qty_invoiced: number;
  price_unit: number;
  price_subtotal: number;
  price_total: number;
  discount: number;
  product_uom: [number, string];
}

export interface OdooSearchParams {
  domain?: any[];
  fields?: string[];
  limit?: number;
  offset?: number;
  order?: string;
}

export interface OdooResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}