// Shared helpers for RX AI Study Platform Netlify Functions.
// This is the exact business logic from the original Express server.ts —
// autonomous tool detection, the Cloudflare multi-agent router, quiz JSON
// sanitizing, and Mermaid diagram sanitizing — moved out of the Express app
// so chat.ts and voice.ts can both import it. No logic was changed.

export type RequestMode = "single" | "triple" | "quiz" | "diagram" | "notes";
export type ToolInvocation = {
  toolName: "math" | "dictionary" | "chemistry" | "translator" | "wikipedia" | "countries" | "arxiv" | "books" | "trivia" | "jokes";
  params: Record<string, any>;
  reason: string;
};
export type UserProfilePayload = {
  display_name?: string;
  mentor_persona?: "friend" | "teacher" | "doctor" | "coach";
  response_length?: "short" | "balanced" | "detailed";
  education_level?: "school" | "college" | "university" | "competitive" | "self";
  target_exam?: string;
  learning_focus?: string;
  study_goal?: string;
  answer_style?: string;
  language?: "en" | "bn" | "hi";
};

// NOTE: primary model choice per mode lives in MODE_MODEL_ROUTING below, right next to
// the Cloudflare Worker calling logic that uses it.

export function normalizeRequestMode(mode: unknown): RequestMode {
  if (mode === "triple" || mode === "quiz" || mode === "diagram" || mode === "notes") {
    return mode;
  }
  return "single";
}

export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function buildUserProfileContext(profile: UserProfilePayload | null | undefined): string {
  if (!profile) return "";

  const lines: string[] = [];
  const mentorToneMap: Record<string, string> = {
    friend: "Speak like a supportive study friend who keeps things relaxed and encouraging.",
    teacher: "Speak like a clear, skilled teacher who explains concepts carefully and academically.",
    doctor: "Speak like a calm expert mentor who is precise, responsible, and reassuring.",
    coach: "Speak like a motivating academic coach who pushes the learner toward progress and action.",
  };
  const responseLengthMap: Record<string, string> = {
    short: "Prefer concise answers unless the task clearly needs detail.",
    balanced: "Prefer balanced answers with a clear explanation and practical examples.",
    detailed: "Prefer deep, thorough answers with breakdowns, steps, and extra clarification.",
  };
  const educationLevelMap: Record<string, string> = {
    school: "The learner is at school level, so avoid unnecessary complexity.",
    college: "The learner is at college level, so use moderate academic depth.",
    university: "The learner is at university level, so use deeper conceptual rigor.",
    competitive: "The learner is preparing for competitive exams, so be efficient, accurate, and exam-focused.",
    self: "The learner is self-studying, so keep things approachable and practical.",
  };

  if (profile.display_name?.trim()) {
    lines.push(`Learner name: ${profile.display_name.trim()}. Address them by name occasionally when it feels natural.`);
  }
  if (profile.mentor_persona && mentorToneMap[profile.mentor_persona]) {
    lines.push(mentorToneMap[profile.mentor_persona]);
  }
  if (profile.response_length && responseLengthMap[profile.response_length]) {
    lines.push(responseLengthMap[profile.response_length]);
  }
  if (profile.education_level && educationLevelMap[profile.education_level]) {
    lines.push(educationLevelMap[profile.education_level]);
  }
  if (profile.target_exam?.trim()) {
    lines.push(`Target exam or milestone: ${profile.target_exam.trim()}. When useful, connect the answer to this goal.`);
  }
  if (profile.learning_focus?.trim()) {
    lines.push(`Current focus subjects/topics: ${profile.learning_focus.trim()}.`);
  }
  if (profile.study_goal?.trim()) {
    lines.push(`Current study goal: ${profile.study_goal.trim()}.`);
  }
  if (profile.answer_style?.trim()) {
    lines.push(`Custom answer preference from the learner: ${profile.answer_style.trim()}`);
  }

  if (lines.length === 0) return "";
  return `Personalized learner profile:\n- ${lines.join("\n- ")}\n\n`;
}

export function cleanTopic(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/^[\s"'`]+|[\s"'`?.!,]+$/g, "")
    .trim();
}

export function cleanLookupTopic(text: string): string {
  return cleanTopic(
    text
      .replace(/[?.!].*$/g, "")
      .split(/\b(?:show me|with|including|please|using|for me|and also|along with)\b/i)[0]
  );
}

export function findQuotedText(message: string): string {
  const match = message.match(/["'`“”]([^"'`“”]{2,200})["'`“”]/);
  return cleanTopic(match?.[1] || "");
}

export function extractAfterPatterns(message: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) {
      return cleanTopic(match[1]);
    }
  }
  return "";
}

export function detectTranslatorRequest(message: string): ToolInvocation | null {
  if (!/\btranslate\b/i.test(message)) return null;

  const langMap: Record<string, string> = {
    english: "en",
    en: "en",
    bangla: "bn",
    bengali: "bn",
    bn: "bn",
    hindi: "hi",
    hi: "hi",
    spanish: "es",
    es: "es",
    french: "fr",
    fr: "fr",
    german: "de",
    de: "de",
  };

  const toMatch = message.match(/\bto\s+(english|en|bangla|bengali|bn|hindi|hi|spanish|es|french|fr|german|de)\b/i);
  const fromMatch = message.match(/\bfrom\s+(english|en|bangla|bengali|bn|hindi|hi|spanish|es|french|fr|german|de)\b/i);
  const quoted = findQuotedText(message);
  const text = quoted || extractAfterPatterns(message, [
    /translate\s+(.+?)\s+\bto\b/i,
    /translate\s+(.+)/i,
  ]);

  if (!text) return null;

  return {
    toolName: "translator",
    params: {
      text,
      from: langMap[(fromMatch?.[1] || "en").toLowerCase()] || "en",
      to: langMap[(toMatch?.[1] || "bn").toLowerCase()] || "bn",
    },
    reason: "Translation request detected",
  };
}

export function detectDictionaryRequest(message: string): ToolInvocation | null {
  const word = extractAfterPatterns(message, [
    /\bmeaning of\s+([a-zA-Z-]{2,40})/i,
    /\bdefinition of\s+([a-zA-Z-]{2,40})/i,
    /\bdefine\s+([a-zA-Z-]{2,40})/i,
    /\bwhat does\s+([a-zA-Z-]{2,40})\s+mean/i,
  ]);
  if (!word) return null;
  return {
    toolName: "dictionary",
    params: { word },
    reason: "Dictionary lookup detected",
  };
}

export function detectMathRequest(message: string): ToolInvocation | null {
  const looksMathy = /[0-9xXyY+\-*/^=()]/.test(message);
  const hasMathVerb = /\b(solve|calculate|simplify|factor|derive|differentiate|integrate|math|equation|algebra|trigonometry|log)\b/i.test(message);
  if (!looksMathy && !hasMathVerb) return null;

  const operation =
    /\bfactor\b/i.test(message) ? "factor" :
    /\bderive\b|\bdifferentiate\b/i.test(message) ? "derive" :
    /\bintegrate\b|\bintegral\b/i.test(message) ? "integrate" :
    /\blog\b/i.test(message) ? "log" :
    /\bsin\b/i.test(message) ? "sin" :
    /\bcos\b/i.test(message) ? "cos" :
    "simplify";

  const expression = cleanTopic(
    extractAfterPatterns(message, [
      /\b(?:solve|calculate|simplify|factor|derive|differentiate|integrate)\s+(.+)/i,
      /\bexpression[:\-]?\s*(.+)/i,
    ]) || message
  );

  if (!expression) return null;

  return {
    toolName: "math",
    params: { operation, expression },
    reason: "Math expression detected",
  };
}

export function detectChemistryRequest(message: string): ToolInvocation | null {
  if (!/\b(chemical|chemistry|compound|molecular formula|molecular weight|smiles)\b/i.test(message)) {
    return null;
  }

  const compound = cleanTopic(
    cleanLookupTopic(
    extractAfterPatterns(message, [
      /\b(?:formula|molecular formula|molecular weight|smiles|compound)\s+(?:of\s+)?(.+)/i,
      /\babout\s+(.+)/i,
    ])
    )
  );

  if (!compound) return null;
  return {
    toolName: "chemistry",
    params: { compound },
    reason: "Chemistry compound lookup detected",
  };
}

export function detectCountryRequest(message: string): ToolInvocation | null {
  if (!/\b(capital|population|currency|flag|country|continent)\b/i.test(message)) {
    return null;
  }
  const country = cleanTopic(
    cleanLookupTopic(
    extractAfterPatterns(message, [
      /\b(?:capital|population|currency|flag|country|continent)\s+(?:of\s+)?(.+)/i,
    ])
    )
  );
  if (!country) return null;
  return {
    toolName: "countries",
    params: { country },
    reason: "Country lookup detected",
  };
}

export function detectArxivRequest(message: string): ToolInvocation | null {
  if (!/\b(arxiv|research paper|research papers|paper on|papers on|latest research|study on)\b/i.test(message)) {
    return null;
  }
  const keyword = cleanTopic(
    cleanLookupTopic(
    extractAfterPatterns(message, [
      /\b(?:arxiv|research paper|research papers|paper on|papers on|latest research on|study on)\s+(.+)/i,
      /\bon\s+(.+)/i,
    ])
    )
  );
  if (!keyword) return null;
  return {
    toolName: "arxiv",
    params: { keyword },
    reason: "Research paper lookup detected",
  };
}

export function detectBooksRequest(message: string): ToolInvocation | null {
  if (!/\b(book|books|novel|gutenberg|read about)\b/i.test(message)) {
    return null;
  }
  const keyword = cleanTopic(
    cleanLookupTopic(
    extractAfterPatterns(message, [
      /\b(?:book|books|novel|gutenberg|read about)\s+(.+)/i,
    ])
    )
  );
  if (!keyword) return null;
  return {
    toolName: "books",
    params: { keyword },
    reason: "Book lookup detected",
  };
}

export function detectTriviaRequest(message: string): ToolInvocation | null {
  if (!/\b(trivia|quiz me|fun quiz)\b/i.test(message)) return null;
  return {
    toolName: "trivia",
    params: {},
    reason: "Trivia request detected",
  };
}

export function detectJokeRequest(message: string): ToolInvocation | null {
  if (!/\b(joke|funny|break time)\b/i.test(message)) return null;
  return {
    toolName: "jokes",
    params: {},
    reason: "Break-time joke request detected",
  };
}

export function detectWikipediaRequest(message: string): ToolInvocation | null {
  if (!/\b(who is|what is|tell me about|summary of|wikipedia|history of|overview of)\b/i.test(message)) {
    return null;
  }
  const topic = cleanTopic(
    cleanLookupTopic(
    extractAfterPatterns(message, [
      /\bwho is\s+(.+?)(?:[?.!]|$)/i,
      /\bwhat is\s+(.+?)(?:[?.!]|$)/i,
      /\btell me about\s+(.+?)(?:[?.!]|$)/i,
      /\bsummary of\s+(.+?)(?:[?.!]|$)/i,
      /\bhistory of\s+(.+?)(?:[?.!]|$)/i,
      /\boverview of\s+(.+?)(?:[?.!]|$)/i,
      /\bwikipedia\s+(.+?)(?:[?.!]|$)/i,
    ])
    )
  );
  if (!topic) return null;
  return {
    toolName: "wikipedia",
    params: { topic },
    reason: "General knowledge lookup detected",
  };
}

export function buildToolPlan(message: string, mode: RequestMode): ToolInvocation[] {
  const plan: ToolInvocation[] = [];
  const detectors = [
    detectTranslatorRequest,
    detectDictionaryRequest,
    detectMathRequest,
    detectChemistryRequest,
    detectCountryRequest,
    detectArxivRequest,
    detectBooksRequest,
    detectTriviaRequest,
    detectJokeRequest,
    detectWikipediaRequest,
  ];

  for (const detector of detectors) {
    const result = detector(message);
    if (result && !plan.some((item) => item.toolName === result.toolName)) {
      plan.push(result);
    }
  }

  if (plan.length === 0 && /\b(photo|image|picture|show me|pic)\b/i.test(message)) {
    const wikiFallback = detectWikipediaRequest(`tell me about ${message}`);
    if (wikiFallback) plan.push(wikiFallback);
  }

  if (mode === "quiz" && !plan.some((item) => item.toolName === "trivia") && /\bquiz\b/i.test(message)) {
    const trivia = detectTriviaRequest("trivia");
    if (trivia) plan.push(trivia);
  }

  return plan.slice(0, 2);
}

export function formatToolContext(toolName: ToolInvocation["toolName"], data: any): { text: string; imageMarkdown?: string } {
  if (!data) return { text: "" };

  if (toolName === "math") {
    return {
      text: `Math tool result:
- Operation: ${data.operation}
- Expression: ${data.expression}
- Result: ${data.result}`,
    };
  }

  if (toolName === "dictionary") {
    return {
      text: `Dictionary tool result:
- Word: ${data.word}
- Phonetic: ${data.phonetic || "N/A"}
- Meaning: ${data.meanings?.[0]?.definitions?.[0]?.definition || "N/A"}`,
    };
  }

  if (toolName === "chemistry") {
    return {
      text: `Chemistry tool result:
- Formula: ${data.MolecularFormula || "N/A"}
- Molecular weight: ${data.MolecularWeight || "N/A"}
- SMILES: ${data.CanonicalSMILES || "N/A"}`,
    };
  }

  if (toolName === "translator") {
    return {
      text: `Translator tool result:
- Original: ${data.match || "N/A"}
- Translated: ${data.translatedText || "N/A"}`,
    };
  }

  if (toolName === "wikipedia") {
    return {
      text: `Wikipedia tool result:
- Title: ${data.title || "N/A"}
- Summary: ${data.extract || "N/A"}
- Source: ${data.content_urls?.desktop?.page || "N/A"}`,
      imageMarkdown: data.thumbnail?.source ? `![${data.title || "Reference image"}](${data.thumbnail.source})` : undefined,
    };
  }

  if (toolName === "countries") {
    return {
      text: `Country tool result:
- Country: ${data.name?.common || "N/A"}
- Capital: ${data.capital?.[0] || "N/A"}
- Population: ${data.population?.toLocaleString?.() || data.population || "N/A"}
- Continent: ${data.continents?.[0] || "N/A"}
- Currency: ${Object.keys(data.currencies || {})[0] || "N/A"}`,
      imageMarkdown: data.flags?.png ? `![${data.name?.common || "Country"} flag](${data.flags.png})` : undefined,
    };
  }

  if (toolName === "arxiv") {
    const entries = Array.isArray(data) ? data.slice(0, 3) : [];
    return {
      text: `arXiv tool result:
${entries.map((entry: any, index: number) => `- Paper ${index + 1}: ${entry.title}
  Abstract: ${entry.summary}
  Link: ${entry.pdfLink}`).join("\n")}`,
    };
  }

  if (toolName === "books") {
    const entries = Array.isArray(data) ? data.slice(0, 3) : [];
    const firstImage = entries[0]?.formats?.["image/jpeg"];
    return {
      text: `Books tool result:
${entries.map((entry: any, index: number) => `- Book ${index + 1}: ${entry.title} by ${entry.authors?.[0]?.name || "Unknown"}`).join("\n")}`,
      imageMarkdown: firstImage ? `![Book cover](${firstImage})` : undefined,
    };
  }

  if (toolName === "trivia") {
    const entries = Array.isArray(data) ? data.slice(0, 3) : [];
    return {
      text: `Trivia tool result:
${entries.map((entry: any, index: number) => `- Question ${index + 1}: ${entry.question}
  Correct answer: ${entry.correct_answer}`).join("\n")}`,
    };
  }

  if (toolName === "jokes") {
    return {
      text: `Joke tool result:
- ${data.joke || `${data.setup} ${data.delivery}`}`,
    };
  }

  return { text: "" };
}

export async function gatherAutonomousToolContext(message: string, mode: RequestMode): Promise<{ toolContext: string; imageMarkdown: string[]; usedTools: string[] }> {
  const plan = buildToolPlan(message, mode);
  if (plan.length === 0) {
    return { toolContext: "", imageMarkdown: [], usedTools: [] };
  }

  const chunks: string[] = [];
  const imageMarkdown: string[] = [];
  const usedTools: string[] = [];

  for (const item of plan) {
    const data = await runAgentTools(item.toolName, item.params);
    if (!data) continue;
    const formatted = formatToolContext(item.toolName, data);
    if (formatted.text) {
      chunks.push(`[${item.toolName}] ${formatted.text}`);
      usedTools.push(item.toolName);
    }
    if (formatted.imageMarkdown) {
      imageMarkdown.push(formatted.imageMarkdown);
    }
  }

  if (chunks.length === 0) {
    return { toolContext: "", imageMarkdown: [], usedTools: [] };
  }

  return {
    toolContext: `Trusted reference API data collected automatically for this request:\n${chunks.join("\n\n")}\n\nUse this tool data when it improves accuracy. If it conflicts with general memory, prefer the tool data.\n\n`,
    imageMarkdown,
    usedTools,
  };
}

// Netlify Functions run on a hard wall-clock limit (10s on the free tier, higher on
// paid plans). The original fetch call to the Cloudflare Worker had NO timeout at all,
// so if a model backend ever hung or was slow, the request just sat there until Netlify
// force-killed the whole function — which produces an empty/opaque failure on the client
// ("Api error") instead of a real error message, and can also hand back a half-written
// response (which is what caused the intermittent "Invalid Mermaid.js syntax" errors too).
// Bounding every attempt with an abortable timeout means a slow/stuck attempt fails fast
// and a retry gets a chance well within the function's time budget, instead of silently
// eating the whole request.
//
// The Worker exposes two relevant endpoints (see worker.js):
//   POST /rx_chat_txt           — pick a specific model via `model`, provider-level fallback only
//   POST /text_only_high_speed  — no `model` needed, sweeps its own small→big list of 30+ models
//
// Strategy: try the mode's preferred model on /rx_chat_txt first (fast, tuned per mode).
// If that fails for any reason, fall back to /text_only_high_speed, which does a full
// sweep server-side — so we don't have to maintain our own multi-model fallback list here.
const CLOUDFLARE_BASE = "https://api.101010101.workers.dev";
const CLOUDFLARE_PRIMARY_ENDPOINT = `${CLOUDFLARE_BASE}/rx_chat_txt`;
const CLOUDFLARE_SWEEP_ENDPOINT = `${CLOUDFLARE_BASE}/text_only_high_speed`;

// Primary (fast) attempt: capped at 6.8s, so it can never eat the whole request budget.
const PRIMARY_ATTEMPT_TIMEOUT_MS = Number(process.env.CLOUDFLARE_PRIMARY_TIMEOUT_MS) || 6800;
// Fallback (sweep) attempt: no fixed cap — it just gets whatever's left of the shared
// request deadline below, since the Worker's own sweep already bounds each of its
// internal attempts (8.5s normal / 3s for deprecated models).
export const REQUEST_TIME_BUDGET_MS = Number(process.env.REQUEST_TIME_BUDGET_MS) || 9000;

// Preferred "fast" model per mode for the /rx_chat_txt primary attempt. Picked from the
// Worker's currently-live (non-deprecated) models — see worker.js's DEPRECATED_MODELS set.
export const MODE_MODEL_ROUTING: Record<RequestMode, string> = {
  single: "openai/gpt-oss-20b",              // groq — fastest live model, good for plain chat
  notes: "qwen/qwen3.6-27b",                  // groq — solid quality for structured notes
  quiz: "google/gemma-4-26b-a4b-it:free",     // openrouter — proven 100% reliable in testing
  diagram: "qwen/qwen3-next-80b-a3b-instruct:free", // openrouter — stronger reasoning for correct Mermaid syntax
  triple: "qwen/qwen3.6-27b",                 // groq — live replacement for the retired qwen3-32b
};

// Low-level helper for the primary /rx_chat_txt attempt (specific model requested)
async function callCloudflarePrimary(message: string, model: string, timeoutMs: number): Promise<{ response: string; model: string }> {
  let response: Response;
  try {
    response = await fetch(CLOUDFLARE_PRIMARY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, model }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error: any) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      throw new Error(`Cloudflare primary request timed out after ${timeoutMs}ms (model: ${model})`);
    }
    throw error;
  }

  if (!response.ok) {
    const text = await response.text();
    const err: any = new Error(`Cloudflare primary connection failed (${response.status}): ${text || "Unknown"}`);
    if (response.status === 429) err.rateLimited = true;
    throw err;
  }

  const data = await response.json();
  if (data && data.success) {
    return { response: data.response, model: data.model || data.provider || model };
  } else {
    const errText = Array.isArray(data?.errors) ? data.errors.join(" | ") : data?.error;
    throw new Error(errText || "Primary model returned no valid response.");
  }
}

// Low-level helper for the fallback /text_only_high_speed sweep (no model — Worker decides)
async function callCloudflareSweep(message: string, timeoutMs: number): Promise<{ response: string; model: string }> {
  let response: Response;
  try {
    response = await fetch(CLOUDFLARE_SWEEP_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error: any) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      throw new Error(`Cloudflare sweep request timed out after ${timeoutMs}ms`);
    }
    throw error;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Cloudflare sweep connection failed (${response.status}): ${text || "Unknown"}`);
  }

  const data = await response.json();
  if (data && data.success) {
    return { response: data.response, model: data.model || data.provider || "auto" };
  } else {
    const errText = Array.isArray(data?.errors) ? data.errors.join(" | ") : data?.error;
    throw new Error(errText || "Sweep endpoint returned no valid response.");
  }
}

// `deadlineAt` (an absolute Date.now()-style timestamp) is optional: pass the same
// deadline into every callCloudflareWorker() call within one /api/chat request so
// multi-step chains (e.g. research -> notes, reasoning -> tutor, quiz -> repair) share
// one overall time budget instead of each independently trying for the full window.
export async function callCloudflareWorker(message: string, mode: RequestMode, deadlineAt?: number): Promise<{ response: string; model: string }> {
  const effectiveDeadline = deadlineAt ?? (Date.now() + REQUEST_TIME_BUDGET_MS);
  const primaryModel = MODE_MODEL_ROUTING[mode] || MODE_MODEL_ROUTING.single;
  let lastError: unknown = null;

  let remainingBudget = effectiveDeadline - Date.now();
  if (remainingBudget > 500) {
    try {
      return await callCloudflarePrimary(message, primaryModel, Math.min(PRIMARY_ATTEMPT_TIMEOUT_MS, remainingBudget));
    } catch (error: any) {
      lastError = error;
      console.warn(`[Cloudflare:${mode}] Primary (${primaryModel}) failed -> ${formatErrorMessage(error)}`);
      if (error?.rateLimited) {
        remainingBudget = effectiveDeadline - Date.now();
        if (remainingBudget > 1200) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    }
  }

  // Fallback: let the Worker's own /text_only_high_speed sweep pick a working model from
  // its full list. It gets whatever's left of the shared deadline — no fixed cap here,
  // since a hardcoded timeout would either waste headroom or cut off a near-success.
  remainingBudget = effectiveDeadline - Date.now();
  if (remainingBudget > 500) {
    try {
      return await callCloudflareSweep(message, remainingBudget);
    } catch (error) {
      lastError = error;
      console.warn(`[Cloudflare:${mode}] Sweep fallback failed -> ${formatErrorMessage(error)}`);
    }
  }

  throw new Error(`AI gateway failed for ${mode}. Last error: ${formatErrorMessage(lastError)}`);
}

export function stripMarkdownCodeFence(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  return cleaned.trim();
}

export function extractLikelyJsonBlock(text: string): string {
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }
  return text;
}

export function sanitizeJsonLikeText(text: string): string {
  const source = extractLikelyJsonBlock(stripMarkdownCodeFence(text))
    .replace(/\u0000/g, "")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  let output = "";
  let inString = false;
  let escaped = false;

  const peekNextNonWhitespace = (startIndex: number): string => {
    for (let i = startIndex; i < source.length; i++) {
      const char = source[i];
      if (!/\s/.test(char)) {
        return char;
      }
    }
    return "";
  };

  for (let i = 0; i < source.length; i++) {
    const char = source[i];

    if (inString) {
      if (escaped) {
        if (char === "\n") {
          output += "n";
        } else if (char === "\t") {
          output += "t";
        } else {
          output += char;
        }
        escaped = false;
        continue;
      }

      if (char === "\\") {
        output += char;
        escaped = true;
        continue;
      }

      if (char === "\"") {
        const nextSignificant = peekNextNonWhitespace(i + 1);
        if (nextSignificant && ![",", "}", "]", ":"].includes(nextSignificant)) {
          output += "\\\"";
          continue;
        }
        output += char;
        inString = false;
        continue;
      }

      if (char === "\n") {
        output += "\\n";
        continue;
      }

      if (char === "\t") {
        output += " ";
        continue;
      }

      output += char;
      continue;
    }

    if (char === "\"") {
      inString = true;
    }

    output += char;
  }

  return output.replace(/,\s*([}\]])/g, "$1").trim();
}

export function normalizeQuizData(raw: any) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Quiz payload is not a valid object.");
  }

  const questions = Array.isArray(raw.questions) ? raw.questions : [];
  const normalizedQuestions = questions
    .map((question: any) => {
      const options = Array.isArray(question?.options)
        ? question.options
            .map((option: any) => String(option ?? "").trim())
            .filter((option: string) => option.length > 0)
        : [];

      if (!String(question?.q ?? "").trim() || options.length < 2) {
        return null;
      }

      const parsedCorrect = Number.isFinite(Number(question?.correct)) ? Number(question.correct) : 0;
      const boundedCorrect = Math.min(Math.max(Math.floor(parsedCorrect), 0), options.length - 1);

      return {
        q: String(question.q).trim(),
        options,
        correct: boundedCorrect,
        explanation: String(question?.explanation ?? "No explanation provided.").trim(),
      };
    })
    .filter(Boolean);

  if (normalizedQuestions.length === 0) {
    throw new Error("Quiz payload did not include usable questions.");
  }

  return {
    quiz_title: String(raw.quiz_title ?? "Study Quiz").trim() || "Study Quiz",
    questions: normalizedQuestions,
  };
}

export function parseQuizPayload(text: string) {
  const attempts = [
    text,
    stripMarkdownCodeFence(text),
    extractLikelyJsonBlock(stripMarkdownCodeFence(text)),
    sanitizeJsonLikeText(text),
  ];

  let lastError: unknown = null;

  for (const candidate of attempts) {
    if (!candidate || !candidate.trim()) {
      continue;
    }

    try {
      return normalizeQuizData(JSON.parse(candidate));
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unable to parse quiz JSON.");
}

export async function repairQuizPayload(text: string, deadlineAt?: number) {
  const repairPrompt = `Convert the malformed quiz output below into strict valid JSON only.

Rules:
- Return only raw JSON.
- Keep the schema exactly:
{
  "quiz_title": "string",
  "questions": [
    {
      "q": "string",
      "options": ["string", "string"],
      "correct": 0,
      "explanation": "string"
    }
  ]
}
- Do not add markdown fences.
- Keep every string on a single line.
- Escape any internal quotes correctly.

Malformed quiz output:
${sanitizeJsonLikeText(text)}`;

  const repairResult = await callCloudflareWorker(repairPrompt, "quiz", deadlineAt);
  return parseQuizPayload(repairResult.response);
}

// Helper to sanitize and fix Mermaid.js syntax dynamically
export function sanitizeMermaidCode(code: string): string {
  let cleaned = code;

  // 1. Clean up potential markdown blocks
  if (cleaned.includes("```mermaid")) {
    cleaned = cleaned.split("```mermaid")[1].split("```")[0];
  } else if (cleaned.includes("```")) {
    const parts = cleaned.split("```");
    if (parts.length >= 3) {
      cleaned = parts[1];
    } else {
      cleaned = parts[0];
    }
  }

  // 2. Normalize unicode line/box-drawing and arrow characters to standard ASCII
  cleaned = cleaned
    .replace(/[─—–−]+/g, "-") // replace em-dashes, en-dashes, minus signs, and box-drawing lines with hyphen
    .replace(/➔|➛|→|➔|➤|►/g, "-->") // replace unicode arrow heads with ascii arrow
    .replace(/▷/g, "-") // replace white triangle with a dash
    .replace(/-+>/g, "-->") // normalize long arrow lines like ---> or ----> to standard -->
    .replace(/={2,}>/g, "==>") // normalize long thick arrow lines to ==>
    .replace(/-{3,}/g, "---") // normalize long lines to ---
    .replace(/\.{2,}/g, "..") // normalize long dots
    ;

  // Fix spaces after arrows before pipe labels e.g. "--> |label|" to "-->|label|"
  cleaned = cleaned.replace(/(-->|==>|--)\s+\|([^|]+)\|/g, "$1|$2|");

  // 3. Ensure labels/text inside node shapes are safely double-quoted
  // Supports shapes: [text], (text), ((text)), {text}, etc.
  
  // Double parentheses: id((text)) -> id(("text"))
  cleaned = cleaned.replace(/([a-zA-Z0-9_-]+)\(\(([^)]+)\)\)/g, (match, id, content) => {
    let inner = content.trim();
    if (inner.startsWith('"') && inner.endsWith('"')) {
      inner = inner.slice(1, -1);
    }
    inner = inner.replace(/"/g, '\\"');
    return `${id}(("${inner}"))`;
  });

  // Brackets: id[text] -> id["text"]
  cleaned = cleaned.replace(/([a-zA-Z0-9_-]+)\[([^\]]+)\]/g, (match, id, content) => {
    let inner = content.trim();
    if (inner.startsWith('"') && inner.endsWith('"')) {
      inner = inner.slice(1, -1);
    }
    inner = inner.replace(/"/g, '\\"');
    return `${id}["${inner}"]`;
  });

  // Parentheses: id(text) -> id("text")
  cleaned = cleaned.replace(/([a-zA-Z0-9_-]+)\(([^)]+)\)/g, (match, id, content) => {
    if (match.includes("((")) return match;
    let inner = content.trim();
    if (inner.startsWith('"') && inner.endsWith('"')) {
      inner = inner.slice(1, -1);
    }
    inner = inner.replace(/"/g, '\\"');
    return `${id}("${inner}")`;
  });

  // Curly brackets: id{text} -> id{"text"}
  cleaned = cleaned.replace(/([a-zA-Z0-9_-]+)\{([^}]+)\}/g, (match, id, content) => {
    let inner = content.trim();
    if (inner.startsWith('"') && inner.endsWith('"')) {
      inner = inner.slice(1, -1);
    }
    inner = inner.replace(/"/g, '\\"');
    return `${id}{"${inner}"}`;
  });

  // 4. Ensure double quotes are balanced on each line
  const lines = cleaned.split("\n");
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const quoteCount = (line.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0) {
      // Unbalanced quotes! Remove them to avoid Mermaid crash
      line = line.replace(/"/g, "");
    }
    lines[i] = line;
  }
  cleaned = lines.join("\n");

  // 5. Ensure it starts with a valid graph type if missing
  const firstLine = lines[0] ? lines[0].trim().toLowerCase() : "";
  const validHeaders = ["graph", "flowchart", "mindmap", "sequenceDiagram", "classDiagram", "stateDiagram", "erDiagram", "gantt", "pie", "gitGraph", "journey"];
  const hasValidHeader = validHeaders.some(header => firstLine.startsWith(header));
  
  if (!hasValidHeader) {
    cleaned = "graph TD\n" + cleaned;
  }

  return cleaned.trim();
}

// Background Reference APIs for Agentic Workspace Execution
export async function runAgentTools(toolName: string, params: any): Promise<any> {
  try {
    if (toolName === "math") {
      const op = params.operation || "simplify";
      const expr = encodeURIComponent(params.expression || "");
      const res = await fetch(`https://newton.now.sh/api/v2/${op}/${expr}`);
      if (res.ok) return await res.json();
    } else if (toolName === "dictionary") {
      const word = encodeURIComponent(params.word || "");
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
      if (res.ok) {
        const d = await res.json();
        return d[0];
      }
    } else if (toolName === "chemistry") {
      const comp = encodeURIComponent(params.compound || "");
      const res = await fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${comp}/property/MolecularFormula,MolecularWeight,CanonicalSMILES/JSON`);
      if (res.ok) {
        const d = await res.json();
        return d.PropertyTable?.Properties?.[0];
      }
    } else if (toolName === "translator") {
      const text = encodeURIComponent(params.text || "");
      const from = params.from || "en";
      const to = params.to || "bn";
      const res = await fetch(`https://api.mymemory.translated.net/get?q=${text}&langpair=${from}|${to}`);
      if (res.ok) {
        const d = await res.json();
        return d.responseData;
      }
    } else if (toolName === "wikipedia") {
      const topic = encodeURIComponent(params.topic || "");
      const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${topic}`);
      if (res.ok) return await res.json();
    } else if (toolName === "countries") {
      const country = encodeURIComponent(params.country || "");
      const res = await fetch(`https://restcountries.com/v3.1/name/${country}`);
      if (res.ok) {
        const d = await res.json();
        return d[0];
      }
    } else if (toolName === "arxiv") {
      const keyword = encodeURIComponent(params.keyword || "");
      const res = await fetch(`https://export.arxiv.org/api/query?search_query=all:${keyword}&max_results=3`);
      if (res.ok) {
        const xmlText = await res.text();
        const entries: any[] = [];
        const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
        let match;
        let count = 0;
        while ((match = entryRegex.exec(xmlText)) !== null && count < 3) {
          const content = match[1];
          const titleMatch = content.match(/<title>([\s\S]*?)<\/title>/);
          const summaryMatch = content.match(/<summary>([\s\S]*?)<\/summary>/);
          const idMatch = content.match(/<id>([\s\S]*?)<\/id>/);
          entries.push({
            title: titleMatch ? titleMatch[1].trim().replace(/\s+/g, " ") : "Untitled",
            summary: summaryMatch ? summaryMatch[1].trim().replace(/\s+/g, " ") : "No abstract",
            pdfLink: idMatch ? idMatch[1].trim() : ""
          });
          count++;
        }
        return entries;
      }
    } else if (toolName === "books") {
      const kw = encodeURIComponent(params.keyword || "");
      const res = await fetch(`https://gutendex.com/books/?search=${kw}`);
      if (res.ok) {
        const d = await res.json();
        return d.results?.slice(0, 3) || [];
      }
    } else if (toolName === "trivia") {
      const res = await fetch(`https://opentdb.com/api.php?amount=3&difficulty=medium&type=multiple`);
      if (res.ok) {
        const d = await res.json();
        return d.results || [];
      }
    } else if (toolName === "jokes") {
      const res = await fetch(`https://v2.jokeapi.dev/joke/Any?type=single`);
      if (res.ok) return await res.json();
    }
  } catch (err: any) {
    console.error(`Error in running tool ${toolName}:`, err.message);
  }
  return null;
}
