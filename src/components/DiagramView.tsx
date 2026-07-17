import React, { useEffect, useRef, useState } from "react";
import { 
  Download, Edit, Play, AlertTriangle, HelpCircle, Eye, ZoomIn, ZoomOut, Maximize2, Copy, Check, Volume2, VolumeX, Loader
} from "lucide-react";

interface DiagramViewProps {
  code: string;
  onCodeChanged?: (newCode: string) => void;
  actionId?: string;
  onCopyText?: (text: string, id: string) => void;
  onPlayVoice?: (id: string, text: string) => void;
  copiedId?: string | null;
  playingMessageId?: string | null;
  loadingVoiceId?: string | null;
}

// Helper to sanitize and fix Mermaid.js syntax dynamically in the browser
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
  cleaned = cleaned.replace(/([a-zA-Z0-9_-]+)\\{([^}]+)\\}/g, (match, id, content) => {
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

export default function DiagramView({
  code,
  onCodeChanged,
  actionId,
  onCopyText,
  onPlayVoice,
  copiedId,
  playingMessageId,
  loadingVoiceId,
}: DiagramViewProps) {
  const [diagramCode, setDiagramCode] = useState(code);
  const [svgHtml, setSvgHtml] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [zoom, setZoom] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDiagramCode(code);
    renderDiagram(code);
  }, [code]);

  const renderDiagram = async (srcCode: string) => {
    if (!srcCode || srcCode.trim() === "") return;
    try {
      setError(null);
      const mermaid = (window as any).mermaid;
      if (!mermaid) {
        throw new Error("Mermaid.js library is loading. Please reload.");
      }

      mermaid.initialize({
        startOnLoad: false,
        theme: "dark",
        securityLevel: "loose",
        logLevel: 5,
      });

      // Sanitize the code before rendering
      const sanitized = sanitizeMermaidCode(srcCode);

      const uniqueId = `mermaid-render-${Math.floor(Math.random() * 100000)}`;
      const { svg } = await mermaid.render(uniqueId, sanitized);
      setSvgHtml(svg);
    } catch (err: any) {
      console.warn("Mermaid Render Error", err);
      // Try to clean up any error rendering tags inserted by Mermaid
      const badTag = document.getElementById("d" + err.id);
      if (badTag) badTag.remove();
      
      setError("Invalid Mermaid.js syntax. Please verify connections, nodes, and arrow declarations.");
    }
  };

  const handleApplyChanges = () => {
    renderDiagram(diagramCode);
    if (onCodeChanged) {
      onCodeChanged(diagramCode);
    }
  };

  const downloadSVG = () => {
    try {
      const blob = new Blob([svgHtml], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `rx_study_diagram_${Date.now()}.svg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Failed to export diagram.");
    }
  };

  return (
    <div className="bg-bg-tertiary border border-border-main rounded-2xl p-4 glow-box-blue max-w-2xl mx-auto w-full mb-6">
      <div className="flex items-center justify-between border-b border-border-main pb-3 mb-4">
        <div className="flex items-center gap-1.5">
          <Eye className="w-4 h-4 text-accent-pink" />
          <span className="text-xs font-bold font-display text-white uppercase tracking-wider">AI Interactive Diagram Viewer</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setIsEditing(!isEditing)}
            className={`p-1.5 rounded-lg text-text-secondary hover:text-white transition-all text-xs flex items-center gap-1 ${
              isEditing ? "bg-accent-secondary/20 text-accent-secondary" : "hover:bg-bg-primary"
            }`}
            title="Edit Mermaid Code"
          >
            <Edit className="w-3.5 h-3.5" />
            {isEditing ? "View" : "Edit Code"}
          </button>
          
          <button
            onClick={downloadSVG}
            disabled={!svgHtml || !!error}
            className="p-1.5 rounded-lg text-text-secondary hover:text-white hover:bg-bg-primary transition-all disabled:opacity-40"
            title="Export as Vector SVG"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Editor & Diagram Grid */}
      <div className="flex flex-col gap-3">
        {isEditing && (
          <div className="space-y-2 animate-fade">
            <div className="relative">
              <textarea
                value={diagramCode}
                onChange={(e) => setDiagramCode(e.target.value)}
                className="w-full h-44 bg-bg-primary border border-border-main rounded-xl p-3 text-xs font-mono text-white outline-none focus:border-accent-pink resize-y leading-relaxed"
                placeholder="Enter Mermaid diagram code..."
              />
              <button
                onClick={handleApplyChanges}
                className="absolute right-3 bottom-3 py-1.5 px-3 bg-accent-pink hover:bg-accent-pink/90 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-all shadow-md"
              >
                <Play className="w-3 h-3 fill-white" />
                Render Live
              </button>
            </div>
            <p className="text-[10px] text-text-muted font-mono">
              Modify nodes and processes above. Press "Render Live" to compile diagram.
            </p>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 p-3 bg-error/15 border border-error/30 rounded-xl text-xs text-error animate-fade">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* SVG Container with Zoom & Pan */}
        <div className="relative bg-bg-primary rounded-xl border border-border-main p-4 overflow-hidden h-96 flex flex-col items-center justify-center">
          {/* Zoom controls */}
          <div className="absolute right-3 top-3 flex flex-col gap-1 z-10 select-none">
            <button
              onClick={() => setZoom(prev => Math.min(3, prev + 0.15))}
              className="p-1.5 rounded-md bg-bg-secondary border border-border-main text-text-primary hover:text-white hover:bg-bg-tertiary transition-all"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setZoom(prev => Math.max(0.5, prev - 0.15))}
              className="p-1.5 rounded-md bg-bg-secondary border border-border-main text-text-primary hover:text-white hover:bg-bg-tertiary transition-all"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setZoom(1)}
              className="p-1.5 rounded-md bg-bg-secondary border border-border-main text-text-primary hover:text-white hover:bg-bg-tertiary transition-all"
              title="Reset Zoom"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div 
            ref={containerRef}
            className="mermaid-container w-full h-full overflow-auto flex items-center justify-center transition-transform duration-150 cursor-grab active:cursor-grabbing"
            style={{ transform: `scale(${zoom})` }}
            dangerouslySetInnerHTML={{ __html: svgHtml }}
          />

          {!svgHtml && !error && (
            <div className="text-center text-xs text-text-muted select-none">
              <LoaderIcon className="w-6 h-6 animate-spin mx-auto mb-2 text-accent-pink" />
              Compiling educational diagram...
            </div>
          )}
        </div>
      </div>

      {actionId && onCopyText && onPlayVoice && (
        <div className="flex items-center gap-2 pt-4">
          <button
            type="button"
            onClick={() => onPlayVoice(actionId, diagramCode)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-bg-primary border border-border-main text-[10px] text-text-secondary hover:text-white transition-all"
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
            onClick={() => onCopyText(diagramCode, actionId)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-bg-primary border border-border-main text-[10px] text-text-secondary hover:text-white transition-all"
          >
            {copiedId === actionId ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
            <span>{copiedId === actionId ? "Copied" : "Copy"}</span>
          </button>
        </div>
      )}
    </div>
  );
}

function LoaderIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
