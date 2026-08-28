import { summarySchema, SUMMARY_SYSTEM_PROMPT, type Summary } from "@gnani/shared";

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  model?: string;
}

async function callLlm(
  model: string,
  userContent: string
): Promise<{ content: string; model: string }> {
  const useGateway = process.env.USE_GATEWAY !== "false";
  const baseUrl = useGateway
    ? (process.env.AI_GATEWAY_BASE_URL ?? "https://ai-gateway.vercel.sh/v1")
    : (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1");
  const apiKey = useGateway
    ? process.env.AI_GATEWAY_API_KEY
    : process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("LLM API key is not configured");
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SUMMARY_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM request failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("LLM returned empty response");
  }

  return { content, model: data.model ?? model };
}

function parseSummary(content: string): Summary {
  const cleaned = content.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  const parsed = JSON.parse(cleaned);
  return summarySchema.parse(parsed);
}

function getModels(): string[] {
  const primary = process.env.AI_GATEWAY_MODEL ?? "openai/gpt-4o-mini";
  const fallbacks = (process.env.AI_GATEWAY_FALLBACK_MODELS ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return [primary, ...fallbacks];
}

function chunkText(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  const paragraphs = text.split(/\n\n+/);
  let current = "";

  for (const para of paragraphs) {
    if ((current + "\n\n" + para).length > maxChars && current) {
      chunks.push(current.trim());
      current = para;
    } else {
      current = current ? current + "\n\n" + para : para;
    }
  }
  if (current) chunks.push(current.trim());
  return chunks.length > 0 ? chunks : [text];
}

export async function summarizeTranscript(transcript: string): Promise<{
  summary: Summary;
  modelUsed: string;
}> {
  const threshold = Number(process.env.SUMMARIZE_MAP_REDUCE_THRESHOLD ?? 12_000);
  const models = getModels();

  if (transcript.length <= threshold) {
    return summarizeWithFallback(transcript, models);
  }

  const chunks = chunkText(transcript, Math.floor(threshold * 0.8));
  const partialSummaries: Summary[] = [];

  for (const chunk of chunks) {
    const { summary } = await summarizeWithFallback(
      `Summarize this portion of a longer transcript:\n\n${chunk}`,
      models
    );
    partialSummaries.push(summary);
  }

  const mergedInput = partialSummaries
    .map(
      (s, i) =>
        `Part ${i + 1}:\nTitle: ${s.title}\nTLDR: ${s.tldr}\nKey points: ${s.key_points.join("; ")}\nAction items: ${s.action_items.map((a) => a.text).join("; ")}`
    )
    .join("\n\n");

  const { summary, modelUsed } = await summarizeWithFallback(
    `Merge these partial summaries of one audio note into a single cohesive summary. De-duplicate key points and action items.\n\n${mergedInput}`,
    models
  );

  return { summary, modelUsed };
}

async function summarizeWithFallback(
  content: string,
  models: string[]
): Promise<{ summary: Summary; modelUsed: string }> {
  let lastError: Error | null = null;

  for (const model of models) {
    try {
      const { content: raw, model: usedModel } = await callLlm(model, content);
      const summary = parseSummary(raw);
      return { summary, modelUsed: usedModel };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`Model ${model} failed:`, lastError.message);
    }
  }

  throw lastError ?? new Error("All LLM models failed");
}
