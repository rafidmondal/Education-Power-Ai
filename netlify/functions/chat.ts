import type { Handler } from "@netlify/functions";
import {
  normalizeRequestMode,
  buildUserProfileContext,
  gatherAutonomousToolContext,
  callCloudflareWorker,
  parseQuizPayload,
  repairQuizPayload,
  sanitizeMermaidCode,
  REQUEST_TIME_BUDGET_MS,
} from "./_shared";

function jsonResponse(statusCode: number, payload: unknown) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };
}

// POST /api/chat — Main Chat & Educational Action Router (Powered by the Cloudflare
// Multi-Agent Architecture). This is the original Express route body unchanged, just
// adapted to the Netlify Functions event/response shape instead of req/res.
export const handler: Handler = async (event) => {
  let requestBody: any = {};
  try {
    requestBody = event.body ? JSON.parse(event.body) : {};
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  // Shared wall-clock deadline for this whole request. Every callCloudflareWorker() call
  // below (including multi-step chains) is passed this same deadline so a slow first step
  // can't silently eat the entire Netlify Function time budget and leave nothing for the
  // rest of the chain — see _shared.ts for details.
  const requestDeadline = Date.now() + REQUEST_TIME_BUDGET_MS;

  try {
    const { message, ocr_text, has_image, mode, history, user_profile } = requestBody;
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
        const result = await callCloudflareWorker(fullPrompt, "triple", requestDeadline);
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

      return jsonResponse(200, {
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

      const quizResult = await callCloudflareWorker(quizPrompt, "quiz", requestDeadline);
      const text = quizResult.response;

      let parsedQuiz;
      try {
        parsedQuiz = parseQuizPayload(text);
      } catch (jsonErr) {
        parsedQuiz = await repairQuizPayload(text, requestDeadline);
      }

      return jsonResponse(200, {
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

      const diagramResult = await callCloudflareWorker(diagramPrompt, "diagram", requestDeadline);
      const text = diagramResult.response;
      let diagramCode = text.trim();
      diagramCode = sanitizeMermaidCode(diagramCode);

      return jsonResponse(200, {
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
      const factsResult = await callCloudflareWorker(researchPrompt, "notes", requestDeadline);
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

      const notesResult = await callCloudflareWorker(notesPrompt, "notes", requestDeadline);
      let text = notesResult.response;
      if (autonomousToolData.imageMarkdown.length > 0 && /\b(image|photo|picture|show)\b/i.test(message || "")) {
        text += `\n\n${autonomousToolData.imageMarkdown.join("\n")}`;
      }
      const tokens = Math.ceil(text.length / 4);

      return jsonResponse(200, {
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
      let responseModel = "auto";
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
        const chatResult = await callCloudflareWorker(simplePrompt, requestMode, requestDeadline);
        finalReply = chatResult.response;
        responseModel = chatResult.model;
      } else {
        // Analytical concept or problem solving - 2-Agent chain (Reasoning + Formatting)
        const reasoningPrompt = `You are the Expert Reasoning and Analysis Agent. Solve or analyze the following academic query step-by-step. Break down any math, logic, science, or programming with high precision, clear reasoning, and correct facts:

CRITICAL LANGUAGE RULE:
Identify the language of the user's latest query (e.g., Bengali, English, Banglish, Spanish, etc.) and write your reasoning solution in that exact same language.

User query:
${contextPrompt}`;
        const reasoningResult = await callCloudflareWorker(reasoningPrompt, requestMode, requestDeadline);
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
        const tutorResult = await callCloudflareWorker(tutorPrompt, requestMode, requestDeadline);
        finalReply = tutorResult.response;
        responseModel = tutorResult.model;
      }

      if (autonomousToolData.imageMarkdown.length > 0 && /\b(image|photo|picture|show|pic)\b/i.test(message || "")) {
        finalReply += `\n\n${autonomousToolData.imageMarkdown.join("\n")}`;
      }

      const tokens = Math.ceil(finalReply.length / 4);

      return jsonResponse(200, {
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
    return jsonResponse(500, {
      error: error.message || "An error occurred with the Cloudflare Multi-Agent service.",
      code: "API_ERROR",
    });
  }
};
