import React, { useState } from "react";
import { 
  FileText, Copy, Check, Download, BookOpen, Highlighter, Search, Tag, Volume2, VolumeX, Loader
} from "lucide-react";

interface NotesViewProps {
  content: string;
  modelName?: string;
  timestamp?: string;
  actionId?: string;
  onCopyText?: (text: string, id: string) => void;
  onPlayVoice?: (id: string, text: string) => void;
  copiedId?: string | null;
  playingMessageId?: string | null;
  loadingVoiceId?: string | null;
}

const THEMES = {
  yellow: {
    textAccent: "text-amber-300",
    bgAccent: "bg-amber-500/15",
    heading1: "text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-400",
    heading2: "bg-gradient-to-r from-amber-500 to-orange-500",
    bulletDot: "bg-amber-400",
    topGradient: "from-amber-500 to-orange-500",
    highlighterText: "text-amber-400"
  },
  green: {
    textAccent: "text-emerald-300",
    bgAccent: "bg-emerald-500/15",
    heading1: "text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400",
    heading2: "bg-gradient-to-r from-emerald-500 to-teal-500",
    bulletDot: "bg-emerald-400",
    topGradient: "from-emerald-500 to-teal-500",
    highlighterText: "text-emerald-400"
  },
  pink: {
    textAccent: "text-pink-300",
    bgAccent: "bg-pink-500/15",
    heading1: "text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-rose-400",
    heading2: "bg-gradient-to-r from-pink-500 to-rose-500",
    bulletDot: "bg-pink-400",
    topGradient: "from-pink-500 to-rose-500",
    highlighterText: "text-pink-400"
  }
};

export default function NotesView({
  content,
  modelName,
  timestamp,
  actionId,
  onCopyText,
  onPlayVoice,
  copiedId,
  playingMessageId,
  loadingVoiceId,
}: NotesViewProps) {
  const [copied, setCopied] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedHighlightColor, setSelectedHighlightColor] = useState<"yellow" | "green" | "pink">("yellow");

  const theme = THEMES[selectedHighlightColor] || THEMES.yellow;

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `study_notes_${Date.now()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Safe markdown helper rendering
  const renderFormattedNotes = (rawText: string) => {
    const lines = rawText.split("\n");
    return lines.map((line, idx) => {
      let trimmed = line.trim();
      
      // Filter lines matching search term if active
      if (searchTerm && !line.toLowerCase().includes(searchTerm.toLowerCase())) {
        return null;
      }

      // Format headings
      if (trimmed.startsWith("###")) {
        return (
          <h4 key={idx} className={`text-sm font-bold mt-4 mb-2 tracking-wide font-display border-b border-white/5 pb-1 flex items-center gap-2 ${theme.textAccent}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${theme.bulletDot}`} />
            {trimmed.slice(3).trim()}
          </h4>
        );
      }
      if (trimmed.startsWith("##")) {
        return (
          <h3 key={idx} className="text-base font-bold text-white mt-5 mb-2.5 tracking-tight font-display flex items-center gap-2">
            <span className={`w-2 h-2 rounded ${theme.heading2}`} />
            {trimmed.slice(2).trim()}
          </h3>
        );
      }
      if (trimmed.startsWith("#")) {
        return (
          <h2 key={idx} className={`text-lg font-bold mt-6 mb-3 tracking-tight font-display ${theme.heading1}`}>
            {trimmed.slice(1).trim()}
          </h2>
        );
      }

      // Format bullet points
      if (trimmed.startsWith("* ") || trimmed.startsWith("- ")) {
        const itemText = trimmed.slice(2);
        return (
          <li key={idx} className="list-disc list-inside text-xs text-text-primary pl-2 py-1 leading-relaxed">
            {formatTextWithMath(itemText)}
          </li>
        );
      }

      // Default paragraph
      if (trimmed === "") {
        return <div key={idx} className="h-2" />;
      }

      return (
        <p key={idx} className="text-xs text-text-primary leading-relaxed py-1.5">
          {formatTextWithMath(trimmed)}
        </p>
      );
    });
  };

  // Helper to color bold markdown content elegantly
  const formatBoldText = (text: string): React.ReactNode => {
    const parts = text.split(/\*\*(.*?)\*\*/g);
    if (parts.length === 1) return text;
    return parts.map((part, i) => {
      if (i % 2 === 1) {
        return (
          <strong key={i} className={`font-bold px-1 py-0.5 rounded ${theme.textAccent} ${theme.bgAccent}`}>
            {part}
          </strong>
        );
      }
      return part;
    });
  };

  // Helper to render KaTeX math expressions safely within study notes
  const formatTextWithMath = (text: string): React.ReactNode => {
    try {
      const katex = (window as any).katex;
      if (!katex) return formatBoldText(text);

      let processed = text;
      const placeholders: string[] = [];

      // 1. Block LaTeX \[...\] or $$...$$
      processed = processed.replace(/\\\[(.*?)\\\]/gs, (match, formula) => {
        try {
          const rendered = katex.renderToString(formula, { displayMode: true, throwOnError: false });
          const ph = `__LATEX_PH_${placeholders.length}__`;
          placeholders.push(`<div class="katex-display-container py-2 overflow-x-auto my-2 p-3 bg-white/[0.02] border border-white/5 rounded-xl text-center flex justify-center">${rendered}</div>`);
          return ph;
        } catch (err) {
          return match;
        }
      });

      processed = processed.replace(/\$\$(.*?)\$\$/gs, (match, formula) => {
        try {
          const rendered = katex.renderToString(formula, { displayMode: true, throwOnError: false });
          const ph = `__LATEX_PH_${placeholders.length}__`;
          placeholders.push(`<div class="katex-display-container py-2 overflow-x-auto my-2 p-3 bg-white/[0.02] border border-white/5 rounded-xl text-center flex justify-center">${rendered}</div>`);
          return ph;
        } catch (err) {
          return match;
        }
      });

      // 2. Inline LaTeX \(...\) or $...$
      processed = processed.replace(/\\\((.*?)\\\)/gs, (match, formula) => {
        try {
          const rendered = katex.renderToString(formula, { displayMode: false, throwOnError: false });
          const ph = `__LATEX_PH_${placeholders.length}__`;
          placeholders.push(`<span class="katex-inline-container inline-block px-1 font-mono">${rendered}</span>`);
          return ph;
        } catch (err) {
          return match;
        }
      });

      processed = processed.replace(/\$([^\$\n]+?)\$/g, (match, formula) => {
        try {
          const rendered = katex.renderToString(formula, { displayMode: false, throwOnError: false });
          const ph = `__LATEX_PH_${placeholders.length}__`;
          placeholders.push(`<span class="katex-inline-container inline-block px-1 font-mono">${rendered}</span>`);
          return ph;
        } catch (err) {
          return match;
        }
      });

      // Split parts by placeholder to avoid rendering raw strings
      const parts = processed.split(/(__LATEX_PH_\d+__)/g);
      return parts.map((part, i) => {
        if (part.startsWith("__LATEX_PH_") && part.endsWith("__")) {
          const idx = parseInt(part.replace("__LATEX_PH_", "").replace("__", ""), 10);
          return <span key={i} dangerouslySetInnerHTML={{ __html: placeholders[idx] }} />;
        }
        return <span key={i}>{formatBoldText(part)}</span>;
      });

    } catch (err) {
      return formatBoldText(text);
    }
  };

  return (
    <div className="bg-[#121226] border border-white/5 rounded-3xl p-5 md:p-6 shadow-2xl relative overflow-hidden max-w-2xl mx-auto w-full mb-6">
      <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${theme.topGradient}`} />
      
      {/* Header toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-white/5 pb-4 mb-4 gap-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center border border-violet-500/20">
            <BookOpen className={`w-4 h-4 ${theme.highlighterText}`} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white tracking-wide flex items-center gap-1.5">
              Structured Study Notes
            </h4>
            <p className="text-[9px] text-text-secondary mt-0.5">
              {timestamp ? new Date(timestamp).toLocaleTimeString() : "Just now"} • Interactive Notebook
            </p>
          </div>
        </div>

        {/* Toolbar actions */}
        <div className="flex items-center gap-1.5 self-stretch sm:self-auto justify-end">
          {/* Highlighter color selectors */}
          <div className="flex items-center gap-1 bg-black/20 p-1 rounded-lg border border-white/5 mr-1.5">
            <Highlighter className={`w-3.5 h-3.5 mx-1 ${theme.highlighterText}`} />
            {(["yellow", "green", "pink"] as const).map((color) => (
              <button
                key={color}
                onClick={() => setSelectedHighlightColor(color)}
                className={`w-3.5 h-3.5 rounded-full transition-transform ${
                  color === "yellow" ? "bg-amber-400" : color === "green" ? "bg-emerald-400" : "bg-pink-400"
                } ${selectedHighlightColor === color ? "scale-125 ring-1 ring-white" : "hover:scale-110 opacity-70"}`}
                title={`Highlight in ${color}`}
              />
            ))}
          </div>

          <button
            onClick={handleCopy}
            className="p-2 rounded-xl bg-white/[0.03] border border-white/5 text-text-secondary hover:text-white hover:bg-white/[0.08] transition-all"
            title="Copy all notes"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={handleDownload}
            className="p-2 rounded-xl bg-white/[0.03] border border-white/5 text-text-secondary hover:text-white hover:bg-white/[0.08] transition-all"
            title="Export as TXT file"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Internal Search bar */}
      <div className="relative mb-4">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Filter notes content..."
          className="w-full bg-black/20 border border-white/5 rounded-xl pl-8 pr-4 py-1.5 text-[11px] text-white outline-none focus:border-violet-500/50"
        />
        <Search className="w-3.5 h-3.5 text-text-secondary absolute left-2.5 top-2" />
      </div>

      {/* Notebook Paper layout */}
      <div className="bg-[#0b0b18] border border-white/5 rounded-2xl p-4 md:p-6 max-h-[450px] overflow-y-auto relative font-sans">
        <div className="absolute top-0 bottom-0 left-4 w-[1px] bg-red-500/20 pointer-events-none" />
        <div className="pl-4 space-y-1">
          {renderFormattedNotes(content)}
        </div>
      </div>

      {actionId && onCopyText && onPlayVoice && (
        <div className="flex items-center gap-2 pt-4">
          <button
            type="button"
            onClick={() => onPlayVoice(actionId, content)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/20 border border-white/5 text-[10px] text-text-secondary hover:text-white transition-all"
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
            onClick={() => onCopyText(content, actionId)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/20 border border-white/5 text-[10px] text-text-secondary hover:text-white transition-all"
          >
            {copiedId === actionId ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{copiedId === actionId ? "Copied" : "Copy"}</span>
          </button>
        </div>
      )}
    </div>
  );
}
