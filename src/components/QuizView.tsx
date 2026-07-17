import { useState } from "react";
import { QuizData, UserPrefs } from "../types";
import { 
  Check, X, ChevronRight, RotateCcw, Award, FileSpreadsheet, Share2, HelpCircle, Copy, Volume2, VolumeX, Loader
} from "lucide-react";

interface QuizViewProps {
  quizData: QuizData;
  onQuizCompleted: (score: number, total: number) => void;
  userPrefs: UserPrefs;
  actionId?: string;
  onCopyText?: (text: string, id: string) => void;
  onPlayVoice?: (id: string, text: string) => void;
  copiedId?: string | null;
  playingMessageId?: string | null;
  loadingVoiceId?: string | null;
}

export default function QuizView({
  quizData,
  onQuizCompleted,
  userPrefs,
  actionId,
  onCopyText,
  onPlayVoice,
  copiedId,
  playingMessageId,
  loadingVoiceId,
}: QuizViewProps) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [quizFinished, setQuizFinished] = useState(false);

  const totalQuestions = quizData.questions.length;
  const currentQuestion = quizData.questions[currentIdx];

  const playSound = (isCorrect: boolean) => {
    if (!userPrefs.sound_enabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      if (isCorrect) {
        // High, cheerful major third chime
        osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
        osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.1); // E5
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.35);
      } else {
        // Low, dull double buzz
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(150, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.25);
      }
    } catch (e) {
      console.warn("Audio Context playback failed", e);
    }
  };

  const handleOptionClick = (idx: number) => {
    if (isAnswered) return;

    setSelectedIdx(idx);
    setIsAnswered(true);

    const isCorrect = idx === currentQuestion.correct;
    if (isCorrect) {
      setScore(prev => prev + 1);
    }
    playSound(isCorrect);
  };

  const handleNext = () => {
    if (currentIdx + 1 < totalQuestions) {
      setCurrentIdx(currentIdx + 1);
      setSelectedIdx(null);
      setIsAnswered(false);
    } else {
      setQuizFinished(true);
      onQuizCompleted(score + (selectedIdx === currentQuestion.correct ? 1 : 0), totalQuestions);
    }
  };

  const handleRestart = () => {
    setCurrentIdx(0);
    setSelectedIdx(null);
    setIsAnswered(false);
    setScore(0);
    setQuizFinished(false);
  };

  // Export results locally via SheetJS
  const handleExportExcel = () => {
    if (!(window as any).XLSX) {
      alert("Excel export library is loading. Please retry in a moment.");
      return;
    }
    try {
      const XLSX = (window as any).XLSX;
      const wsData = [
        ["Interactive MCQ Study Results", "", "", ""],
        ["Topic / Title", quizData.quiz_title, "", ""],
        ["Score Achieved", `${score} / ${totalQuestions}`, "", ""],
        ["", "", "", ""],
        ["Question", "Your Selected Option", "Correct Option", "Status", "Detailed Explanation"]
      ];

      quizData.questions.forEach((q, i) => {
        const yourAns = selectedIdx !== null ? q.options[selectedIdx] : "N/A";
        const correctAns = q.options[q.correct];
        const status = selectedIdx === q.correct ? "✓ Correct" : "✗ Incorrect";
        wsData.push([q.q, yourAns, correctAns, status, q.explanation]);
      });

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Quiz Scorecard");
      XLSX.writeFile(wb, `${quizData.quiz_title.replace(/\s+/g, "_")}_results.xlsx`);
    } catch (e) {
      console.error(e);
      alert("Excel export failed.");
    }
  };

  const buildQuizActionText = () => {
    if (quizFinished) {
      return `${quizData.quiz_title}\nFinal score: ${score} out of ${totalQuestions}`;
    }

    const explanationText = isAnswered ? `\nExplanation: ${currentQuestion.explanation}` : "";
    const optionsText = currentQuestion.options
      .map((option, index) => `${String.fromCharCode(65 + index)}. ${option}`)
      .join("\n");

    return `${quizData.quiz_title}\nQuestion ${currentIdx + 1} of ${totalQuestions}\n${currentQuestion.q}\n${optionsText}${explanationText}`;
  };

  // Render quiz text with LaTeX math support via KaTeX
  const renderQuizText = (text: string) => {
    try {
      const katex = (window as any).katex;
      if (!katex) return text;

      let processed = text;
      processed = processed.replace(/\\\[([\s\S]*?)\\\]/g, (match, formula) => {
        return katex.renderToString(formula, { displayMode: true, throwOnError: false });
      });
      processed = processed.replace(/\\\(([\s\S]*?)\\\)/g, (match, formula) => {
        return katex.renderToString(formula, { displayMode: false, throwOnError: false });
      });
      processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (match, formula) => {
        return katex.renderToString(formula, { displayMode: true, throwOnError: false });
      });
      processed = processed.replace(/\$([^\$\n]+?)\$/g, (match, formula) => {
        return katex.renderToString(formula, { displayMode: false, throwOnError: false });
      });

      return <span dangerouslySetInnerHTML={{ __html: processed }} />;
    } catch (err) {
      return text;
    }
  };

  if (quizFinished) {
    const percentage = Math.round((score / totalQuestions) * 100);
    let feedback = "Incredible! You have complete mastery over this topic. Excellent study session!";
    if (percentage < 50) feedback = "Good attempt! Review the material again and restart the quiz to boost your score.";
    else if (percentage < 80) feedback = "Great work! Just a little more review of explanations and you will achieve full mastery.";

    return (
      <div className="bg-bg-tertiary border border-border-main p-6 rounded-2xl glow-box-green max-w-lg mx-auto text-center animate-fade">
        <Award className="w-14 h-14 mx-auto text-accent-tertiary glow-text-blue mb-3 animate-bounce" />
        <h3 className="text-xl font-bold font-display text-white mb-1">Study Session Complete!</h3>
        <p className="text-text-secondary text-xs font-mono uppercase tracking-wide mb-4">{quizData.quiz_title}</p>
        
        {/* Score Ring */}
        <div className="relative w-28 h-28 mx-auto mb-4 flex items-center justify-center">
          <svg className="absolute inset-0 w-full h-full transform -rotate-90">
            <circle cx="56" cy="56" r="48" stroke="#161b22" strokeWidth="8" fill="transparent" />
            <circle 
              cx="56" 
              cy="56" 
              r="48" 
              stroke="#238636" 
              strokeWidth="8" 
              fill="transparent" 
              strokeDasharray={2 * Math.PI * 48}
              strokeDashoffset={2 * Math.PI * 48 * (1 - percentage / 100)}
              className="transition-all duration-1000 ease-out"
            />
          </svg>
          <div className="text-center select-none">
            <span className="text-2xl font-bold font-display text-white">{percentage}%</span>
            <p className="text-[10px] text-text-secondary font-mono">{score} / {totalQuestions}</p>
          </div>
        </div>

        <p className="text-sm text-text-primary mb-6 leading-relaxed max-w-sm mx-auto">{feedback}</p>

        {/* Action Controls */}
        <div className="flex gap-2">
          <button
            onClick={handleRestart}
            className="flex-1 py-2 bg-bg-secondary hover:bg-bg-primary border border-border-main rounded-xl text-xs font-medium text-white flex items-center justify-center gap-1.5 transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Try Again
          </button>

          <button
            onClick={handleExportExcel}
            className="flex-1 py-2 bg-accent-primary hover:bg-accent-primary/90 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Export Scorecard
          </button>
        </div>

        {actionId && onCopyText && onPlayVoice && (
          <div className="flex items-center justify-center gap-2 pt-4">
            <button
              type="button"
              onClick={() => onPlayVoice(actionId, buildQuizActionText())}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-bg-secondary border border-border-main text-[10px] text-text-secondary hover:text-white transition-all"
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
              onClick={() => onCopyText(buildQuizActionText(), actionId)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-bg-secondary border border-border-main text-[10px] text-text-secondary hover:text-white transition-all"
            >
              {copiedId === actionId ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
              <span>{copiedId === actionId ? "Copied" : "Copy"}</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-bg-tertiary border border-border-main p-5 rounded-2xl glow-box-blue max-w-xl mx-auto animate-fade">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-main pb-3 mb-4 select-none">
        <div className="flex items-center gap-1.5">
          <HelpCircle className="w-4 h-4 text-accent-purple" />
          <span className="text-xs font-bold font-display text-white uppercase tracking-wider">{quizData.quiz_title}</span>
        </div>
        <span className="text-[10px] font-mono text-text-secondary">
          QUESTION {currentIdx + 1} OF {totalQuestions}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-bg-secondary h-1 rounded-full overflow-hidden mb-5">
        <div 
          className="bg-accent-purple h-full transition-all duration-300"
          style={{ width: `${((currentIdx + 1) / totalQuestions) * 100}%` }}
        />
      </div>

      {/* Question Text */}
      <h3 className="text-sm font-medium font-display text-white mb-5 leading-relaxed">
        {renderQuizText(currentQuestion.q)}
      </h3>

      {/* Options */}
      <div className="space-y-2 mb-5">
        {currentQuestion.options
          .map((opt, originalIndex) => ({ opt, originalIndex }))
          .filter(({ opt }) => opt && opt.trim() !== "")
          .map(({ opt, originalIndex }, i) => {
            const letter = ["A", "B", "C", "D"][i];
            const isSelected = selectedIdx === originalIndex;
            const isCorrect = originalIndex === currentQuestion.correct;
            
            let cardStyle = "border-border-main hover:border-accent-secondary bg-bg-primary/40";
            let icon = null;

            if (isAnswered) {
              if (isCorrect) {
                cardStyle = "border-success bg-success/10 text-success font-semibold";
                icon = <Check className="w-4 h-4 text-success" />;
              } else if (isSelected) {
                cardStyle = "border-error bg-error/10 text-error font-semibold";
                icon = <X className="w-4 h-4 text-error" />;
              } else {
                cardStyle = "border-border-main bg-bg-primary/10 opacity-60";
              }
            }

            return (
              <button
                key={originalIndex}
                disabled={isAnswered}
                onClick={() => handleOptionClick(originalIndex)}
                className={`w-full flex items-center justify-between p-3.5 rounded-xl border text-left text-xs transition-all duration-200 ${cardStyle}`}
              >
                <span className="flex items-center gap-3">
                  <span className={`w-5 h-5 rounded flex items-center justify-center font-mono text-[10px] font-bold ${
                    isSelected ? "bg-accent-secondary text-white" : "bg-bg-secondary text-text-secondary"
                  }`}>
                    {letter}
                  </span>
                  <span>{renderQuizText(opt)}</span>
                </span>
                {icon}
              </button>
            );
          })}
      </div>

      {/* Explanation Reveal */}
      {isAnswered && (
        <div className="bg-bg-primary/50 border border-border-main p-3.5 rounded-xl text-xs leading-relaxed animate-fade mb-5">
          <div className="flex items-center gap-1.5 font-bold mb-1">
            {selectedIdx === currentQuestion.correct ? (
              <span className="text-success flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                Correct Answer!
              </span>
            ) : (
              <span className="text-error flex items-center gap-1">
                <X className="w-3.5 h-3.5" />
                Incorrect.
              </span>
            )}
          </div>
          <p className="text-text-primary">{renderQuizText(currentQuestion.explanation)}</p>
        </div>
      )}

      {/* Action Controls */}
      {isAnswered && (
        <button
          onClick={handleNext}
          className="w-full py-2.5 bg-accent-secondary hover:bg-accent-secondary/90 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-all glow-box-blue font-display"
        >
          {currentIdx + 1 === totalQuestions ? "Finish Quiz & See Results" : "Next Question"}
          <ChevronRight className="w-4 h-4" />
        </button>
      )}

      {actionId && onCopyText && onPlayVoice && (
        <div className="flex items-center gap-2 pt-4">
          <button
            type="button"
            onClick={() => onPlayVoice(actionId, buildQuizActionText())}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-bg-secondary border border-border-main text-[10px] text-text-secondary hover:text-white transition-all"
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
            onClick={() => onCopyText(buildQuizActionText(), actionId)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-bg-secondary border border-border-main text-[10px] text-text-secondary hover:text-white transition-all"
          >
            {copiedId === actionId ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
            <span>{copiedId === actionId ? "Copied" : "Copy"}</span>
          </button>
        </div>
      )}
    </div>
  );
}
