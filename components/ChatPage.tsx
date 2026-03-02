"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { AIContext } from "@/lib/verifyToken";
import type { Quote, PartialQuote } from "@/lib/quoteSchema";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  quoteUpdated?: boolean;
}

interface Props {
  aiContext: AIContext;
}

const WELCOME_MESSAGE =
  "Hi! I'm your roofing quote assistant. Tell me about the job — material, scope, address, or anything you have — and I'll generate a quote draft right away.";

export default function ChatPage({ aiContext }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: WELCOME_MESSAGE },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [currentQuote, setCurrentQuote] = useState<Partial<Quote>>({});
  const [quoteUpdateCount, setQuoteUpdateCount] = useState(0);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const mergeQuote = useCallback(
    (update: PartialQuote): void => {
      setCurrentQuote((prev) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { items: updateItems, ...updateRest } = update;
        const merged: Partial<Quote> = {
          ...prev,
          ...(updateRest as Partial<Quote>),
          client: { ...prev.client, ...update.client },
          date: update.date ?? prev.date ?? new Date().toISOString().split("T")[0],
          status: update.status ?? prev.status ?? "draft",
        };
        if (updateItems && updateItems.length > 0) {
          merged.items = updateItems as Quote["items"];
        }
        return merged;
      });
      setQuoteUpdateCount((n) => n + 1);
    },
    []
  );

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const allMessages = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: allMessages,
          aiContext,
          currentQuote,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let hasQuoteUpdate = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          let event: { type: string; content?: string; quote?: PartialQuote; message?: string };
          try {
            event = JSON.parse(raw);
          } catch {
            continue;
          }

          if (event.type === "text" && event.content) {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role === "assistant") {
                updated[updated.length - 1] = {
                  ...last,
                  content: last.content + event.content,
                };
              }
              return updated;
            });
          } else if (event.type === "quote_update" && event.quote) {
            mergeQuote(event.quote);
            hasQuoteUpdate = true;
          } else if (event.type === "done") {
            if (hasQuoteUpdate) {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === "assistant") {
                  updated[updated.length - 1] = { ...last, quoteUpdated: true };
                }
                return updated;
              });
            }
          } else if (event.type === "error") {
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: "assistant",
                content: `Sorry, something went wrong: ${event.message}`,
              };
              return updated;
            });
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: `Connection error: ${msg}`,
        };
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, aiContext, currentQuote, mergeQuote]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/parse-pdf", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Failed to parse PDF");
      const { text } = await res.json() as { text: string };

      // Send the extracted quote text directly as a user message
      const userMsg: ChatMessage = {
        role: "user",
        content: `Here is an existing roofing quote I want you to review and improve:\n\n${text.slice(0, 8000)}`,
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      const allMessages = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));
      const res2 = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: allMessages, aiContext, currentQuote }),
      });
      if (!res2.ok || !res2.body) throw new Error(`HTTP ${res2.status}`);

      const reader = res2.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let hasQuoteUpdate = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          let event: { type: string; content?: string; quote?: PartialQuote; message?: string };
          try { event = JSON.parse(raw); } catch { continue; }
          if (event.type === "text" && event.content) {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role === "assistant") updated[updated.length - 1] = { ...last, content: last.content + event.content };
              return updated;
            });
          } else if (event.type === "quote_update" && event.quote) {
            mergeQuote(event.quote);
            hasQuoteUpdate = true;
          } else if (event.type === "done" && hasQuoteUpdate) {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role === "assistant") updated[updated.length - 1] = { ...last, quoteUpdated: true };
              return updated;
            });
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: `Error reading PDF: ${msg}` };
        return updated;
      });
    } finally {
      setIsUploading(false);
      setIsLoading(false);
    }
  }, [messages, aiContext, currentQuote, mergeQuote]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }, [input]);

  return (
    <div
      className="flex flex-col h-screen"
      style={{ background: "linear-gradient(160deg, #0a0f1e 0%, #0f0a1e 50%, #0a1628 100%)" }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
        style={{
          background: "rgba(255,255,255,0.04)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {/* AI avatar with gradient glow */}
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
          style={{
            background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
            boxShadow: "0 0 16px rgba(124,58,237,0.5)",
          }}
        >
          ✦
        </div>
        <div>
          <div className="font-semibold text-white text-sm leading-tight">
            {aiContext.company_name}
          </div>
          <div className="text-xs flex items-center gap-1.5" style={{ color: "rgba(255,255,255,0.45)" }}>
            <span
              className="w-1.5 h-1.5 rounded-full inline-block"
              style={{ background: "#34d399", boxShadow: "0 0 6px #34d399" }}
            />
            AI Quote Assistant
          </div>
        </div>
        {quoteUpdateCount > 0 && (
          <div
            className="ml-auto text-xs font-medium px-2.5 py-1 rounded-full"
            style={{
              background: "rgba(52,211,153,0.12)",
              border: "1px solid rgba(52,211,153,0.3)",
              color: "#34d399",
            }}
          >
            Draft updated {quoteUpdateCount}×
          </div>
        )}
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {/* AI avatar beside message */}
            {msg.role === "assistant" && (
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold mr-2.5 flex-shrink-0 mt-1"
                style={{
                  background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
                  boxShadow: "0 0 10px rgba(124,58,237,0.4)",
                }}
              >
                ✦
              </div>
            )}

            <div
              className="max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap"
              style={
                msg.role === "user"
                  ? {
                      background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
                      color: "#fff",
                      borderBottomRightRadius: "4px",
                      boxShadow: "0 4px 20px rgba(124,58,237,0.3)",
                    }
                  : {
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      color: "rgba(255,255,255,0.88)",
                      borderBottomLeftRadius: "4px",
                    }
              }
            >
              {msg.content}

              {/* Typing dots */}
              {msg.role === "assistant" && i === messages.length - 1 && isLoading && !msg.content && (
                <span className="inline-flex gap-1 items-center">
                  <span
                    className="w-1.5 h-1.5 rounded-full animate-bounce"
                    style={{ background: "#7c3aed", animationDelay: "0ms" }}
                  />
                  <span
                    className="w-1.5 h-1.5 rounded-full animate-bounce"
                    style={{ background: "#7c3aed", animationDelay: "150ms" }}
                  />
                  <span
                    className="w-1.5 h-1.5 rounded-full animate-bounce"
                    style={{ background: "#7c3aed", animationDelay: "300ms" }}
                  />
                </span>
              )}

              {/* Quote updated badge */}
              {msg.quoteUpdated && (
                <div
                  className="mt-2 text-xs font-medium inline-flex items-center gap-1 px-2 py-0.5 rounded-full"
                  style={{
                    background: "rgba(52,211,153,0.12)",
                    border: "1px solid rgba(52,211,153,0.25)",
                    color: "#34d399",
                  }}
                >
                  ✓ Draft updated
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div
        className="flex-shrink-0 px-4 py-3"
        style={{
          background: "rgba(255,255,255,0.03)",
          backdropFilter: "blur(12px)",
          borderTop: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        <div
          className="flex items-end gap-2 rounded-2xl px-4 py-2.5"
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          {/* Hidden PDF file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={handleFileUpload}
          />

          {/* Upload button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || isUploading}
            title="Improve current quote from PDF"
            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}
          >
            {isUploading ? (
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="rgba(255,255,255,0.6)">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            )}
          </button>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe the job, materials, address…"
            rows={1}
            disabled={isLoading}
            className="flex-1 bg-transparent text-sm resize-none outline-none min-h-[24px] max-h-[120px] leading-6 disabled:opacity-40"
            style={{ color: "rgba(255,255,255,0.9)" }}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
              boxShadow: input.trim() ? "0 0 14px rgba(124,58,237,0.5)" : "none",
            }}
            aria-label="Send"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-white">
              <path d="M3.105 2.288a.75.75 0 00-.826.95l1.903 6.114h9.568l-1.52 1.52a.75.75 0 001.06 1.06l3-3a.75.75 0 000-1.06l-3-3a.75.75 0 10-1.06 1.06l1.52 1.52H5.182l-1.38-4.428a.75.75 0 00-.697-.536z" />
            </svg>
          </button>
        </div>
        <p className="text-center text-xs mt-1.5" style={{ color: "rgba(255,255,255,0.25)" }}>
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
