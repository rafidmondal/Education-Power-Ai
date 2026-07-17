import React, { useEffect, useRef, useState } from "react";
import { Message, UserPrefs } from "../types";
import {
  AlertTriangle,
  Check,
  CheckSquare,
  Columns,
  Copy,
  Info,
  Layout,
  LayoutGrid,
  Loader,
  RefreshCw,
  Send,
  Sparkles,
  Star,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import QuizView from "./QuizView";
import DiagramView from "./DiagramView";
import NotesView from "./NotesView";

interface ChatWindowProps {
  messages: Message[];
  activeMode: "single" | "triple" | "quiz" | "diagram" | "notes";
  onChangeMode: (mode: "single" | "triple" | "quiz" | "diagram" | "notes") => void;
  selectedModel: string;
  onChangeModel: (model: string) => void;
  onSendMessage: (text: string) => void;
  isLoading: boolean;
  userPrefs: UserPrefs;
  onQuizCompleted: (score: number, total: number) => void;
  onExitQuizMode: () => void;
  onGenerateFreshQuiz: () => void;
}

export default function ChatWindow(props: ChatWindowProps) {
  const {
    messages,
    activeMode,
    onChangeMode,
    onSendMessage,
    isLoading,
    userPrefs,
    onQuizCompleted,
    onExitQuizMode,
    onGenerateFreshQuiz,
  } = props;

  const [input, setInput] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeTripleTab, setActiveTripleTab] = useState<
    "detailed" | "simple" | "exam" | "reallife" | "memory"
  >("detailed");
  const [tripleCompareMode, setTripleCompareMode] = useState(false);
  const [votedTiers, setVotedTiers] = useState<Record<string, string>>({});
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [loadingVoiceId, setLoadingVoiceId] = useState<string | null>(null);
  const [dismissedQuizMessageId, setDismissedQuizMessageId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading, activeMode]);

  const handlePlayVoice = async (messageId: string, text: string) => {
    if (playingMessageId === messageId) {
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current = null;
      }
      setPlayingMessageId(null);
      return;
    }

    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current = null;
    }

    setPlayingMessageId(null);
    setLoadingVoiceId(messageId);

    try {
      const cleanText = text
        .replace(/<[^>]*>/g, "")
        .replace(/\$\$[\s\S]*?\$\$/g, "")
        .replace(/\$[^\$\n]+?\$/g, "")
        .replace(/\\\[[\s\S]*?\\\]/g, "")
        .replace(/\\\([\s\S]*?\\\)/g, "")
        .replace(/\*\*+(.*?)\*\*+/g, "$1")
        .trim();

      const res = await fetch(`/api/voice?text=${encodeURIComponent(cleanText)}&mode=en_uk_f_sonia`);
      if (!res.ok) {
        throw new Error("Failed to load voice audio file");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      activeAudioRef.current = audio;

      audio.onplay = () => {
        setLoadingVoiceId(null);
        setPlayingMessageId(messageId);
      };

      audio.onended = () => {
        setPlayingMessageId(null);
        activeAudioRef.current = null;
      };

      audio.onerror = () => {
        setLoadingVoiceId(null);
        setPlayingMessageId(null);
        activeAudioRef.current = null;
      };

      await audio.play();
    } catch (error) {
      console.error("Error playing voice TTS:", error);
      setLoadingVoiceId(null);
      setPlayingMessageId(null);
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    onSendMessage(text);
    setInput("");
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const renderAssistantActions = (actionId: string, text: string) => (
    <div className="flex items-center gap-2 pt-2 pl-1">
      <button
        type="button"
        onClick={() => handlePlayVoice(actionId, text)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-bg-primary border border-border-main text-[10px] text-text-secondary hover:text-white transition-all"
        title={playingMessageId === actionId ? "Stop voice playback" : "Play voice"}
      >
        {loadingVoiceId === actionId ? (
          <Loader className="w-3 h-3 animate-spin" />
        ) : playingMessageId === actionId ? (
          <VolumeX className="w-3 h-3" />
        ) : (
          <Volume2 className="w-3 h-3" />
        )}
        <span>{playingMessageId === actionId ? "Stop" : "Voice"}</span>
      </button>

      <button
        type="button"
        onClick={() => handleCopy(text, actionId)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-bg-primary border border-border-main text-[10px] text-text-secondary hover:text-white transition-all"
        title="Copy response"
      >
        {copiedId === actionId ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
        <span>{copiedId === actionId ? "Copied" : "Copy"}</span>
      </button>
    </div>
  );

  const renderMessageContent = (text: string) => {
    try {
      const placeholders: { type: "inline" | "block"; formula: string }[] = [];
      let processed = text;

      processed = processed.replace(/\\\[([\s\S]*?)\\\]/g, (_, formula) => {
        const index = placeholders.length;
        placeholders.push({ type: "block", formula });
        return `\n\n<div class="latex-placeholder-block" data-index="${index}"></div>\n\n`;
      });

      processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (_, formula) => {
        const index = placeholders.length;
        placeholders.push({ type: "block", formula });
        return `\n\n<div class="latex-placeholder-block" data-index="${index}"></div>\n\n`;
      });

      processed = processed.replace(/\\\(([\s\S]*?)\\\)/g, (_, formula) => {
        const index = placeholders.length;
        placeholders.push({ type: "inline", formula });
        return `<span class="latex-placeholder-inline" data-index="${index}"></span>`;
      });

      processed = processed.replace(/\$([^\$\n]+?)\$/g, (_, formula) => {
        const index = placeholders.length;
        placeholders.push({ type: "inline", formula });
        return `<span class="latex-placeholder-inline" data-index="${index}"></span>`;
      });

      const showdown = (window as any).showdown;
      let html = processed;

      if (showdown) {
        const converter = new showdown.Converter({
          tables: true,
          simplifiedAutoLink: true,
          strikethrough: true,
          tasklists: true,
        });
        html = converter.makeHtml(processed);
      }

      const DOMPurify = (window as any).DOMPurify;
      if (DOMPurify) {
        html = DOMPurify.sanitize(html, {
          ALLOWED_TAGS: [
            "a",
            "b",
            "i",
            "em",
            "strong",
            "p",
            "br",
            "ul",
            "ol",
            "li",
            "span",
            "div",
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
            "h6",
            "table",
            "tr",
            "td",
            "th",
            "blockquote",
            "pre",
            "code",
            "img",
          ],
          ALLOWED_CLASSES: {
            div: ["latex-placeholder-block"],
            span: ["latex-placeholder-inline"],
          },
          ADD_ATTR: ["data-index", "href", "target", "rel", "src", "alt", "title"],
        });
      }

      const katex = (window as any).katex;
      if (katex) {
        html = html.replace(/<div class="latex-placeholder-block" data-index="(\d+)"><\/div>/g, (_, idxStr) => {
          const idx = Number.parseInt(idxStr, 10);
          const placeholder = placeholders[idx];
          if (!placeholder) return _;

          try {
            const rendered = katex.renderToString(placeholder.formula, {
              displayMode: true,
              throwOnError: false,
            });
            return `<div class="katex-display-container py-2 overflow-x-auto my-3 p-3 bg-white/[0.02] border border-white/5 rounded-xl text-center flex justify-center">${rendered}</div>`;
          } catch {
            return `<div class="text-error p-2 text-xs">Error rendering LaTeX: ${placeholder.formula}</div>`;
          }
        });

        html = html.replace(/<span class="latex-placeholder-inline" data-index="(\d+)"><\/span>/g, (_, idxStr) => {
          const idx = Number.parseInt(idxStr, 10);
          const placeholder = placeholders[idx];
          if (!placeholder) return _;

          try {
            const rendered = katex.renderToString(placeholder.formula, {
              displayMode: false,
              throwOnError: false,
            });
            return `<span class="katex-inline-container inline-block px-1 font-mono">${rendered}</span>`;
          } catch {
            return `<span class="text-error font-mono text-[10px]">[LaTeX Error]</span>`;
          }
        });
      }

      return html;
    } catch (error) {
      console.warn("Markdown/LaTeX render failed", error);
      return text;
    }
  };

  const resolveMessageMode = (msg: Message, idx: number) => {
    if (msg.mode) {
      return msg.mode;
    }

    if (msg.role === "user") {
      const nextMessage = messages[idx + 1];
      if (!nextMessage) {
        return "single";
      }

      if (nextMessage.role === "assistant") {
        const nextMode =
          nextMessage.metadata?.mode ||
          (nextMessage.metadata?.quiz_data
            ? "quiz"
            : nextMessage.metadata?.diagram_code
              ? "diagram"
              : nextMessage.metadata?.model_responses
                ? "triple"
                : "single");

        return nextMode === "chat" ? "single" : nextMode;
      }

      return "single";
    }

    const messageMode =
      msg.metadata?.mode ||
      (msg.metadata?.quiz_data
        ? "quiz"
        : msg.metadata?.diagram_code
          ? "diagram"
          : msg.metadata?.model_responses
            ? "triple"
            : "single");

    return messageMode === "chat" ? "single" : messageMode;
  };

  const filteredMessages = messages.filter((msg, idx) => resolveMessageMode(msg, idx) === activeMode);
  const latestQuizMessage =
    activeMode === "quiz"
      ? [...filteredMessages].reverse().find((msg) => msg.role === "assistant" && msg.metadata?.quiz_data)
      : undefined;
  const latestQuizTopic =
    activeMode === "quiz"
      ? ([...filteredMessages].reverse().find((msg) => msg.role === "user")?.content || "")
          .replace(/^New Questions:\s*/i, "")
          .trim()
      : "";
  const latestQuizError =
    activeMode === "quiz"
      ? [...filteredMessages].reverse().find((msg) => msg.role === "system")
      : undefined;
  const visibleQuizMessage =
    latestQuizMessage && latestQuizMessage.id !== dismissedQuizMessageId ? latestQuizMessage : undefined;

  useEffect(() => {
    if (activeMode !== "quiz") {
      setDismissedQuizMessageId(null);
    }
  }, [activeMode]);

  const renderLoadingState = (wrapperClassName = "mr-auto") => (
    <div className={`flex gap-3 max-w-lg animate-slide-left items-start ${wrapperClassName}`}>
      <div className="orbit-3 orbit-3--compact" aria-hidden="true">
        <div className="core" />
        <div className="ring"><i /></div>
        <div className="ring r2"><i /></div>
      </div>
      <div className="space-y-2 pt-0.5">
        <div className="bar-7" aria-hidden="true">
          <div className="label">GENERATING RESPONSE</div>
          <div className="track" />
        </div>
        <div className="glass-soft rounded-[20px] px-4 py-2.5 text-[11px] text-text-secondary select-none">
          RX companion is preparing a polished answer with context and tools.
        </div>
      </div>
    </div>
  );

  const renderEmptyState = () => {
    if (activeMode === "single") {
      return (
        <>
          <div className="w-12 h-12 rounded-2xl bg-accent-secondary/15 flex items-center justify-center text-accent-secondary mb-4 glow-box-blue animate-pulse">
            <Sparkles className="w-6 h-6" />
          </div>
          <h2 className="text-white font-bold font-display text-lg tracking-tight">RX Chat Tutor</h2>
          <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">
            Start an interactive tutoring session. Ask academic questions, translate text, or break down math step-by-step.
          </p>
        </>
      );
    }

    if (activeMode === "notes") {
      return (
        <>
          <div className="w-12 h-12 rounded-2xl bg-amber-500/15 flex items-center justify-center text-amber-400 mb-4 glow-box-amber animate-pulse">
            <Layout className="w-6 h-6" />
          </div>
          <h2 className="text-white font-bold font-display text-lg tracking-tight">Premium Study Notes</h2>
          <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">
            Type any topic, chapter, or scientific concept to compile highly structured study notebooks, complete with mnemonics and exam tips.
          </p>
        </>
      );
    }

    if (activeMode === "diagram") {
      return (
        <>
          <div className="w-12 h-12 rounded-2xl bg-pink-500/15 flex items-center justify-center text-pink-400 mb-4 glow-box-pink animate-pulse">
            <Columns className="w-6 h-6" />
          </div>
          <h2 className="text-white font-bold font-display text-lg tracking-tight">Concept Diagram Generator</h2>
          <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">
            Request a flowchart, mindmap, process cycle, or tree. The AI will draw visual models with Mermaid instantly.
          </p>
        </>
      );
    }

    return (
      <>
        <div className="w-12 h-12 rounded-2xl bg-indigo-500/15 flex items-center justify-center text-indigo-400 mb-4 glow-box-indigo animate-pulse">
          <LayoutGrid className="w-6 h-6" />
        </div>
        <h2 className="text-white font-bold font-display text-lg tracking-tight">Parallel Perspectives</h2>
        <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">
          Get answers through detailed, simple, exam, practical, and memory-focused study frames.
        </p>
      </>
    );
  };

  return (
    <div id="rx-chat-window" className="flex-1 flex flex-col h-full bg-transparent overflow-hidden">
      <div className="p-4 border-b border-border-main glass-panel flex items-center justify-between select-none shrink-0 gap-3">
        <div className="flex glass-soft p-1 rounded-2xl">
          {(["single", "triple", "quiz", "diagram", "notes"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => onChangeMode(mode)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                activeMode === mode ? "liquid-button text-white shadow-md glow-text-blue" : "text-text-secondary hover:text-white"
              }`}
            >
              {mode === "single" ? "Chat" : mode === "triple" ? "Parallel" : mode === "quiz" ? "Quiz" : mode === "diagram" ? "Diagram" : "Notes"}
            </button>
          ))}
        </div>
      </div>

      {activeMode === "quiz" ? (
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="min-h-full max-w-4xl mx-auto flex flex-col gap-5">
            <div className="glass-panel rounded-[28px] p-4 md:p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-400/20 flex items-center justify-center text-emerald-400">
                    <CheckSquare className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-white font-bold font-display text-lg tracking-tight">Quiz Practice Lab</h2>
                    <p className="text-[11px] text-text-secondary">One clean set, five questions, no mixed chat bubbles.</p>
                  </div>
                </div>
                {latestQuizTopic && (
                  <div className="inline-flex max-w-full items-center rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.18em] text-emerald-300">
                    Topic: {latestQuizTopic}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onGenerateFreshQuiz}
                  disabled={!latestQuizTopic || isLoading}
                  className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/20 bg-cyan-500/10 px-4 py-2 text-[11px] font-semibold text-cyan-200 transition-all hover:bg-cyan-500/15 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
                  <span>New Questions</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (latestQuizMessage?.id) {
                      setDismissedQuizMessageId(latestQuizMessage.id);
                    }
                    onExitQuizMode();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border-main bg-bg-primary px-4 py-2 text-[11px] font-semibold text-text-secondary transition-all hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Exit</span>
                </button>
              </div>
            </div>

            {visibleQuizMessage?.metadata?.quiz_data ? (
              <>
                <QuizView
                  quizData={visibleQuizMessage.metadata.quiz_data}
                  onQuizCompleted={onQuizCompleted}
                  userPrefs={userPrefs}
                  actionId={visibleQuizMessage.id}
                  onCopyText={handleCopy}
                  onPlayVoice={handlePlayVoice}
                  copiedId={copiedId}
                  playingMessageId={playingMessageId}
                  loadingVoiceId={loadingVoiceId}
                />

                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={onGenerateFreshQuiz}
                    disabled={!latestQuizTopic || isLoading}
                    className="inline-flex items-center gap-2 rounded-2xl border border-emerald-400/20 bg-[linear-gradient(135deg,rgba(16,185,129,0.14),rgba(34,211,238,0.12))] px-5 py-3 text-xs font-semibold text-white shadow-[0_12px_30px_rgba(16,185,129,0.12)] transition-all hover:translate-y-[-1px] disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                    <span>Generate New Questions On This Topic</span>
                  </button>
                </div>

                {isLoading && <div className="pt-1">{renderLoadingState("mx-auto")}</div>}

                {latestQuizError && !isLoading && (
                  <div className="glass-soft border border-red-400/20 rounded-[24px] p-4 flex items-start gap-3 text-xs text-red-200">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <p>{latestQuizError.content}</p>
                  </div>
                )}
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="w-full max-w-2xl glass-panel rounded-[32px] p-6 md:p-8 text-center">
                  <div className="w-16 h-16 rounded-[24px] bg-emerald-500/12 border border-emerald-400/20 flex items-center justify-center text-emerald-400 mx-auto mb-5 glow-box-green">
                    <CheckSquare className="w-8 h-8" />
                  </div>

                  <h3 className="text-white font-bold font-display text-2xl tracking-tight">Generate a focused quiz set</h3>
                  <p className="text-sm text-text-secondary mt-2 max-w-xl mx-auto leading-relaxed">
                    Enter a topic, chapter, or concept. RX Study AI will return one dedicated 5-question quiz with explanations, without mixing it into normal chat.
                  </p>

                  <form onSubmit={handleSubmit} className="mt-6 max-w-xl mx-auto flex gap-2 relative">
                    <input
                      type="text"
                      disabled={isLoading}
                      placeholder="Example: Photosynthesis, SSC Physics Chapter 4, Human Heart..."
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      className="w-full glass-input rounded-[24px] pl-5 pr-14 py-4 text-sm text-white outline-none focus:border-emerald-300/25 disabled:opacity-50"
                    />

                    <button
                      type="submit"
                      disabled={!input.trim() || isLoading}
                      className="absolute right-2 top-2 liquid-button p-3 text-white rounded-[18px] transition-colors disabled:opacity-40"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </form>

                  {latestQuizError && (
                    <div className="mt-5 glass-soft border border-red-400/20 rounded-[24px] p-4 flex items-start gap-3 text-left text-xs text-red-200">
                      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                      <p>{latestQuizError.content}</p>
                    </div>
                  )}

                  {isLoading && <div className="mt-6 flex justify-center">{renderLoadingState("mx-auto")}</div>}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {filteredMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto p-8 select-none my-auto">
                {renderEmptyState()}
              </div>
            ) : (
              filteredMessages.map((msg) => {
                const isUser = msg.role === "user";

                if (msg.metadata?.quiz_data) {
                  return (
                    <div key={msg.id} className="animate-fade py-2">
                      <QuizView
                        quizData={msg.metadata.quiz_data}
                        onQuizCompleted={onQuizCompleted}
                        userPrefs={userPrefs}
                        actionId={msg.id}
                        onCopyText={handleCopy}
                        onPlayVoice={handlePlayVoice}
                        copiedId={copiedId}
                        playingMessageId={playingMessageId}
                        loadingVoiceId={loadingVoiceId}
                      />
                    </div>
                  );
                }

                if (msg.metadata?.diagram_code) {
                  return (
                    <div key={msg.id} className="animate-fade py-2">
                      <DiagramView
                        code={msg.metadata.diagram_code}
                        actionId={msg.id}
                        onCopyText={handleCopy}
                        onPlayVoice={handlePlayVoice}
                        copiedId={copiedId}
                        playingMessageId={playingMessageId}
                        loadingVoiceId={loadingVoiceId}
                      />
                    </div>
                  );
                }

                if (!isUser && (msg.metadata?.notes || msg.metadata?.mode === "notes")) {
                  return (
                    <div key={msg.id} className="animate-fade py-2">
                      <NotesView
                        content={msg.content}
                        modelName={msg.model}
                        timestamp={msg.timestamp}
                        actionId={msg.id}
                        onCopyText={handleCopy}
                        onPlayVoice={handlePlayVoice}
                        copiedId={copiedId}
                        playingMessageId={playingMessageId}
                        loadingVoiceId={loadingVoiceId}
                      />
                    </div>
                  );
                }

                if (msg.metadata?.model_responses) {
                  const responseObject = msg.metadata.model_responses as Record<string, { reply: string }>;
                  const voted = votedTiers[msg.id];
                  const tiers = ["detailed", "simple", "exam", "reallife", "memory"] as const;
                  const tierLabels: Record<string, string> = {
                    detailed: "Detailed",
                    simple: "Simple",
                    exam: "Exam",
                    reallife: "Practical",
                    memory: "Mnemonics",
                  };

                  return (
                    <div key={msg.id} className="glass-panel rounded-[24px] p-4 space-y-4 animate-fade">
                      <div className="flex items-center justify-between border-b border-border-main pb-2.5">
                        <div className="flex items-center gap-1.5 select-none">
                          <LayoutGrid className="w-4 h-4 text-accent-secondary" />
                          <span className="text-xs font-bold font-display text-white uppercase tracking-wider">Parallel Multi-Perspectives</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => setTripleCompareMode((current) => !current)}
                          className="p-1 rounded bg-bg-tertiary text-text-secondary hover:text-white transition-colors"
                          title="Toggle Bento Grid / Tabbed Mode"
                        >
                          {tripleCompareMode ? <Layout className="w-3.5 h-3.5" /> : <Columns className="w-3.5 h-3.5" />}
                        </button>
                      </div>

                      {tripleCompareMode ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {tiers.map((tier) => {
                            const response = responseObject[tier];
                            if (!response) return null;

                            return (
                              <div key={tier} className="glass-soft rounded-2xl p-3 flex flex-col h-96 overflow-y-auto">
                                <div className="flex items-center justify-between border-b border-border-main pb-1.5 mb-2 shrink-0">
                                  <span className="text-[10px] font-mono font-bold text-accent-secondary uppercase">{tierLabels[tier]}</span>
                                  <button
                                    type="button"
                                    onClick={() => setVotedTiers((current) => ({ ...current, [msg.id]: tier }))}
                                    className="p-0.5 rounded text-text-secondary hover:text-accent-tertiary"
                                    title="Vote this perspective as best"
                                  >
                                    <Star className={`w-3.5 h-3.5 ${voted === tier ? "text-accent-tertiary fill-accent-tertiary" : ""}`} />
                                  </button>
                                </div>

                                <div
                                  className="text-xs text-text-primary leading-relaxed markdown-body flex-1 overflow-y-auto"
                                  dangerouslySetInnerHTML={{ __html: renderMessageContent(response.reply) }}
                                />
                                {renderAssistantActions(`${msg.id}:${tier}`, response.reply)}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex bg-bg-primary p-1 border border-border-main rounded-xl select-none w-max flex-wrap gap-1">
                            {tiers.map((tier) => {
                              const response = responseObject[tier];
                              if (!response) return null;

                              return (
                                <button
                                  key={tier}
                                  type="button"
                                  onClick={() => setActiveTripleTab(tier)}
                                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                                    activeTripleTab === tier ? "bg-bg-tertiary text-white border border-border-main" : "text-text-secondary hover:text-white"
                                  }`}
                                >
                                  {tierLabels[tier]}
                                </button>
                              );
                            })}
                          </div>

                          {(() => {
                            const currentTier = responseObject[activeTripleTab] ? activeTripleTab : tiers.find((tier) => responseObject[tier]) || "detailed";
                            const response = responseObject[currentTier];
                            if (!response) return null;

                            return (
                              <div className="glass-soft p-4 rounded-2xl space-y-3 animate-fade relative">
                                <button
                                  type="button"
                                  onClick={() => setVotedTiers((current) => ({ ...current, [msg.id]: currentTier }))}
                                  className="absolute top-3 right-3 flex items-center gap-1 bg-bg-primary/50 px-2 py-1 rounded-lg text-[10px] text-text-secondary hover:text-accent-tertiary transition-colors"
                                >
                                  <Star className={`w-3 h-3 ${voted === currentTier ? "text-accent-tertiary fill-accent-tertiary" : ""}`} />
                                  {voted === currentTier ? "Voted Best" : "Vote Best"}
                                </button>

                                <div
                                  className="text-xs text-text-primary leading-relaxed markdown-body"
                                  dangerouslySetInnerHTML={{ __html: renderMessageContent(response.reply) }}
                                />
                                {renderAssistantActions(`${msg.id}:${currentTier}`, response.reply)}
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <div
                    key={msg.id}
                    className={`flex gap-3 max-w-3xl ${isUser ? "ml-auto flex-row-reverse animate-slide-right" : "mr-auto animate-slide-left"}`}
                  >
                    <div
                      className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center font-bold text-xs select-none ${
                        isUser ? "bg-accent-primary text-white font-display" : "bg-bg-tertiary border border-border-main text-accent-secondary"
                      }`}
                    >
                      {isUser ? "U" : "AI"}
                    </div>

                    <div className="space-y-1 max-w-full">
                      <div
                        className={`rounded-[22px] p-3.5 text-xs border backdrop-blur-xl ${
                          isUser
                            ? "bg-[linear-gradient(135deg,rgba(6,182,212,0.18),rgba(99,102,241,0.2))] text-white border-cyan-300/12 shadow-[0_14px_30px_rgba(8,145,178,0.12)]"
                            : "bg-[linear-gradient(180deg,rgba(20,26,42,0.82),rgba(13,18,32,0.72))] text-text-primary border-border-main shadow-[0_16px_36px_rgba(0,0,0,0.18)]"
                        }`}
                      >
                        <div
                          className="markdown-body leading-relaxed select-text"
                          dangerouslySetInnerHTML={{ __html: renderMessageContent(msg.content) }}
                        />
                      </div>

                      {!isUser && renderAssistantActions(msg.id, msg.content)}
                    </div>
                  </div>
                );
              })
            )}

            {isLoading && renderLoadingState()}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 border-t border-border-main glass-panel shrink-0 select-none">
            <form onSubmit={handleSubmit} className="flex gap-2 relative">
              <input
                type="text"
                disabled={isLoading}
                placeholder={
                  activeMode === "diagram"
                    ? "Enter a topic to generate a detailed Mermaid diagram..."
                    : activeMode === "notes"
                      ? "Enter study topic to generate structured notes..."
                      : "Ask your AI study companion anything..."
                }
                value={input}
                onChange={(event) => setInput(event.target.value)}
                className="w-full glass-input rounded-[22px] pl-4 pr-14 py-3.5 text-xs text-white outline-none focus:border-cyan-300/25 disabled:opacity-50"
              />

              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="absolute right-2 top-2 liquid-button p-2.5 text-white rounded-[16px] transition-colors disabled:opacity-40"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>

            <div className="flex items-center gap-1 justify-center mt-2 text-[10px] text-text-muted">
              <Info className="w-3 h-3" />
              <span>Formulas render with LaTeX, diagrams render with Mermaid SVG, and quizzes are fully interactive.</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
