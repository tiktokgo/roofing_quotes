"use client";

import type { Quote } from "@/lib/quoteSchema";

interface Props {
  quote: Partial<Quote>;
}

const fmt = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export default function QuotePanel({ quote }: Props) {
  const hasItems = (quote.items?.length ?? 0) > 0;
  const hasClient =
    quote.client?.name || quote.client?.address || quote.client?.phone || quote.client?.email;
  const isEmpty = !quote.title && !hasItems && !hasClient && quote.total === undefined;

  if (isEmpty) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-8 py-12">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <svg className="w-7 h-7" viewBox="0 0 20 20" fill="rgba(255,255,255,0.2)">
            <path
              fillRule="evenodd"
              d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <p className="text-sm font-medium mb-1" style={{ color: "rgba(255,255,255,0.25)" }}>
          Quote will appear here
        </p>
        <p className="text-xs" style={{ color: "rgba(255,255,255,0.14)" }}>
          Describe the job in the chat to generate a draft
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4 text-sm">
      {/* Title + status */}
      {quote.title && (
        <div>
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide"
              style={{
                background: "rgba(124,58,237,0.2)",
                color: "#a78bfa",
                border: "1px solid rgba(124,58,237,0.3)",
              }}
            >
              {quote.status ?? "draft"}
            </span>
            {quote.date && (
              <span className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
                {quote.date}
              </span>
            )}
          </div>
          <h2 className="font-semibold text-white leading-snug">{quote.title}</h2>
        </div>
      )}

      {/* Client info */}
      {hasClient && (
        <div
          className="rounded-xl px-4 py-3 space-y-1.5 text-xs"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          {quote.client?.name && (
            <div className="flex gap-3">
              <span className="flex-shrink-0" style={{ color: "rgba(255,255,255,0.35)", width: "52px" }}>
                Client
              </span>
              <span className="text-white font-medium">{quote.client.name}</span>
            </div>
          )}
          {quote.client?.address && (
            <div className="flex gap-3">
              <span className="flex-shrink-0" style={{ color: "rgba(255,255,255,0.35)", width: "52px" }}>
                Address
              </span>
              <span style={{ color: "rgba(255,255,255,0.8)" }}>{quote.client.address}</span>
            </div>
          )}
          {quote.client?.phone && (
            <div className="flex gap-3">
              <span className="flex-shrink-0" style={{ color: "rgba(255,255,255,0.35)", width: "52px" }}>
                Phone
              </span>
              <span style={{ color: "rgba(255,255,255,0.8)" }}>{quote.client.phone}</span>
            </div>
          )}
          {quote.client?.email && (
            <div className="flex gap-3">
              <span className="flex-shrink-0" style={{ color: "rgba(255,255,255,0.35)", width: "52px" }}>
                Email
              </span>
              <span style={{ color: "rgba(255,255,255,0.8)" }}>{quote.client.email}</span>
            </div>
          )}
        </div>
      )}

      {/* Line items */}
      {hasItems && (
        <div>
          <div
            className="text-xs font-semibold uppercase tracking-widest mb-2"
            style={{ color: "rgba(255,255,255,0.3)" }}
          >
            Line Items
          </div>
          <div className="space-y-1.5">
            {quote.items!.map((item, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-lg px-3 py-2.5"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.055)",
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-white leading-tight">{item.name}</div>
                  {item.description && (
                    <div
                      className="text-xs mt-0.5 leading-relaxed"
                      style={{ color: "rgba(255,255,255,0.38)" }}
                    >
                      {item.description}
                    </div>
                  )}
                  {item.quantity != null && item.unit && (
                    <div className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.28)" }}>
                      {item.quantity} {item.unit}
                      {item.unit_price ? ` × ${fmt(item.unit_price)}` : ""}
                    </div>
                  )}
                </div>
                {item.total != null && item.total > 0 && (
                  <div className="text-xs font-semibold text-white flex-shrink-0 pt-0.5">
                    {fmt(item.total)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Totals */}
      {(quote.subtotal !== undefined || quote.total !== undefined) && (
        <div
          className="rounded-xl px-4 py-3 space-y-1.5 text-xs"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.09)",
          }}
        >
          {quote.subtotal !== undefined && quote.subtotal !== quote.total && (
            <div className="flex justify-between" style={{ color: "rgba(255,255,255,0.5)" }}>
              <span>Subtotal</span>
              <span>{fmt(quote.subtotal)}</span>
            </div>
          )}
          {quote.tax != null && quote.tax > 0 && (
            <div className="flex justify-between" style={{ color: "rgba(255,255,255,0.5)" }}>
              <span>Tax {quote.tax_rate ? `(${(quote.tax_rate * 100).toFixed(0)}%)` : ""}</span>
              <span>{fmt(quote.tax)}</span>
            </div>
          )}
          {quote.total !== undefined && (
            <div
              className="flex justify-between font-bold text-white pt-2 text-sm"
              style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}
            >
              <span>Total</span>
              <span>{fmt(quote.total)}</span>
            </div>
          )}
        </div>
      )}

      {/* Warranty */}
      {quote.warranty && (
        <div
          className="rounded-xl px-4 py-3"
          style={{
            background: "rgba(52,211,153,0.05)",
            border: "1px solid rgba(52,211,153,0.15)",
          }}
        >
          <div
            className="text-xs font-semibold uppercase tracking-widest mb-1.5"
            style={{ color: "#34d399" }}
          >
            Warranty
          </div>
          <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
            {quote.warranty}
          </p>
        </div>
      )}

      {/* Terms */}
      {quote.terms && (
        <div
          className="rounded-xl px-4 py-3"
          style={{
            background: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <div
            className="text-xs font-semibold uppercase tracking-widest mb-1.5"
            style={{ color: "rgba(255,255,255,0.3)" }}
          >
            Terms
          </div>
          <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
            {quote.terms}
          </p>
        </div>
      )}

      {/* Comments */}
      {quote.comments && (
        <div
          className="rounded-xl px-4 py-3"
          style={{
            background: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <div
            className="text-xs font-semibold uppercase tracking-widest mb-1.5"
            style={{ color: "rgba(255,255,255,0.3)" }}
          >
            Notes
          </div>
          <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
            {quote.comments}
          </p>
        </div>
      )}

      <div className="h-4" />
    </div>
  );
}
