export interface QuoteItem {
  description: string;
  quantity: number;
  unit: string;       // e.g. "sq ft", "job", "sheet", "linear ft", "each"
  unit_price: number;
  total: number;
}

export interface Quote {
  title: string;
  date: string;           // ISO date string e.g. "2026-03-01"
  client: {
    name?: string;
    address?: string;
    phone?: string;
    email?: string;
  };
  // company display data lives in Bubble — not sent from the AI
  scope: string;
  items: QuoteItem[];
  subtotal: number;
  tax_rate: number;       // e.g. 0.07 for 7%
  tax: number;
  total: number;
  warranty: string;
  terms: string;
  comments: string;
  status: "draft" | "complete";
}

export type PartialQuote = Partial<Omit<Quote, "client" | "items">> & {
  client?: Partial<Quote["client"]>;
  items?: Partial<QuoteItem>[];
};
