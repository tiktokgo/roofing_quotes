"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { AIContext } from "@/lib/verifyToken";
import type { Quote, PartialQuote } from "@/lib/quoteSchema";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  quoteUpdated?: boolean;
  webhookStatus?: { ok: boolean; message: string };
}

interface Props {
  aiContext: AIContext;
}

export default function ChatPage({ aiContext }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [currentQuote, setCurrentQuote] = useState<Partial<Quote>>({});
  const [quoteUpdateCount, setQuoteUpdateCount] = useState(0);
  // Context prepended to the user's next message (set by quick-action chips)
  const [pendingContext, setPendingContext] = useState<string | null>(null);
  // Controls transition from landing → chat without a user message
  const [chatStarted, setChatStarted] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const hasUserMessages = messages.some((m) => m.role === "user");
  const isLanding = !chatStarted && !hasUserMessages;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const mergeQuote = useCallback((update: PartialQuote): void => {
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
  }, []);

  const streamChat = useCallback(
    async (allMessages: { role: string; content: string }[]) => {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: allMessages, aiContext, currentQuote }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let hasQuoteUpdate = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          let event: { type: string; content?: string; quote?: PartialQuote; message?: string; ok?: boolean };
          try { event = JSON.parse(raw); } catch { continue; }

          if (event.type === "webhook_status") {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role === "assistant") {
                updated[updated.length - 1] = {
                  ...last,
                  webhookStatus: { ok: event.ok as boolean, message: event.message as string },
                };
              }
              return updated;
            });
          } else if (event.type === "text" && event.content) {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role === "assistant") {
                updated[updated.length - 1] = { ...last, content: last.content + event.content };
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
    },
    [aiContext, currentQuote, mergeQuote]
  );

  const handleSend = useCallback(async (overrideText?: string) => {
    const raw = (overrideText ?? input).trim();
    if (!raw || isLoading) return;
    // Prepend job-type context set by quick-action chips
    const text = pendingContext ? `${pendingContext}: ${raw}` : raw;
    setPendingContext(null);

    const userMsg: ChatMessage = { role: "user", content: raw }; // show only raw text in UI
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      // Use `text` (with context prefix) for API, but `userMsg` (raw) for display
      const apiMessages = [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: text },
      ];
      await streamChat(apiMessages);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: `Connection error: ${msg}` };
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, pendingContext, streamChat]);

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

    // Transition to chat mode immediately and show scanning feedback
    setChatStarted(true);
    const uploadDisplayMsg: ChatMessage = { role: "user", content: `📄 ${file.name}` };
    const scanMsg: ChatMessage = { role: "assistant", content: "Scanning your file…" };
    setMessages([uploadDisplayMsg, scanMsg]);

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/parse-pdf", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Failed to parse PDF");
      const { text } = await res.json() as { text: string };

      // Hidden API message with full PDF content; display message already shown above
      const apiUserMsg = {
        role: "user" as const,
        content: `Here is an existing roofing quote I want you to review and improve:\n\n${text.slice(0, 8000)}`,
      };
      setIsLoading(true);
      // Replace scanning message with empty AI response placeholder (streaming will fill it)
      setMessages((prev) => {
        const withoutScan = prev.filter((m) => m.content !== "Scanning your file…");
        return [...withoutScan, { role: "assistant", content: "" }];
      });

      const allMessages = [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        apiUserMsg,
      ];
      await streamChat(allMessages);
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
  }, [messages, streamChat]);

  const handleVoice = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert("Voice input is not supported in this browser. Please use Chrome or Edge.");
      return;
    }
    if (isRecording) {
      recognitionRef.current?.stop();
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec = new SR() as any;
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.continuous = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript as string;
      setInput((prev) => (prev ? prev + " " + transcript : transcript));
    };
    rec.onend = () => setIsRecording(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      setIsRecording(false);
      if (e.error === "not-allowed" || e.error === "permission-denied") {
        alert("Microphone access was denied. Please allow microphone access in your browser settings and try again.");
      } else if (e.error === "no-speech") {
        // silent — user just didn't speak
      } else {
        console.error("Speech recognition error:", e.error);
      }
    };
    recognitionRef.current = rec;
    try {
      rec.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Failed to start speech recognition:", err);
      alert("Could not start voice recording. If this page is embedded in another site, microphone access may be blocked.");
    }
  }, [isRecording]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }, [input]);

  // ─── Shared input bar ────────────────────────────────────────────────────
  const inputBar = (
    <div
      className="flex items-end gap-2 rounded-2xl px-4 py-2.5"
      style={{
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.12)",
      }}
    >
      <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleFileUpload} />

      {/* Upload button (shown in chat mode only) */}
      {hasUserMessages && (
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
      )}

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

      {/* Mic button */}
      <button
        onClick={handleVoice}
        disabled={isLoading}
        title={isRecording ? "Stop recording" : "Voice input"}
        className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-all disabled:opacity-30 disabled:cursor-not-allowed relative"
        style={{
          background: isRecording ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.08)",
          border: isRecording ? "1px solid rgba(239,68,68,0.5)" : "1px solid rgba(255,255,255,0.12)",
        }}
      >
        {isRecording && (
          <span className="absolute inset-0 rounded-xl animate-ping" style={{ background: "rgba(239,68,68,0.25)" }} />
        )}
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke={isRecording ? "#ef4444" : "rgba(255,255,255,0.7)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 10a7 7 0 0014 0M12 19v3M8 22h8" />
        </svg>
      </button>

      {/* Send button */}
      <button
        onClick={() => handleSend()}
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
  );

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
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
          style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)", boxShadow: "0 0 16px rgba(124,58,237,0.5)" }}
        >
          ✦
        </div>
        <div>
          <div className="font-semibold text-white text-sm leading-tight">{aiContext.company_name}</div>
          <div className="text-xs flex items-center gap-1.5" style={{ color: "rgba(255,255,255,0.45)" }}>
            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: "#34d399", boxShadow: "0 0 6px #34d399" }} />
            AI Quote Assistant
          </div>
        </div>
        {quoteUpdateCount > 0 && (
          <div
            className="ml-auto text-xs font-medium px-2.5 py-1 rounded-full"
            style={{ background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.3)", color: "#34d399" }}
          >
            Draft updated {quoteUpdateCount}×
          </div>
        )}
      </div>

      {/* ── LANDING STATE (no messages yet) ── */}
      {isLanding ? (
        <div className="flex-1 flex flex-col items-center justify-center px-4 pb-8">
          {/* Headline */}
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold text-white mb-1">What&apos;s the job today?</h1>
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>{aiContext.company_name}</p>
          </div>

          {/* Input bar */}
          <div className="w-full max-w-xl mb-4">
            {inputBar}
            <p className="text-center text-xs mt-1.5" style={{ color: "rgba(255,255,255,0.25)" }}>
              Enter to send · Shift+Enter for new line
            </p>
          </div>

          {/* Quick-action chips */}
          <div className="flex flex-wrap gap-2 justify-center">
            {/* New roof */}
            <button
              onClick={() => {
                setChatStarted(true);
                setPendingContext("New roof installation");
                setMessages([{ role: "assistant", content: "What materials are you planning to use? (e.g. GAF Timberline HDZ shingles, metal, tile, flat TPO…)" }]);
              }}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all disabled:opacity-40"
              style={{
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.14)",
                color: "rgba(255,255,255,0.8)",
              }}
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h4a1 1 0 001-1v-3h2v3a1 1 0 001 1h4a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
              </svg>
              New roof
            </button>

            {/* Roof fix */}
            <button
              onClick={() => {
                setChatStarted(true);
                setPendingContext("Roof repair");
                setMessages([{ role: "assistant", content: "What's the issue that needs fixing? (e.g. active leak, damaged shingles, flashing, ponding water…)" }]);
              }}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all disabled:opacity-40"
              style={{
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.14)",
                color: "rgba(255,255,255,0.8)",
              }}
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
              Roof fix
            </button>

            {/* Improve quote (PDF) */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading || isUploading}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all disabled:opacity-40"
              style={{
                background: "rgba(124,58,237,0.15)",
                border: "1px solid rgba(124,58,237,0.35)",
                color: "rgba(167,139,250,0.9)",
              }}
            >
              {isUploading ? (
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                </svg>
              )}
              Improve quote
            </button>

            {/* Voice chip */}
            <button
              onClick={handleVoice}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all disabled:opacity-40 relative"
              style={{
                background: isRecording ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.07)",
                border: isRecording ? "1px solid rgba(239,68,68,0.4)" : "1px solid rgba(255,255,255,0.14)",
                color: isRecording ? "#ef4444" : "rgba(255,255,255,0.8)",
              }}
            >
              {isRecording && <span className="absolute inset-0 rounded-full animate-ping" style={{ background: "rgba(239,68,68,0.2)" }} />}
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="2" width="6" height="12" rx="3" />
                <path d="M5 10a7 7 0 0014 0M12 19v3M8 22h8" />
              </svg>
              {isRecording ? "Listening…" : "Voice"}
            </button>
          </div>
        </div>
      ) : (
        /* ── CHAT STATE ── */
        <>
          {/* Message list */}
          <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold mr-2.5 flex-shrink-0 mt-1"
                    style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)", boxShadow: "0 0 10px rgba(124,58,237,0.4)" }}
                  >
                    ✦
                  </div>
                )}
                <div
                  className="max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap"
                  style={
                    msg.role === "user"
                      ? { background: "linear-gradient(135deg, #7c3aed, #4f46e5)", color: "#fff", borderBottomRightRadius: "4px", boxShadow: "0 4px 20px rgba(124,58,237,0.3)" }
                      : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.88)", borderBottomLeftRadius: "4px" }
                  }
                >
                  {msg.content}
                  {msg.role === "assistant" && i === messages.length - 1 && isLoading && !msg.content && (
                    <span className="inline-flex gap-1 items-center">
                      <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "#7c3aed", animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "#7c3aed", animationDelay: "150ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "#7c3aed", animationDelay: "300ms" }} />
                    </span>
                  )}
                  {msg.quoteUpdated && (
                    <div
                      className="mt-2 text-xs font-medium inline-flex items-center gap-1 px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.25)", color: "#34d399" }}
                    >
                      ✓ Draft updated
                    </div>
                  )}
                  {msg.webhookStatus && (
                    <div
                      className="mt-1 text-xs font-medium inline-flex items-center gap-1 px-2 py-0.5 rounded-full"
                      style={msg.webhookStatus.ok
                        ? { background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)", color: "#34d399" }
                        : { background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }
                      }
                    >
                      {msg.webhookStatus.ok ? "✓ Sent to Bubble" : `✗ ${msg.webhookStatus.message}`}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input bar (bottom) */}
          <div
            className="flex-shrink-0 px-4 py-3"
            style={{ background: "rgba(255,255,255,0.03)", backdropFilter: "blur(12px)", borderTop: "1px solid rgba(255,255,255,0.07)" }}
          >
            {inputBar}
            <p className="text-center text-xs mt-1.5" style={{ color: "rgba(255,255,255,0.25)" }}>
              Enter to send · Shift+Enter for new line
            </p>
          </div>
        </>
      )}
    </div>
  );
}
