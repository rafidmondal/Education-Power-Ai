import React, { useState, useRef, useEffect } from "react";
import { 
  FileText, UploadCloud, CheckCircle, AlertTriangle, Loader, Eye, ArrowRight, Image as ImageIcon, ChevronRight, X
} from "lucide-react";

// Helper to detect dominant script in OCR text
function detectScriptFromText(text: string): string {
  const counts = {
    ben: (text.match(/[\u0980-\u09FF]/g) || []).length,
    hin: (text.match(/[\u0900-\u097F]/g) || []).length,
    tam: (text.match(/[\u0B80-\u0BFF]/g) || []).length,
    tel: (text.match(/[\u0C00-\u0C7F]/g) || []).length,
    guj: (text.match(/[\u0A80-\u0AFF]/g) || []).length,
    eng: (text.match(/[A-Za-z]/g) || []).length
  };
  let best = "eng";
  let bestCount = -1;
  for (const [lang, count] of Object.entries(counts)) {
    if (count > bestCount) {
      bestCount = count;
      best = lang;
    }
  }
  if (bestCount === 0) return "eng+ben";
  if (best === "eng") {
    return counts.ben > 0 || counts.hin > 0 ? "eng+ben+hin" : "eng";
  }
  return "eng+" + best;
}

// Helper to wrap any promise with a timeout limit
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: any;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`TIMEOUT: ${label}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

interface DocumentProcessorProps {
  onTextExtracted: (extracted: { text: string; filename: string; fileType: string }) => void;
  isLoading: boolean;
  compact?: boolean;
  onCloseCompact?: () => void;
}

interface UploadedFile {
  name: string;
  size: string;
  date: string;
  ext: string;
}

export default function DocumentProcessor({ 
  onTextExtracted, 
  isLoading: parentIsLoading,
  compact = false,
  onCloseCompact
}: DocumentProcessorProps) {
  const [file, setFile] = useState<File | null>(null);
  const [extractionProgress, setExtractionProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState<string>("");
  const [isExtracting, setIsExtracting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load and save recent uploads from localStorage
  const [recentUploads, setRecentUploads] = useState<UploadedFile[]>(() => {
    try {
      const saved = localStorage.getItem("rx_recent_uploads");
      return saved ? JSON.parse(saved) : [
        { name: "Physics Notes.pdf", size: "2.4 MB", date: "2 hours ago", ext: "pdf" },
        { name: "Chemistry Formula.docx", size: "1.1 MB", date: "5 hours ago", ext: "docx" },
        { name: "Biology Diagram.png", size: "3.2 MB", date: "1 day ago", ext: "png" }
      ];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem("rx_recent_uploads", JSON.stringify(recentUploads));
  }, [recentUploads]);

  // Automatically start extraction when a file is selected
  useEffect(() => {
    if (file) {
      startExtraction();
    }
  }, [file]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      processSelectedFile(droppedFile);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      processSelectedFile(selectedFile);
    }
  };

  const processSelectedFile = (selectedFile: File) => {
    setFile(selectedFile);
    setError(null);
    setExtractedText("");
    setExtractionProgress(null);
  };

  const startExtraction = async () => {
    if (!file) return;

    setIsExtracting(true);
    setError(null);
    setExtractionProgress(5);

    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    try {
      let extracted = "";

      if (ext === "txt" || ext === "md" || ext === "json" || ext === "xml") {
        setExtractionProgress(50);
        extracted = await file.text();
        setExtractionProgress(100);

      } else if (ext === "pdf") {
        if (!(window as any).pdfjsLib) {
          throw new Error("PDF.js CDN library is loading. Please wait or reload.");
        }
        const arrayBuffer = await file.arrayBuffer();
        const pdfjsLib = (window as any).pdfjsLib;
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        let fullText = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          setExtractionProgress(Math.floor((i / pdf.numPages) * 100));
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const pageText = content.items.map((item: any) => item.str).join(" ");
          fullText += `${pageText}\n`;
        }
        extracted = fullText;

      } else if (ext === "docx") {
        if (!(window as any).mammoth) {
          throw new Error("Mammoth.js Word reader is loading. Please reload.");
        }
        const arrayBuffer = await file.arrayBuffer();
        const mammoth = (window as any).mammoth;
        const result = await mammoth.extractRawText({ arrayBuffer });
        extracted = result.value;
        setExtractionProgress(100);

      } else if (ext === "xlsx" || ext === "xls") {
        if (!(window as any).XLSX) {
          throw new Error("SheetJS Excel reader is loading. Please reload.");
        }
        const arrayBuffer = await file.arrayBuffer();
        const XLSX = (window as any).XLSX;
        const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });
        
        let excelText = "";
        workbook.SheetNames.forEach((sheetName: string) => {
          const sheet = workbook.Sheets[sheetName];
          excelText += `--- SHEET: ${sheetName} ---\n`;
          excelText += XLSX.utils.sheet_to_txt(sheet) + "\n";
        });
        extracted = excelText;
        setExtractionProgress(100);

      } else if (ext === "csv") {
        if (!(window as any).Papa) {
          throw new Error("PapaParse CSV reader is loading. Please reload.");
        }
        const text = await file.text();
        const Papa = (window as any).Papa;
        const parsed = Papa.parse(text, { skipEmptyLines: true });
        extracted = parsed.data.map((row: any) => row.join(", ")).join("\n");
        setExtractionProgress(100);

      } else if (["png", "jpg", "jpeg", "webp", "bmp"].includes(ext)) {
        if (!(window as any).Tesseract) {
          throw new Error("Tesseract.js OCR engine is loading. Please check internet connection.");
        }
        const Tesseract = (window as any).Tesseract;

        setExtractionProgress(15);

        // ---- METHOD 1: OCR.space Cloud API ----
        let method1Text = "";
        try {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("language", "eng");
          formData.append("apikey", "helloworld");

          const doFetch = fetch("https://api.ocr.space/parse/image", {
            method: "POST",
            body: formData
          });
          const response = await withTimeout(doFetch, 20000, "OCR.space");
          const data = await response.json();
          if (data && data.OCRExitCode === 1 && data.ParsedResults && data.ParsedResults[0]) {
            method1Text = data.ParsedResults[0].ParsedText || "";
          }
        } catch (err) {
          console.warn("OCR.space background method failed or timed out:", err);
        }

        setExtractionProgress(45);

        // ---- METHOD 2: Tesseract Local (Fixed eng+ben Pack) ----
        let method2Text = "";
        try {
          const res = await Tesseract.recognize(file, "eng+ben");
          method2Text = res.data.text || "";
        } catch (err) {
          console.warn("Tesseract Local (fixed) background method failed:", err);
        }

        setExtractionProgress(75);

        // ---- METHOD 3: Tesseract Local (Auto-detected Script Pack) ----
        let method3Text = "";
        let detectedLang = "eng";
        try {
          detectedLang = detectScriptFromText(method2Text || method1Text || "");
          const res = await Tesseract.recognize(file, detectedLang);
          method3Text = res.data.text || "";
        } catch (err) {
          console.warn("Tesseract Local (auto) background method failed:", err);
        }

        setExtractionProgress(100);

        // Find the cleanest, longest text out of the 3 parallel attempts to avoid raw OCR error logs
        const candidateTexts = [method3Text, method2Text, method1Text].map(t => t.trim()).filter(Boolean);
        const bestOCRText = candidateTexts.reduce((longest, current) => current.length > longest.length ? current : longest, "");

        extracted = bestOCRText || method3Text || method2Text || method1Text || "";

        if (!extracted.trim()) {
          extracted = "No text could be extracted from this image. Please upload a high-contrast clean image or document.";
        }

      } else {
        throw new Error(`Unsupported file type (.${ext}). Please upload PDF, Word, Excel, CSV, Image, TXT, or MD.`);
      }

      if (!extracted || extracted.trim() === "") {
        throw new Error("Extracted text is empty. Please ensure the document contains machine-readable text or a high-quality image.");
      }

      setExtractedText(extracted);
      
      // Update local storage of recent uploads
      const newUpload: UploadedFile = {
        name: file.name,
        size: (file.size / 1024 / 1024).toFixed(1) + " MB",
        date: "Just now",
        ext: ext
      };
      setRecentUploads(prev => [newUpload, ...prev.slice(0, 9)]);

      // Submit to companion
      onTextExtracted({
        text: extracted,
        filename: file.name,
        fileType: ext
      });

      // Reset file upload state
      setFile(null);
      setExtractionProgress(null);

    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unexpected error occurred during local document extraction.");
    } finally {
      setIsExtracting(false);
    }
  };

  const getFileIcon = (extStr?: string) => {
    const ext = extStr || file?.name.split(".").pop()?.toLowerCase() || "";
    if (["png", "jpg", "jpeg", "webp"].includes(ext)) {
      return <ImageIcon className="w-8 h-8 text-pink-500" />;
    }
    if (["pdf"].includes(ext)) {
      return <FileText className="w-8 h-8 text-red-400" />;
    }
    if (["xlsx", "xls", "csv"].includes(ext)) {
      return <FileText className="w-8 h-8 text-emerald-400" />;
    }
    return <FileText className="w-8 h-8 text-blue-400" />;
  };

  if (compact) {
    return (
      <div className="bg-[#121225] border border-white/5 rounded-2xl p-4 shadow-xl max-w-md w-full relative">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <h3 className="text-xs font-bold font-display text-white">Upload Reference Material</h3>
          </div>
          {onCloseCompact && (
            <button onClick={onCloseCompact} className="text-text-secondary hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Drag & Drop Zone (Compact) */}
        <div 
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-white/10 hover:border-cyan-500/50 rounded-xl py-4 px-3 text-center cursor-pointer bg-white/[0.02] hover:bg-cyan-500/[0.02] transition-all"
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            className="hidden" 
            accept=".pdf,.docx,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.webp,.txt,.md,.xml,.json"
          />
          <UploadCloud className="w-7 h-7 text-cyan-400 mx-auto mb-1 animate-pulse" />
          <p className="text-[11px] font-medium text-text-primary">Drag study files here or Click</p>
          <p className="text-[9px] text-text-secondary mt-0.5">Supports PDF, Doc, CSV, Images (OCR)</p>
        </div>

        {isExtracting && (
          <div className="mt-3 space-y-1 bg-black/25 p-2 rounded-lg border border-white/5">
            <div className="flex items-center justify-between text-[10px] font-mono text-text-primary">
              <span className="flex items-center gap-1.5 font-semibold">
                <Loader className="w-3 h-3 animate-spin text-cyan-400" />
                Parsing document...
              </span>
              <span>{extractionProgress !== null ? `${extractionProgress}%` : "0%"}</span>
            </div>
            <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden">
              <div 
                className="bg-cyan-400 h-full transition-all duration-300" 
                style={{ width: `${extractionProgress || 0}%` }}
              />
            </div>
          </div>
        )}

        {error && (
          <p className="text-[10px] text-red-400 mt-2 bg-red-950/20 p-2 rounded border border-red-500/20">{error}</p>
        )}
      </div>
    );
  }

  // Full Screen Upload Interface (Screen 05 style)
  return (
    <div className="flex-1 flex flex-col h-full bg-[#080811] text-text-primary overflow-y-auto pb-12">
      {/* Premium Screen 05 Heading */}
      <div className="p-6 md:p-8 shrink-0">
        <h2 className="text-2xl font-bold font-display text-white tracking-tight">Upload Document</h2>
        <p className="text-xs text-text-secondary mt-1">Extract and analyze your study materials</p>
      </div>

      <div className="px-6 md:px-8 max-w-2xl w-full mx-auto space-y-6">
        {/* Beautiful Glowing Upload Card */}
        <div className="bg-[#121226] border border-white/5 rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-violet-500 to-indigo-500" />
          
          <div 
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-violet-500/20 hover:border-violet-500/50 rounded-2xl py-12 px-6 text-center cursor-pointer bg-white/[0.01] hover:bg-violet-500/[0.02] transition-all flex flex-col items-center justify-center min-h-[220px]"
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              className="hidden" 
              accept=".pdf,.docx,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.webp,.txt,.md,.xml,.json"
            />

            <div className="w-16 h-16 rounded-full bg-violet-600/10 flex items-center justify-center mb-4 border border-violet-500/20">
              <UploadCloud className="w-8 h-8 text-violet-400" />
            </div>
            
            <p className="text-sm font-semibold text-white tracking-wide">Drag & drop files here</p>
            <p className="text-xs text-text-secondary mt-1 mb-4">or</p>
            
            <button className="py-2.5 px-6 bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-90 text-white font-bold rounded-xl text-xs shadow-md shadow-violet-600/20 transition-all">
              Choose File
            </button>
            
            <p className="text-[10px] text-text-muted mt-4">
              Supports: PDF, DOCX, TXT, PPT, Images
            </p>
          </div>

          {/* Actions and Status */}
          {(file || error || isExtracting) && (
            <div className="mt-4 space-y-3">
              {error && (
                <div className="flex items-start gap-2.5 p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {isExtracting && (
                <div className="space-y-1.5 bg-black/25 p-4 rounded-xl border border-white/5 animate-pulse">
                  <div className="flex items-center justify-between text-xs font-mono text-text-primary">
                    <span className="flex items-center gap-2 font-bold">
                      <Loader className="w-4 h-4 animate-spin text-violet-400" />
                      Running 3-in-1 Background OCR / Document Parsing...
                    </span>
                    <span>{extractionProgress !== null ? `${extractionProgress}%` : "0%"}</span>
                  </div>
                  <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                    <div 
                      className="bg-gradient-to-r from-violet-500 to-indigo-500 h-full transition-all duration-300" 
                      style={{ width: `${extractionProgress || 0}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Recent Uploads Section (Mockup Screen 05 Style) */}
        <div>
          <h3 className="text-xs font-bold font-display uppercase tracking-wider text-text-secondary mb-3 px-1">
            Recent Uploads
          </h3>
          <div className="space-y-2">
            {recentUploads.map((up, idx) => (
              <div 
                key={idx}
                className="bg-[#121226] border border-white/5 rounded-2xl p-4 flex items-center justify-between hover:border-violet-500/20 hover:bg-[#15152c] transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-center">
                    {getFileIcon(up.ext)}
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-white tracking-wide">{up.name}</h4>
                    <p className="text-[10px] text-text-secondary mt-0.5 font-mono">
                      {up.size} • {up.date}
                    </p>
                  </div>
                </div>
                <div className="text-text-muted group-hover:text-violet-400 transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
