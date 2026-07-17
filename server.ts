import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json({ limit: "25mb" }));

type RequestMode = "single" | "triple" | "quiz" | "diagram" | "notes";
type ToolInvocation = {
  toolName: "math" | "dictionary" | "chemistry" | "translator" | "wikipedia" | "countries" | "arxiv" | "books" | "trivia" | "jokes";
  params: Record<string, any>;
  reason: string;
};
type UserProfilePayload = {
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

const MODEL_VARIANTS: Record<string, string[]> = {
  "llama-3.3-70b-versatile": ["llama-3.3-70b-versatile", "llama-3.3-70b"],
  "qwen/qwen3-32b": ["qwen/qwen3-32b", "qwen3-32b"],
  "moonshotai/kimi-k2.6": ["moonshotai/kimi-k2.6"],
  "mistralai/mistral-large-3-675b-instruct-2512": ["mistralai/mistral-large-3-675b-instruct-2512", "mistral-large-3"],
  "google/gemma-4-26b-a4b-it:free": ["google/gemma-4-26b-a4b-it:free", "google/google/gemma-4-26b-a4b-it:free"],
  "llama-3.1-8b-instant": ["llama-3.1-8b", "llama-3.1-8b-instant"],
  "ministral-8b-latest": ["ministral-8b", "ministral-8b-latest"],
  "qwen/qwen3-next-80b-a3b-instruct:free": ["qwen3-next-80b-a3b-instruct", "qwen/qwen3-next-80b-a3b-instruct:free"],
};

const MODE_MODEL_ROUTING: Record<RequestMode, string[]> = {
  single: [
    "llama-3.3-70b-versatile",
    "qwen/qwen3-32b",
  ],
  notes: [
    "moonshotai/kimi-k2.6",
    "mistralai/mistral-large-3-675b-instruct-2512",
  ],
  quiz: [
    "google/gemma-4-26b-a4b-it:free",
    "llama-3.1-8b-instant",
    "ministral-8b-latest",
  ],
  diagram: [
    "qwen/qwen3-next-80b-a3b-instruct:free",
    "qwen/qwen3-32b",
    "llama-3.3-70b-versatile",
  ],
  triple: [
    "mistralai/mistral-large-3-675b-instruct-2512",
    "qwen/qwen3-next-80b-a3b-instruct:free",
    "google/gemma-4-26b-a4b-it:free",
  ],
};

function expandModelCandidates(models: string[]): string[] {
  const expanded: string[] = [];
  for (const model of models) {
    const variants = MODEL_VARIANTS[model] || [model];
    for (const variant of variants) {
      if (!expanded.includes(variant)) {
        expanded.push(variant);
      }
    }
  }
  return expanded;
}

function normalizeRequestMode(mode: unknown): RequestMode {
  if (mode === "triple" || mode === "quiz" || mode === "diagram" || mode === "notes") {
    return mode;
  }
  return "single";
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function buildUserProfileContext(profile: UserProfilePayload | null | undefined): string {
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

function cleanTopic(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/^[\s"'`]+|[\s"'`?.!,]+$/g, "")
    .trim();
}

function cleanLookupTopic(text: string): string {
  return cleanTopic(
    text
      .replace(/[?.!].*$/g, "")
      .split(/\b(?:show me|with|including|please|using|for me|and also|along with)\b/i)[0]
  );
}

function findQuotedText(message: string): string {
  const match = message.match(/["'`“”]([^"'`“”]{2,200})["'`“”]/);
  return cleanTopic(match?.[1] || "");
}

function extractAfterPatterns(message: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) {
      return cleanTopic(match[1]);
    }
  }
  return "";
}

function detectTranslatorRequest(message: string): ToolInvocation | null {
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

function detectDictionaryRequest(message: string): ToolInvocation | null {
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

function detectMathRequest(message: string): ToolInvocation | null {
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

function detectChemistryRequest(message: string): ToolInvocation | null {
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

function detectCountryRequest(message: string): ToolInvocation | null {
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

function detectArxivRequest(message: string): ToolInvocation | null {
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

function detectBooksRequest(message: string): ToolInvocation | null {
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

function detectTriviaRequest(message: string): ToolInvocation | null {
  if (!/\b(trivia|quiz me|fun quiz)\b/i.test(message)) return null;
  return {
    toolName: "trivia",
    params: {},
    reason: "Trivia request detected",
  };
}

function detectJokeRequest(message: string): ToolInvocation | null {
  if (!/\b(joke|funny|break time)\b/i.test(message)) return null;
  return {
    toolName: "jokes",
    params: {},
    reason: "Break-time joke request detected",
  };
}

function detectWikipediaRequest(message: string): ToolInvocation | null {
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

function buildToolPlan(message: string, mode: RequestMode): ToolInvocation[] {
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

function formatToolContext(toolName: ToolInvocation["toolName"], data: any): { text: string; imageMarkdown?: string } {
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

async function gatherAutonomousToolContext(message: string, mode: RequestMode): Promise<{ toolContext: string; imageMarkdown: string[]; usedTools: string[] }> {
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

// Low-level helper to communicate with Cloudflare Worker API
async function callCloudflareWorkerOnce(message: string, model: string = ""): Promise<string> {
  const payload = {
    message: message,
    model: model === "auto" ? "" : model,
  };

  const response = await fetch("https://api.101010101.workers.dev/rx_chat_txt", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Cloudflare API connection failed (${response.status}): ${text || "Unknown"}`);
  }

  const data = await response.json();
  if (data && data.success) {
    return data.response;
  } else {
    throw new Error(data?.error || JSON.stringify(data?.errors) || "Failed to retrieve a valid AI response from the cloud network.");
  }
}

// Mode-wise model router with automatic fallback retries
async function callCloudflareWorker(message: string, mode: RequestMode): Promise<{ response: string; model: string }> {
  const modelsToTry = expandModelCandidates(MODE_MODEL_ROUTING[mode] || MODE_MODEL_ROUTING.single);
  let lastError: unknown = null;

  for (const candidateModel of modelsToTry) {
    try {
      const response = await callCloudflareWorkerOnce(message, candidateModel);
      return { response, model: candidateModel };
    } catch (error) {
      lastError = error;
      console.warn(`[Cloudflare:${mode}] Model failed: ${candidateModel} -> ${formatErrorMessage(error)}`);
    }
  }

  throw new Error(`All configured models failed for ${mode}. Last error: ${formatErrorMessage(lastError)}`);
}

function stripMarkdownCodeFence(text: string): string {
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

function extractLikelyJsonBlock(text: string): string {
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }
  return text;
}

function sanitizeJsonLikeText(text: string): string {
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

function normalizeQuizData(raw: any) {
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

function parseQuizPayload(text: string) {
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

async function repairQuizPayload(text: string) {
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

  const repairResult = await callCloudflareWorker(repairPrompt, "quiz");
  return parseQuizPayload(repairResult.response);
}

// Helper to sanitize and fix Mermaid.js syntax dynamically
function sanitizeMermaidCode(code: string): string {
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
async function runAgentTools(toolName: string, params: any): Promise<any> {
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

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// Premium TTS Voice Proxy Endpoint with intelligent auto-sweep & fallbacks
app.get("/api/voice", async (req, res) => {
  try {
    const text = req.query.text as string;
    const requestedMode = req.query.mode as string;

    if (!text) {
      return res.status(400).json({ error: "Text is required" });
    }

    // Smart language-aware model routing
    const isBengali = /[\u0980-\u09FF]/.test(text);

    // Build fallback queue
    let modesToTry: string[] = [];
    if (requestedMode) {
      modesToTry.push(requestedMode);
    }

    if (isBengali) {
      // Prioritize sweet Bengali voice for Bengali texts
      if (!requestedMode || !requestedMode.startsWith("bn")) {
        modesToTry.unshift("bn_f_sweet");
      }
      modesToTry.push("bn_f_sweet", "bn_m_normal", "en_uk_f_sonia", "en_us_f_jenny");
    } else {
      if (!requestedMode) {
        modesToTry.push("en_uk_f_sonia");
      }
      modesToTry.push("en_us_f_jenny", "en_us_f_aria", "en_in_f_neerja", "bn_f_sweet");
    }

    // Deduplicate
    modesToTry = Array.from(new Set(modesToTry));

    let audioResponse: any = null;
    let successfulMode = "";

    for (const mode of modesToTry) {
      try {
        const targetUrl = `https://rafidmondal-raxzen-voice.hf.space/raxzen-voice?text=${encodeURIComponent(text)}&mode=${encodeURIComponent(mode)}`;
        
        const response = await fetch(targetUrl, {
          method: "GET",
          headers: {
            "x-api-key": "raxzen_voice_free_unlimited_api",
          },
        });

        if (response.ok) {
          audioResponse = response;
          successfulMode = mode;
          break;
        } else {
          console.warn(`Voice API failed for mode: ${mode}, status: ${response.status}. trying next...`);
        }
      } catch (err) {
        console.warn(`Error connecting to Voice API mode ${mode}:`, err);
      }
    }

    if (!audioResponse) {
      throw new Error("All voice models in the fallback sweep list failed.");
    }

    res.setHeader("Content-Type", audioResponse.headers.get("content-type") || "audio/mpeg");
    res.setHeader("X-Voice-Mode-Used", successfulMode);

    const arrayBuffer = await audioResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    res.send(buffer);

  } catch (error: any) {
    console.error("Voice Proxy Route Error:", error);
    res.status(500).json({ error: error.message || "Failed to generate TTS audio" });
  }
});

// Main Chat & Educational Action Router (Powered by Cloudflare Multi-Agent Architecture)
app.post("/api/chat", async (req, res) => {
  try {
    const { message, ocr_text, has_image, mode, history, user_profile } = req.body;
    const requestMode = normalizeRequestMode(mode);
    const profileContext = buildUserProfileContext(user_profile);
    const autonomousToolData = await gatherAutonomousToolContext(message || "", requestMode);

    // Prepare full context containing history & OCR text
    const ocrContext = ocr_text ? `[Client-side Extracted OCR Text from uploaded document/image]:\n${ocr_text}\n\n` : "";
    const prompt = `${ocrContext}${message || "Analyze the provided material."}`;

    // Map conversation history into context
    let contextPrompt = "";
    if (history && history.length > 0) {
      contextPrompt += "Here is the conversation history for context:\n";
      for (const h of history) {
        const speaker = h.role === "user" ? "User" : "Assistant";
        contextPrompt += `${speaker}: ${h.content}\n`;
      }
      contextPrompt += "\nNow answer the user's latest message based on this history context.\n";
    }
    if (profileContext) {
      contextPrompt += `${profileContext}`;
    }
    if (autonomousToolData.toolContext) {
      contextPrompt += `${autonomousToolData.toolContext}`;
    }
    contextPrompt += `${prompt}`;

    // Mode specific background agentic execution logic
    if (mode === "triple") {
      // ⚡ PARALLEL MODE: Generate multiple outputs from 5 distinct perspectives in parallel
      const start = Date.now();
      const parallelModels = [
        {
          tier: "detailed",
          sys: "You are an exhaustive academic scholar. Provide an extremely detailed, comprehensive, and deep academic explanation of the user's topic. Break down all sub-topics, historic context, theories, and advanced details thoroughly. Use rich lists and tables. CRITICAL: Identify the language of the user's query and respond strictly in that exact same language (e.g., Bengali, English, Banglish, Spanish, etc.).",
        },
        {
          tier: "simple",
          sys: "You are an expert at simplifying complex ideas (Explain Like I'm 5). Explain the user's topic in extremely clear, simple, friendly language. Use everyday analogies and completely avoid jargon or complex terms. CRITICAL: Identify the language of the user's query and respond strictly in that exact same language (e.g., Bengali, English, Banglish, Spanish, etc.).",
        },
        {
          tier: "exam",
          sys: "You are a professional board exam evaluator. Provide a structured response tailored to scoring full marks in exams. Use bullet points, bold keywords, precise formal definitions, memory hacks, and typical expected exam question sub-points. CRITICAL: Identify the language of the user's query and respond strictly in that exact same language (e.g., Bengali, English, Banglish, Spanish, etc.).",
        },
        {
          tier: "reallife",
          sys: "You are a practical engineer and industry practitioner. Explain this topic focusing entirely on physical, real-life examples, case studies, industries that use it, and how it is applied in the actual world. CRITICAL: Identify the language of the user's query and respond strictly in that exact same language (e.g., Bengali, English, Banglish, Spanish, etc.).",
        },
        {
          tier: "memory",
          sys: "You are a memory grandmaster. Explain this topic using creative mnemonic devices, acronyms, catchy rhymes, analogies, and cognitive association tricks designed for instant memorization. CRITICAL: Identify the language of the user's query and respond strictly in that exact same language (e.g., Bengali, English, Banglish, Spanish, etc.).",
        }
      ];

      const promises = parallelModels.map(async (m) => {
        const modelStart = Date.now();
        const fullPrompt = `${m.sys}\n\nUser query:\n${contextPrompt}`;
        const result = await callCloudflareWorker(fullPrompt, "triple");
        const text = result.response;
        const duration = Date.now() - modelStart;
        const tokens = Math.ceil(text.length / 4);
        return {
          tier: m.tier,
          reply: text,
          model: result.model,
          latency_ms: duration,
          tokens_used: tokens,
        };
      });

      const results = await Promise.all(promises);
      const output: Record<string, any> = {};
      results.forEach((r) => {
        output[r.tier] = r;
      });

      return res.json({
        mode: "triple",
        model_responses: output,
        tool_used: autonomousToolData.usedTools.join(", "),
        latency_ms: Date.now() - start,
      });

    } else if (mode === "quiz") {
      // 📋 QUIZ MODE: Interactive MCQ, True/False, and Assertion-Reasoning JSON generator
      const start = Date.now();
      const quizPrompt = `Generate an interactive multiple-choice quiz based on the following material:
${contextPrompt}

Please output exactly 5 challenging, educational, and high-quality questions. Ensure these questions are completely unique and different from any quiz questions that might appear in the conversation history context.
Include various question styles (e.g. MCQ, True/False, Fill in the blanks, Assertion-Reasoning).

CRITICAL LANGUAGE RULE:
Identify the language of the user's latest query (e.g., Bengali, English, Banglish, Spanish, etc.). You MUST write the "quiz_title", question text "q", "options" strings, and "explanation" strings in that EXACT same language! Keep only the JSON structure keys ('quiz_title', 'questions', 'q', 'options', 'correct', 'explanation') in English so that the JSON parsers correctly.

CRITICAL RULES FOR OPTIONS:
1. Every option in the "options" array MUST be a fully written-out, real, and meaningful statement.
2. Under NO circumstances should any option be placeholder text (like "Option A", "Option B", "Option C", "Option D", "Choice A", "A", "B", "C", "D").
3. For Assertion-Reasoning questions, use standard complete options list. If the user's language is English, use:
   [
     "Both Assertion and Reason are true and Reason is the correct explanation of Assertion",
     "Both Assertion and Reason are true but Reason is NOT the correct explanation of Assertion",
     "Assertion is true but Reason is false",
     "Assertion is false but Reason is true"
   ]
   If the user's language is Bengali or Banglish, translate these options accurately into that same language so they are fully written out and meaningful, or write option statements specific to the Assertion/Reason content.
4. For True/False questions, provide exactly two options: ["True", "False"] (or translated, e.g. ["সত্য", "মিথ্যা"] if user query is in Bengali).
5. The correct answer index "correct" (0-3) MUST correspond perfectly to the correct choice in your "options" array.

You MUST respond strictly in a valid JSON format matching this schema structure:
{
  "quiz_title": "Descriptive Title of Quiz",
  "questions": [
    {
      "q": "Detailed question text here (e.g. Assertion-Reason: [Statement] Reason: [Explanation])",
      "options": ["Fully formulated answer choice 1", "Fully formulated answer choice 2", "Fully formulated answer choice 3", "Fully formulated answer choice 4"],
      "correct": 0,
      "explanation": "Highly informative step-by-step explanation of why this option is correct."
    }
  ]
}

IMPORTANT OUTPUT SAFETY:
- Return only JSON, nothing else.
- Keep every string value on a single line.
- Never use raw double quotes inside string values unless escaped.
- Do not use markdown code fences.

DO NOT include any markdown code blocks, conversational filler, or intro text. Just return the raw JSON object.`;

      const quizResult = await callCloudflareWorker(quizPrompt, "quiz");
      const text = quizResult.response;

      let parsedQuiz;
      try {
        parsedQuiz = parseQuizPayload(text);
      } catch (jsonErr) {
        parsedQuiz = await repairQuizPayload(text);
      }

      return res.json({
        mode: "quiz",
        quiz_data: parsedQuiz,
        reply: parsedQuiz.quiz_title,
        model: quizResult.model,
        tool_used: autonomousToolData.usedTools.join(", "),
        latency_ms: Date.now() - start,
      });

    } else if (mode === "diagram") {
      // 📊 DIAGRAM MODE: Visual Learning and Mermaid Diagram generator
      const start = Date.now();
      const diagramPrompt = `You are the Visual Learning and Mermaid Diagram generator of the RX AI Engine.
Choose the absolute best visual representation for the topic: Flowchart (graph TD/LR), Mind Map (mindmap), Tree diagram, Timeline, Comparison Table, Process Diagram, Cycle Diagram, Graph, Pyramid, or Network.

Your response MUST consist ONLY of valid Mermaid.js source code.
Do NOT wrap in markdown block backticks (like \`\`\`mermaid). Do NOT write introductory words, conversational filler, or explanations. Just start with the Mermaid.js source code like 'graph TD' or 'mindmap'.

CRITICAL LANGUAGE RULE:
Identify the language of the user's latest query. If the user queried in Bengali or another non-English language, translate all the node labels and connection labels inside the diagram to that language, but keep Mermaid keywords like 'graph TD', 'mindmap', etc. strictly in English.

CRITICAL SYNTAX RULES:
1. You MUST start the output with a valid diagram header like 'graph TD', 'graph LR', 'mindmap', etc. NEVER start directly with node connections.
2. ALWAYS use standard ASCII arrow connectors like '-->' for flowchart arrows, '---' for solid lines, '-.-' for dotted lines.
3. NEVER under any circumstances use Unicode box-drawing or custom line characters (e.g. NEVER use '───>', '➔', '➛', etc.). ONLY use standard ASCII hyphens and greater-than signs ('-->').
4. IMPORTANT: For ALL node text/labels, you MUST enclose the label text inside double quotes to prevent syntax errors caused by parenthesis, brackets, colons, or special characters.
   For example:
   Correct: A["Carbon (element)"] --> B["4 bonds types: single (C-H)"]
   Incorrect: A[Carbon (element)] --> B[4 bonds types: single (C-H)]
5. NEVER use spaces or special characters in the node IDs. For example, use 'A' or 'CarbonNode', never 'Carbon Node'.
6. Ensure all connection labels inside pipes are clean and simple with no extra spaces. For example: A -->|Single bond| B

Material to map:
${contextPrompt}`;

      const diagramResult = await callCloudflareWorker(diagramPrompt, "diagram");
      const text = diagramResult.response;
      let diagramCode = text.trim();
      diagramCode = sanitizeMermaidCode(diagramCode);

      return res.json({
        mode: "diagram",
        reply: "Here is your educational diagram:",
        diagram_code: diagramCode,
        model: diagramResult.model,
        tool_used: autonomousToolData.usedTools.join(", "),
        latency_ms: Date.now() - start,
      });

    } else if (mode === "notes") {
      // 📝 NOTES MODE: Multi-Agent Dual-Step Study Notes compiler
      const start = Date.now();

      // Agent 1: Research & Facts Gathering
      const researchPrompt = `You are the Research Agent. Extract all the key facts, formulas, major definitions, and critical conceptual building blocks on the following topic/material. Be highly accurate and list them clearly:\n\n${contextPrompt}`;
      const factsResult = await callCloudflareWorker(researchPrompt, "notes");
      const facts = factsResult.response;

      // Agent 2: Premium Compiler & Memory Organizer
      const notesPrompt = `You are the Premium Notes Compiler of the RX Educational Engine.
Compile extremely polished, comprehensive study notes based on the research facts provided below.

CRITICAL LANGUAGE RULE:
Identify the language of the user's latest query (e.g., Bengali, English, Banglish, etc.). You MUST write the study notes, headers, definitions, and explanations in that EXACT same language!

Format with structured Markdown headings:
Use # <Title> for the main topic.
Use ## for major sections like Overview, Key Concepts & Definitions.
Use ### for subsections, Examples, Formula Boxes, Mnemonics, Summary, and Quick Revision.
Your output MUST start with:
# [Topic Title]
## Overview
[Paragraph overview]

## Key Concepts & Definitions
- **[Concept name]**: [Definition with bold highlights]

## Formula Box / Essential Facts
[Formulas using LaTeX math blocks if appropriate, or key facts]

## Mnemonics & Memory Tricks
- **[Memory Trick Title]**: [Mnemonic device or memory trick]

## Real-Life Examples & Case Studies
[Clear practical examples]

## Common Mistakes & Exam Tips
* [Tips to avoid mistakes and ace questions]

## Summary & Quick Revision
[Bullet points for fast memorization]

Be structured, complete, and exhaustive. Do not output plain prose or conversational filler.

Research facts to format and compile:
${facts}`;

      const notesResult = await callCloudflareWorker(notesPrompt, "notes");
      let text = notesResult.response;
      if (autonomousToolData.imageMarkdown.length > 0 && /\b(image|photo|picture|show)\b/i.test(message || "")) {
        text += `\n\n${autonomousToolData.imageMarkdown.join("\n")}`;
      }
      const tokens = Math.ceil(text.length / 4);

      return res.json({
        mode: "notes",
        reply: text,
        model: notesResult.model,
        tokens_used: tokens,
        tool_used: autonomousToolData.usedTools.join(", "),
        latency_ms: Date.now() - start,
      });

    } else {
      // 💬 CHAT MODE: Intelligent Triage / Adaptive Tutor Agent
      const start = Date.now();
      const isSimple = message && (message.trim().length < 30 && !message.match(/(solve|explain|how to|why|calculate|derive|physics|chemistry|math|code|program|function|react)/i));

      let finalReply = "";
      let responseModel = MODE_MODEL_ROUTING[requestMode][0];
      if (isSimple) {
        // Simple chat or greeting - 1 agent call to minimize latency
        const simplePrompt = `You are RX AI Study Platform, an advanced chat tutor.
Provide interactive, natural, friendly, and helpful tutoring. Maintain the persona of an encouraging personal academic coach. Keep answers educational and precise.

CRITICAL LANGUAGE RULE:
Identify the language of the user's latest query (e.g., Bengali, English, Banglish, Spanish, etc.) and respond strictly in that exact same language.

IMAGE GENERATION CAPABILITY:
1. You have the special power to generate images/drawings when the user explicitly requests them (e.g., "draw a tree", "show an image of X"), or when discussing highly visual concepts (like cricket, sports, science) if an illustration would be highly helpful.
2. Under other circumstances, do NOT generate images unnecessarily or easily because the image model is of moderate quality.
3. To generate an image, output a standard Markdown image tag containing a Pollinations.ai URL like:
![Description](https://image.pollinations.ai/prompt/{PROMPT}?width=500&height=500&nologo=true&seed={RANDOM_SEED})
Where {PROMPT} is a highly detailed, descriptive English image prompt (e.g., 'cricket batsman playing a shot in a stadium under stadium lights, realistic digital art'), URL-encoded. Keep other query parameters exactly. {RANDOM_SEED} should be a random integer (e.g. 1 to 999999).

User query:
${contextPrompt}`;
        const chatResult = await callCloudflareWorker(simplePrompt, requestMode);
        finalReply = chatResult.response;
        responseModel = chatResult.model;
      } else {
        // Analytical concept or problem solving - 2-Agent chain (Reasoning + Formatting)
        const reasoningPrompt = `You are the Expert Reasoning and Analysis Agent. Solve or analyze the following academic query step-by-step. Break down any math, logic, science, or programming with high precision, clear reasoning, and correct facts:

CRITICAL LANGUAGE RULE:
Identify the language of the user's latest query (e.g., Bengali, English, Banglish, Spanish, etc.) and write your reasoning solution in that exact same language.

User query:
${contextPrompt}`;
        const reasoningResult = await callCloudflareWorker(reasoningPrompt, requestMode);
        const analyticalBreakdown = reasoningResult.response;
        responseModel = reasoningResult.model;

        const tutorPrompt = `You are RX AI Study Platform, an encouraging and highly professional personal academic coach.
Take the following analytical solution/breakdown and translate it into a friendly, beautiful tutoring guide.
Guidelines:
- Maintain your encouraging, friendly tutor persona.
- Use code formatting for code blocks, LaTeX block ($$ ... $$) or inline ($ ... $) for math, markdown tables and lists.
- Include an Answer, clear Examples, an optional Summary, and 2-3 brief follow-up Next Questions.
- CRITICAL LANGUAGE RULE: Respond strictly in the exact same language as the user's latest query (e.g., if user queried in Bengali or Banglish, write the whole response in Bengali or Banglish).

IMAGE GENERATION CAPABILITY:
1. You have the special power to generate images/drawings when the user explicitly requests them (e.g., "draw a tree", "show an image of X"), or when discussing highly visual concepts (like cricket, sports, science) if an illustration would be highly helpful.
2. Under other circumstances, do NOT generate images unnecessarily or easily because the image model is of moderate quality.
3. To generate an image, output a standard Markdown image tag containing a Pollinations.ai URL like:
![Description](https://image.pollinations.ai/prompt/{PROMPT}?width=500&height=500&nologo=true&seed={RANDOM_SEED})
Where {PROMPT} is a highly detailed, descriptive English image prompt (e.g., 'cricket batsman playing a shot in a stadium under stadium lights, realistic digital art'), URL-encoded. Keep other query parameters exactly. {RANDOM_SEED} should be a random integer (e.g. 1 to 999999).

Analytical breakdown:
${analyticalBreakdown}`;
        const tutorResult = await callCloudflareWorker(tutorPrompt, requestMode);
        finalReply = tutorResult.response;
        responseModel = tutorResult.model;
      }

      if (autonomousToolData.imageMarkdown.length > 0 && /\b(image|photo|picture|show|pic)\b/i.test(message || "")) {
        finalReply += `\n\n${autonomousToolData.imageMarkdown.join("\n")}`;
      }

      const tokens = Math.ceil(finalReply.length / 4);

      return res.json({
        mode: "single",
        reply: finalReply,
        model: responseModel,
        tokens_used: tokens,
        tool_used: autonomousToolData.usedTools.join(", "),
        latency_ms: Date.now() - start,
      });
    }

  } catch (error: any) {
    console.error("Cloudflare Multi-Agent Platform Error:", error);
    res.status(500).json({
      error: error.message || "An error occurred with the Cloudflare Multi-Agent service.",
      code: "API_ERROR",
    });
  }
});

// Start server
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
