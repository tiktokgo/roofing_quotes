import { NextRequest } from "next/server";
import OpenAI from "openai";
import { buildSystemPrompt } from "@/lib/systemPrompt";
import type { AIContext } from "@/lib/verifyToken";
import type { Quote, PartialQuote } from "@/lib/quoteSchema";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const UPDATE_QUOTE_TOOL: OpenAI.Chat.ChatCompletionTool = {
  type: "function",
  function: {
    name: "update_quote",
    description:
      "Update the current roofing quote with new or changed fields. ONLY call this when the user provides new information that changes the quote.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Quote title, e.g. 'Roof Replacement — GAF Timberline — 123 Main St'" },
        date: { type: "string", description: "ISO date string" },
        scope: { type: "string", description: "Overall scope of work" },
        client: {
          type: "object",
          properties: {
            name:    { type: "string" },
            address: { type: "string" },
            phone:   { type: "string" },
            email:   { type: "string" },
          },
        },
        items: {
          type: "array",
          items: {
            type: "object",
            required: ["name", "description", "quantity", "unit", "unit_price", "total"],
            properties: {
              name:        { type: "string", description: "Short item label e.g. 'Tear-off', 'GAF Timberline HDZ Shingles'" },
              description: { type: "string", description: "Longer detail e.g. 'Removal and disposal of existing 3-tab shingles'" },
              quantity:    { type: "number" },
              unit:        { type: "string" },
              unit_price:  { type: "number" },
              total:       { type: "number" },
            },
          },
        },
        subtotal:  { type: "number" },
        tax_rate:  { type: "number", description: "e.g. 0.07 for 7%" },
        tax:       { type: "number" },
        total:     { type: "number" },
        warranty:  { type: "string" },
        terms:     { type: "string" },
        comments:  { type: "string" },
        status:    { type: "string", enum: ["draft", "complete"] },
      },
    },
  },
};

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/** Map internal PartialQuote to the slim fields Bubble expects */
function toBubblePayload(quote_id: string | undefined, quote: PartialQuote): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (quote_id) payload.quote_id = quote_id;
  if (quote.title) payload.title = quote.title;
  if (quote.client?.name) payload.client_name = quote.client.name;
  if (quote.client?.address) payload.client_address = quote.client.address;
  if (quote.items && quote.items.length > 0) {
    payload.items = quote.items
      .filter((item) => item.name || item.description)
      .map((item) => ({
        name: item.name ?? "",
        description: item.description ?? "",
        price: item.total ?? 0,
      }));
  }
  if (quote.total !== undefined) payload.total = quote.total;
  if (quote.warranty) payload.warranty = quote.warranty;
  if (quote.terms) payload.terms = quote.terms;
  if (quote.comments !== undefined) payload.comments = quote.comments;
  return payload;
}

async function notifyBubble(quote_id: string | undefined, quote: PartialQuote) {
  const url = process.env.BUBBLE_WEBHOOK_URL;
  const key = process.env.BUBBLE_API_KEY;
  if (!url) {
    console.warn("Bubble webhook skipped: BUBBLE_WEBHOOK_URL not set");
    return;
  }

  const payload = toBubblePayload(quote_id, quote);

  // Skip if nothing meaningful to send
  const meaningfulKeys = Object.keys(payload).filter((k) => k !== "quote_id");
  if (meaningfulKeys.length === 0) {
    console.log("Bubble webhook skipped: no new data to send");
    return;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`Bubble webhook failed: HTTP ${res.status} — ${body}`);
    } else {
      console.log(`Bubble webhook OK: HTTP ${res.status}`);
    }
  } catch (err) {
    console.error("Bubble webhook network error:", err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      messages: ChatMessage[];
      aiContext: AIContext & { quote_id?: string };
      currentQuote?: Partial<Quote>;
    };

    const { messages, aiContext, currentQuote } = body;
    const quote_id = aiContext.quote_id;

    if (!messages || !aiContext) {
      return new Response(JSON.stringify({ error: "Missing messages or aiContext" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const systemMessage: OpenAI.Chat.ChatCompletionMessageParam = {
      role: "system",
      content: buildSystemPrompt(aiContext),
    };

    // Inject current quote state as a system context message if we have one
    const contextMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (currentQuote && Object.keys(currentQuote).length > 0) {
      contextMessages.push({
        role: "system",
        content: `Current quote state (merge updates into this):\n${JSON.stringify(currentQuote, null, 2)}`,
      });
    }

    const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      systemMessage,
      ...contextMessages,
      ...messages.map((m) => ({ role: m.role, content: m.content } as OpenAI.Chat.ChatCompletionMessageParam)),
    ];

    const stream = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: openaiMessages,
      tools: [UPDATE_QUOTE_TOOL],
      tool_choice: "auto",
      stream: true,
    });

    // Stream SSE back to client
    const encoder = new TextEncoder();
    let toolCallBuffer = "";
    let toolCallName = "";

    const readable = new ReadableStream({
      async start(controller) {
        function send(data: object) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        }

        try {
          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta;
            if (!delta) continue;

            // Text content
            if (delta.content) {
              send({ type: "text", content: delta.content });
            }

            // Tool call accumulation
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                if (tc.function?.name) toolCallName = tc.function.name;
                if (tc.function?.arguments) toolCallBuffer += tc.function.arguments;
              }
            }

            // Finish reason: tool_calls → parse and emit quote_update
            const finishReason = chunk.choices[0]?.finish_reason;
            if (finishReason === "tool_calls" && toolCallName === "update_quote" && toolCallBuffer) {
              try {
                const args = JSON.parse(toolCallBuffer) as PartialQuote;
                send({ type: "quote_update", quote: args });
                await notifyBubble(quote_id, args);
              } catch {
                // malformed tool args — skip
              }
              toolCallBuffer = "";
              toolCallName = "";
            }
          }

          send({ type: "done" });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          send({ type: "error", message: msg });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Chat API error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
