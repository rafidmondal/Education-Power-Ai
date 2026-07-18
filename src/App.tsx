import { useState, useEffect, useRef } from "react";
import { Conversation, Message, UserPrefs } from "./types";
import { 
  initDB, getAllConversations, saveConversation, deleteConversation, clearAllConversations, getUserPrefs, saveUserPrefs 
} from "./lib/db";
import Sidebar from "./components/Sidebar";
import DocumentProcessor from "./components/DocumentProcessor";
import ChatWindow from "./components/ChatWindow";
import ToolsPanel from "./components/ToolsPanel";
import ProfileView from "./components/ProfileView";
import { 
  Sparkles, Trophy, X, FileText, ChevronRight, LayoutGrid, HelpCircle, 
  MessageSquare, History, User, Home, Flame, UploadCloud, Lock, Plus, Trash2, Settings, Crown, Star, CheckCircle2, ChevronLeft
} from "lucide-react";

export default function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [userPrefs, setUserPrefs] = useState<UserPrefs | null>(null);
  const [selectedModel, setSelectedModel] = useState("auto");
  const [activeMode, setActiveMode] = useState<"single" | "triple" | "quiz" | "diagram" | "notes">("single");
  const [levelUpMessage, setLevelUpMessage] = useState<string | null>(null);
  const [showAdSlot, setShowAdSlot] = useState(true);
  const adContainerRef = useRef<HTMLDivElement | null>(null);
  
  // Premium 5-Tab Routing & Sub-Routing
  const [activeTab, setActiveTab] = useState<"home" | "chat" | "tools" | "upload" | "history" | "profile" | "upgrade">("home");
  const [showUploadInChat, setShowUploadInChat] = useState(false);

  // Initialize DB data and statistics on mount
  useEffect(() => {
    async function loadData() {
      try {
        await initDB();
        const convs = await getAllConversations();
        setConversations(convs);
        
        if (convs.length > 0) {
          setActiveConversationId(convs[0].id);
          setActiveMode(convs[0].settings?.mode || "single");
        }

        const prefs = await getUserPrefs();
        
        // Handle consecutive daily streak check on login
        const todayStr = new Date().toDateString();
        if (prefs.lastActiveDate !== todayStr) {
          let newStreak = prefs.streak;
          if (prefs.lastActiveDate) {
            const lastDate = new Date(prefs.lastActiveDate);
            const diffTime = Math.abs(new Date(todayStr).getTime() - lastDate.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays === 1) {
              newStreak += 1;
            } else if (diffDays > 1) {
              newStreak = 1; // broken streak reset
            }
          } else {
            newStreak = 1;
          }
          const updatedPrefs = { ...prefs, streak: newStreak, lastActiveDate: todayStr };
          setUserPrefs(updatedPrefs);
          await saveUserPrefs(updatedPrefs);
        } else {
          setUserPrefs(prefs);
        }

      } catch (err) {
        console.error("Failed to load local DB data", err);
      }
    }
    loadData();
  }, []);

  useEffect(() => {
    const container = adContainerRef.current;
    if (!container || !showAdSlot || container.childNodes.length > 0) return;

    const adWindow = window as any;
    adWindow.atOptions = {
      key: "a54e142b3995db1f06b9c81b01825b5e",
      format: "iframe",
      height: 50,
      width: 320,
      params: {},
    };

    const invokeScript = document.createElement("script");
    invokeScript.src = "https://www.highperformanceformat.com/a54e142b3995db1f06b9c81b01825b5e/invoke.js";
    invokeScript.async = true;
    container.appendChild(invokeScript);

    return () => {
      if (container.contains(invokeScript)) {
        container.removeChild(invokeScript);
      }
    };
  }, [showAdSlot]);

  // Sync state changes back to IndexedDB
  const handleUpdatePrefs = async (updated: Partial<UserPrefs>) => {
    if (!userPrefs) return;
    const newPrefs = { ...userPrefs, ...updated };
    setUserPrefs(newPrefs);
    await saveUserPrefs(newPrefs);
  };

  // Gamification: award XP and handle level up
  const awardXP = async (amount: number) => {
    if (!userPrefs) return;
    let newXP = userPrefs.xp + amount;
    let currentLevel = userPrefs.level;
    const xpNeeded = currentLevel * 200;
    let leveledUp = false;

    if (newXP >= xpNeeded) {
      newXP = newXP - xpNeeded;
      currentLevel += 1;
      leveledUp = true;
    }

    const updatedPrefs = { ...userPrefs, xp: newXP, level: currentLevel };
    setUserPrefs(updatedPrefs);
    await saveUserPrefs(updatedPrefs);

    if (leveledUp) {
      triggerLevelUpSound();
      setLevelUpMessage(`CONGRATULATIONS! You achieved Level ${currentLevel} in your academic quest! Stay curious!`);
    }
  };

  const triggerLevelUpSound = () => {
    if (!userPrefs?.sound_enabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const notes = [261.63, 329.63, 392.00, 523.25]; // C major chord arpeggio
      notes.forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime + i * 0.12);
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime + i * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + i * 0.12 + 0.4);
        osc.start(audioCtx.currentTime + i * 0.12);
        osc.stop(audioCtx.currentTime + i * 0.12 + 0.4);
      });
    } catch (e) {
      console.warn(e);
    }
  };

  // Chat conversation actions
  const activeConversation = conversations.find(c => c.id === activeConversationId) || null;

  const handleStartNewSession = async () => {
    await handleNewConversation();
    setActiveTab("chat");
  };

  const handleNewConversation = async () => {
    const newConv: Conversation = {
      id: `session_${Date.now()}`,
      title: "New Study Session",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      messages: [],
      settings: {
        default_model: selectedModel,
        mode: activeMode,
        language: userPrefs?.language || "en"
      },
      stats: {
        message_count: 0,
        total_tokens: 0
      }
    };

    const updated = [newConv, ...conversations];
    setConversations(updated);
    setActiveConversationId(newConv.id);
    await saveConversation(newConv);
  };

  const handleDeleteConversation = async (id: string) => {
    const updated = conversations.filter(c => c.id !== id);
    setConversations(updated);
    await deleteConversation(id);
    
    if (activeConversationId === id) {
      if (updated.length > 0) {
        setActiveConversationId(updated[0].id);
      } else {
        setActiveConversationId(null);
      }
    }
  };

  const handleClearAll = async () => {
    if (confirm("Are you sure you want to clear your local database of all study history? This cannot be undone.")) {
      setConversations([]);
      setActiveConversationId(null);
      await clearAllConversations();
    }
  };

  // Client-side text/OCR extraction handler
  const handleTextExtracted = async ({ text, filename, fileType }: { text: string; filename: string; fileType: string }) => {
    let currentConv = activeConversation;
    if (!currentConv) {
      const newId = `session_${Date.now()}`;
      currentConv = {
        id: newId,
        title: `Analysis: ${filename}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        messages: [],
        settings: {
          default_model: selectedModel,
          mode: activeMode,
          language: userPrefs?.language || "en"
        },
        stats: {
          message_count: 0,
          total_tokens: 0
        }
      };
      setConversations(prev => [currentConv!, ...prev]);
      setActiveConversationId(newId);
    } else {
      if (currentConv.title === "New Study Session") {
        currentConv.title = `Analysis: ${filename}`;
      }
    }

    const sysPrompt = `Locally parsed document context upload from filename "${filename}" (Type: ${fileType.toUpperCase()}):\n\n${text}\n\nPlease analyze this document context, ignore any symbols or typos, and provide a clean, professional summary of the material. Let the user know we are ready to generate notes, visual diagrams, or test them with an interactive MCQ quiz!`;
    
    // Auto switch to chat tab so they can see the response loading instantly!
    setActiveTab("chat");
    setShowUploadInChat(false);

    const isImage = ["png", "jpg", "jpeg", "webp", "bmp"].includes(fileType.toLowerCase());
    const visualText = isImage 
      ? `📷 Photo Send: **${filename}**`
      : `📄 Document Send: **${filename}**`;

    await sendMessage(sysPrompt, text, visualText);
  };

  const buildUserProfilePayload = () => {
    if (!userPrefs) return null;
    return {
      display_name: userPrefs.display_name,
      mentor_persona: userPrefs.mentor_persona,
      response_length: userPrefs.response_length,
      education_level: userPrefs.education_level,
      target_exam: userPrefs.target_exam,
      learning_focus: userPrefs.learning_focus,
      study_goal: userPrefs.study_goal,
      answer_style: userPrefs.answer_style,
      language: userPrefs.language,
    };
  };

  const sendMessage = async (
    messageText: string, 
    ocrText?: string, 
    customVisibleText?: string,
    overrideMode?: "single" | "triple" | "quiz" | "diagram" | "notes"
  ) => {
    if (isLoading) return;

    const targetMode = overrideMode || activeMode;

    let currentConv = activeConversation;
    if (!currentConv) {
      const newId = `session_${Date.now()}`;
      currentConv = {
        id: newId,
        title: (customVisibleText || messageText).slice(0, 30) + ((customVisibleText || messageText).length > 30 ? "..." : ""),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        messages: [],
        settings: {
          default_model: selectedModel,
          mode: targetMode,
          language: userPrefs?.language || "en"
        },
        stats: {
          message_count: 0,
          total_tokens: 0
        }
      };
      await saveConversation(currentConv);
      setConversations(prev => [currentConv!, ...prev]);
      setActiveConversationId(newId);
    } else {
      if (currentConv.title === "New Study Session") {
        currentConv.title = (customVisibleText || messageText).slice(0, 30) + ((customVisibleText || messageText).length > 30 ? "..." : "");
      }
    }

    const userMsg: Message = {
      id: `msg_${Date.now()}_u`,
      role: "user",
      content: customVisibleText || messageText,
      timestamp: new Date().toISOString(),
      ocr_text: ocrText,
      mode: targetMode
    };

    const updatedMessages = [...currentConv.messages, userMsg];
    currentConv.messages = updatedMessages;
    currentConv.updated_at = new Date().toISOString();
    
    setConversations(prev => prev.map(c => c.id === currentConv!.id ? { ...currentConv! } : c));
    await saveConversation(currentConv);

    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: messageText,
          model: selectedModel,
          ocr_text: ocrText || "",
          mode: targetMode,
          user_profile: buildUserProfilePayload(),
          history: updatedMessages.slice(0, -1)
            .filter(m => {
              const msgMode = m.mode || m.metadata?.mode || "single";
              const normalizedMsgMode = msgMode === "chat" ? "single" : msgMode;
              return normalizedMsgMode === targetMode;
            })
            .map(m => ({
              role: m.role,
              content: m.ocr_text ? `Parsed text background context: ${m.ocr_text}` : m.content
            })),
        }),
      });

      if (!res.ok) {
        let serverErr = "Local academic servers failed to return a proper AI response.";
        try {
          const errData = await res.json();
          if (errData && errData.error) {
            serverErr = errData.error;
          }
        } catch (_) {}
        throw new Error(serverErr);
      }

      const data = await res.json();

      const assistantMsg: Message = {
        id: `msg_${Date.now()}_ai`,
        role: "assistant",
        content: data.reply || "No reply generated by routing model.",
        timestamp: new Date().toISOString(),
        model: data.model,
        mode: targetMode,
        metadata: {
          mode: targetMode,
          latency_ms: data.latency_ms,
          tokens_used: data.tokens_used,
          tool_used: data.tool_used,
          quiz_data: data.quiz_data,
          diagram_code: data.diagram_code,
          model_responses: data.model_responses
        }
      };

      currentConv.messages = [...updatedMessages, assistantMsg];
      currentConv.updated_at = new Date().toISOString();
      
      setConversations(prev => prev.map(c => c.id === currentConv!.id ? { ...currentConv! } : c));
      await saveConversation(currentConv);

      if (targetMode === "diagram") {
        await awardXP(100);
      } else if (targetMode === "quiz") {
        await awardXP(50);
      } else {
        await awardXP(15);
      }

    } catch (err: any) {
      console.error(err);
      const errMsg: Message = {
        id: `msg_${Date.now()}_err`,
        role: "system",
        content: `⚠️ API Connection Failure: ${err.message || "Failed to make handshakes with the AI server."}`,
        timestamp: new Date().toISOString(),
        mode: targetMode
      };
      currentConv.messages = [...updatedMessages, errMsg];
      setConversations(prev => prev.map(c => c.id === currentConv!.id ? { ...currentConv! } : c));
    } finally {
      setIsLoading(false);
    }
  };

  const getLatestQuizTopic = () => {
    const sourceMessages = activeConversation?.messages || [];
    const latestQuizUserMessage = [...sourceMessages].reverse().find((msg) => {
      const msgMode = msg.mode || msg.metadata?.mode || "single";
      const normalizedMode = msgMode === "chat" ? "single" : msgMode;
      return msg.role === "user" && normalizedMode === "quiz";
    });

    return latestQuizUserMessage?.content.replace(/^New Questions:\s*/i, "").trim() || "";
  };

  const handleExitQuizMode = async () => {
    setActiveMode("quiz");
  };

  const handleGenerateFreshQuiz = async () => {
    const latestTopic = getLatestQuizTopic();
    if (!latestTopic || isLoading) return;

    await sendMessage(
      `Create a fresh new quiz on the same topic: ${latestTopic}. Return a brand-new set of exactly 5 questions with answers and explanations. Avoid repeating previous questions.`,
      undefined,
      `New Questions: ${latestTopic}`,
      "quiz"
    );
  };

  const handleQuizCompleted = async (score: number, total: number) => {
    const bonus = score * 30;
    await awardXP(50 + bonus);
  };

  const handleImportBackup = async (data: string) => {
    try {
      const parsed = JSON.parse(data);
      if (parsed && Array.isArray(parsed.conversations)) {
        for (const c of parsed.conversations) {
          await saveConversation(c);
        }
        if (parsed.userPrefs) {
          await saveUserPrefs(parsed.userPrefs);
          setUserPrefs(parsed.userPrefs);
        }
        const refreshed = await getAllConversations();
        setConversations(refreshed);
        alert("Platform backup successfully imported and restored!");
      } else {
        throw new Error("Invalid backup format.");
      }
    } catch (e) {
      alert("Failed to import platform backup. Ensure file is a valid JSON backup dump.");
    }
  };

  const handleExportBackup = () => {
    try {
      const dump = {
        conversations,
        userPrefs
      };
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `rx_study_platform_backup_${Date.now()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Failed to export backup.");
    }
  };

  if (!userPrefs) {
    return (
      <div className="h-screen w-screen bg-[#080811] flex items-center justify-center text-xs text-text-secondary select-none">
        Booting RX Educational Command Center...
      </div>
    );
  }

  const xpNeeded = userPrefs.level * 200;
  const xpPercent = Math.min(100, Math.floor((userPrefs.xp / xpNeeded) * 100));

  return (
    <div className={`h-screen w-screen bg-transparent text-text-primary overflow-hidden flex flex-col md:flex-row font-sans select-none text-${userPrefs.font_size}`}>
      
      {/* Sidebar Navigation (Desktop-Only) */}
      <div className="hidden md:flex flex-col w-72 glass-panel border-r border-white/8 h-full select-none justify-between shrink-0">
        <div>
          {/* Logo & Header */}
          <div className="p-6 border-b border-white/8 flex items-center gap-3">
            <img
              src="/web-logo.png"
              alt="RX Study AI logo"
              className="w-14 h-14 object-contain"
            />
            <div>
              <h1 className="text-white font-bold text-md font-display tracking-tight leading-none">RX Study AI</h1>
              <span className="text-[9px] text-text-secondary uppercase tracking-widest font-mono mt-1 block">Learn Smarter, Achieve More</span>
            </div>
          </div>

          {/* Nav Items */}
          <nav className="p-4 space-y-1.5">
            <button
              onClick={() => setActiveTab("home")}
              className={`glass-nav-button ${activeTab === "home" ? "is-active" : ""} w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-semibold transition-all ${
                activeTab === "home" ? "text-white font-bold" : "text-text-secondary hover:text-white"
              }`}
            >
              <Home className="w-4 h-4 text-indigo-400" />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => {
                setActiveTab("chat");
                setActiveMode("single");
              }}
              className={`glass-nav-button ${activeTab === "chat" ? "is-active" : ""} w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-semibold transition-all ${
                activeTab === "chat" ? "text-white font-bold" : "text-text-secondary hover:text-white"
              }`}
            >
              <MessageSquare className="w-4 h-4 text-cyan-400" />
              <span>AI Chat</span>
            </button>

            <button
              onClick={() => setActiveTab("tools")}
              className={`glass-nav-button ${activeTab === "tools" ? "is-active" : ""} w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-semibold transition-all ${
                activeTab === "tools" ? "text-white font-bold" : "text-text-secondary hover:text-white"
              }`}
            >
              <LayoutGrid className="w-4 h-4 text-violet-400" />
              <span>AI Workspace</span>
            </button>

            <button
              onClick={() => setActiveTab("upload")}
              className={`glass-nav-button ${activeTab === "upload" ? "is-active" : ""} w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-semibold transition-all ${
                activeTab === "upload" ? "text-white font-bold" : "text-text-secondary hover:text-white"
              }`}
            >
              <UploadCloud className="w-4 h-4 text-pink-400" />
              <span>Upload Document</span>
            </button>

            <button
              onClick={() => setActiveTab("history")}
              className={`glass-nav-button ${activeTab === "history" ? "is-active" : ""} w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-semibold transition-all ${
                activeTab === "history" ? "text-white font-bold" : "text-text-secondary hover:text-white"
              }`}
            >
              <History className="w-4 h-4 text-amber-400" />
              <span>Study History</span>
            </button>

            <button
              onClick={() => setActiveTab("profile")}
              className={`glass-nav-button ${activeTab === "profile" ? "is-active" : ""} w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-semibold transition-all ${
                activeTab === "profile" ? "text-white font-bold" : "text-text-secondary hover:text-white"
              }`}
            >
              <User className="w-4 h-4 text-emerald-400" />
              <span>My Profile</span>
            </button>
          </nav>
        </div>

        {/* Level Up Progress Card */}
        <div className="p-4 m-4 glass-soft rounded-[24px]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-mono font-bold text-indigo-400">QUEST LVL {userPrefs.level}</span>
            <span className="text-[10px] text-text-secondary font-mono">{userPrefs.xp}/{xpNeeded} XP</span>
          </div>
          <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-500 to-violet-500 h-full" style={{ width: `${xpPercent}%` }} />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-1 text-[10px] text-text-secondary">
              <Flame className="w-3.5 h-3.5 text-orange-400 animate-pulse" />
              <span>{userPrefs.streak} Day Streak</span>
            </div>
            <button 
              onClick={() => setActiveTab("upgrade")}
              className="text-[9px] font-bold text-pink-400 hover:text-pink-300 uppercase tracking-wider"
            >
              Go Pro →
            </button>
          </div>
        </div>
      </div>

      {/* Main Container Stage */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-transparent">
        
        {/* Content Router */}
        <div className="flex-1 overflow-hidden relative">
          
          {/* TAB 1: HOME (Screen 02 style) */}
          {activeTab === "home" && (
            <div className="h-full overflow-y-auto p-6 md:p-8 space-y-6 max-w-4xl mx-auto w-full">
              
              {/* Profile Bar / Quick Stat Heading */}
              <div className="flex items-center justify-between mb-2">
                <div>
                  <img
                    src="/web-logo.png"
                    alt="RX Study AI"
                    className="w-[270px] max-w-full object-contain"
                  />
                  <p className="text-xs text-text-secondary mt-2">Welcome back! Ready to learn?</p>
                </div>
                
                {/* Micro Streak Widget */}
                <div className="glass-soft flex items-center gap-2 px-3 py-2 rounded-2xl">
                  <Flame className="w-4 h-4 text-orange-500 fill-orange-500/10" />
                  <span className="text-xs font-mono font-bold text-white">{userPrefs.streak} DAY STREAK</span>
                </div>
              </div>

              {/* Study Streak Card (Screen 02 Layout) */}
              <div className="glass-panel rounded-[28px] p-5 md:p-6 flex items-center justify-between shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-48 h-48 opacity-10 pointer-events-none bg-[radial-gradient(circle_at_center,_var(--color-accent-primary)_0%,_transparent_100%)]" />
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-2xl animate-pulse">
                    🔥
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white font-display">Study Streak</h3>
                    <p className="text-xs text-text-secondary mt-0.5">Keep it up! {userPrefs.streak} days in a row</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-text-muted font-mono uppercase block">Status</span>
                  <span className="text-xs font-bold text-emerald-400">Active</span>
                </div>
              </div>

              {/* Quick Actions Grid (Screen 02 Buttons) */}
              <div>
                <h3 className="text-xs font-bold font-display uppercase tracking-wider text-text-secondary mb-3 px-1">
                  AI Study Tools
                </h3>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  
                  <button 
                    onClick={async () => {
                      await handleNewConversation();
                      setActiveTab("chat");
                      setActiveMode("single");
                    }}
                    className="glass-soft hover:border-indigo-400/30 p-4 rounded-[24px] text-left transition-all hover:translate-y-[-2px] group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-3 group-hover:bg-indigo-500/25 transition-all">
                      <MessageSquare className="w-5 h-5" />
                    </div>
                    <h4 className="text-xs font-bold text-white group-hover:text-indigo-400 transition-colors">New Study Session</h4>
                    <p className="text-[10px] text-text-secondary mt-1 line-clamp-2">Start an interactive workspace chat.</p>
                  </button>

                  <button 
                    onClick={() => setActiveTab("tools")}
                    className="glass-soft hover:border-violet-400/30 p-4 rounded-[24px] text-left transition-all hover:translate-y-[-2px] group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 mb-3 group-hover:bg-violet-500/25 transition-all">
                      <LayoutGrid className="w-5 h-5" />
                    </div>
                    <h4 className="text-xs font-bold text-white group-hover:text-violet-400 transition-colors">AI Tools</h4>
                    <p className="text-[10px] text-text-secondary mt-1 line-clamp-2">Integrated math, science & language APIs.</p>
                  </button>

                  <button 
                    onClick={() => setActiveTab("upload")}
                    className="glass-soft hover:border-pink-400/30 p-4 rounded-[24px] text-left transition-all hover:translate-y-[-2px] group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-pink-400 mb-3 group-hover:bg-pink-500/25 transition-all">
                      <UploadCloud className="w-5 h-5" />
                    </div>
                    <h4 className="text-xs font-bold text-white group-hover:text-pink-400 transition-colors">Upload Material</h4>
                    <p className="text-[10px] text-text-secondary mt-1 line-clamp-2">Extract and analyze any files or images.</p>
                  </button>

                  <button 
                    onClick={async () => {
                      await handleNewConversation();
                      setActiveTab("chat");
                      setActiveMode("quiz");
                    }}
                    className="glass-soft hover:border-amber-400/30 p-4 rounded-[24px] text-left transition-all hover:translate-y-[-2px] group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-3 group-hover:bg-amber-500/25 transition-all">
                      <FileText className="w-5 h-5" />
                    </div>
                    <h4 className="text-xs font-bold text-white group-hover:text-amber-400 transition-colors">Quiz Generator</h4>
                    <p className="text-[10px] text-text-secondary mt-1 line-clamp-2">Test your knowledge with dynamic quizzes.</p>
                  </button>

                </div>
              </div>

              {/* Recent Sessions List */}
              <div>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h3 className="text-xs font-bold font-display uppercase tracking-wider text-text-secondary">
                    Recent Sessions
                  </h3>
                  <span className="text-[10px] font-mono text-text-secondary">{conversations.length} total</span>
                </div>

                {conversations.length === 0 ? (
                  <div className="glass-soft rounded-[24px] p-6 text-center">
                    <p className="text-xs text-text-secondary">No study sessions logged yet. Let's create one!</p>
                    <button 
                      onClick={handleStartNewSession}
                      className="mt-3 inline-flex items-center gap-1.5 text-xs text-indigo-400 font-semibold hover:text-indigo-300 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Create first session
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {conversations.slice(0, 5).map((conv) => (
                      <div 
                        key={conv.id}
                        onClick={() => {
                          setActiveConversationId(conv.id);
                          setActiveMode(conv.settings?.mode || "single");
                          setActiveTab("chat");
                        }}
                        className="glass-soft rounded-[24px] p-4 flex items-center justify-between hover:border-indigo-400/20 transition-all cursor-pointer group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-center text-indigo-400">
                            {conv.settings?.mode === "quiz" ? <FileText className="w-4 h-4 text-amber-400" /> : <MessageSquare className="w-4 h-4" />}
                          </div>
                          <div>
                            <h4 className="text-xs font-semibold text-white group-hover:text-indigo-400 transition-colors max-w-[220px] sm:max-w-md truncate">{conv.title}</h4>
                            <p className="text-[10px] text-text-secondary mt-0.5 font-mono">
                              {new Date(conv.updated_at).toLocaleDateString()} • {conv.messages.length} messages
                            </p>
                          </div>
                        </div>
                        <div className="text-text-muted group-hover:text-indigo-400 transition-colors">
                          <ChevronRight className="w-4 h-4" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: CHAT (Screen 03 / Screen 06 / Screen 07 style) */}
          {activeTab === "chat" && (
            <div className="h-full flex flex-col overflow-hidden relative min-h-0">
              <div className="shrink-0 px-4 pt-4 flex justify-end">
                <button
                  onClick={() => setShowUploadInChat(!showUploadInChat)}
                  className={`py-2 px-3.5 liquid-button rounded-full text-xs font-bold text-cyan-100 flex items-center gap-1.5 shadow-xl transition-all ${
                    showUploadInChat ? "ring-2 ring-cyan-500/20" : ""
                  }`}
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>{showUploadInChat ? "Close Upload" : "Upload Reference"}</span>
                </button>
              </div>

              {showUploadInChat && (
                <div className="shrink-0 p-4 pt-3 flex justify-center animate-fade">
                  <DocumentProcessor 
                    onTextExtracted={handleTextExtracted} 
                    isLoading={isLoading}
                    compact={true}
                    onCloseCompact={() => setShowUploadInChat(false)}
                  />
                </div>
              )}

              {/* Chat View component */}
              <div className="flex-1 min-h-0">
                <ChatWindow
                  messages={activeConversation?.messages || []}
                  activeMode={activeMode}
                  onChangeMode={(m) => {
                    setActiveMode(m);
                    if (activeConversation) {
                      activeConversation.settings = { 
                        ...(activeConversation.settings || { default_model: selectedModel, language: userPrefs.language }),
                        mode: m 
                      };
                      saveConversation(activeConversation);
                    }
                  }}
                  selectedModel={selectedModel}
                  onChangeModel={(m) => {
                    setSelectedModel(m);
                    if (activeConversation) {
                      activeConversation.settings = { 
                        ...(activeConversation.settings || { mode: activeMode, language: userPrefs.language }),
                        default_model: m 
                      };
                      saveConversation(activeConversation);
                    }
                  }}
                  onSendMessage={sendMessage}
                  isLoading={isLoading}
                  userPrefs={userPrefs}
                  onQuizCompleted={handleQuizCompleted}
                  onExitQuizMode={handleExitQuizMode}
                  onGenerateFreshQuiz={handleGenerateFreshQuiz}
                />
              </div>
            </div>
          )}

          {/* TAB 3: TOOLS (Screen 04 style) */}
          {activeTab === "tools" && (
            <div className="h-full overflow-hidden flex flex-col">
              <ToolsPanel onSendToChat={(text) => {
                setActiveTab("chat");
                sendMessage(text);
              }} />
            </div>
          )}

          {/* TAB 4: UPLOAD (Screen 05 style) */}
          {activeTab === "upload" && (
            <DocumentProcessor 
              onTextExtracted={handleTextExtracted} 
              isLoading={isLoading}
              compact={false}
            />
          )}

          {/* TAB 5: HISTORY (Screen 08 style) */}
          {activeTab === "history" && (
            <div className="h-full flex flex-col bg-transparent">
              <div className="p-6 border-b border-white/5 shrink-0 glass-panel">
                <h2 className="text-xl font-bold font-display text-white">Study History</h2>
                <p className="text-xs text-text-secondary mt-1">Review, delete or reload previous study blocks</p>
              </div>
              <div className="flex-1 overflow-y-auto">
                <Sidebar
                  conversations={conversations}
                  activeConversationId={activeConversationId}
                  onSelectConversation={(id) => {
                    setActiveConversationId(id);
                    setActiveTab("chat");
                  }}
                  onNewConversation={async () => {
                    await handleNewConversation();
                    setActiveTab("chat");
                  }}
                  onDeleteConversation={handleDeleteConversation}
                  onClearAll={handleClearAll}
                  userPrefs={userPrefs}
                  onUpdatePrefs={handleUpdatePrefs}
                  onImportBackup={handleImportBackup}
                  onExportBackup={handleExportBackup}
                />
              </div>
            </div>
          )}

          {/* TAB 6: PROFILE (Screen 09 style) */}
          {activeTab === "profile" && (
            <div className="h-full flex flex-col overflow-hidden relative">
              <ProfileView
                userPrefs={userPrefs}
                onUpdatePrefs={handleUpdatePrefs}
                onImportBackup={handleImportBackup}
                onExportBackup={handleExportBackup}
                onClearAll={handleClearAll}
              />
              
              {/* Screen 09 Pro Upgrade Banner trigger */}
              <div className="p-4 bg-transparent border-t border-white/5 shrink-0 select-none">
                <div className="liquid-button rounded-[24px] p-4 flex items-center justify-between shadow-lg shadow-violet-600/10">
                  <div>
                    <h4 className="text-xs font-bold text-white tracking-wide">Upgrade to Pro Platform</h4>
                    <p className="text-[10px] text-white/80 mt-0.5">Unlock infinite academic power & model routing.</p>
                  </div>
                  <button 
                    onClick={() => setActiveTab("upgrade")}
                    className="py-1.5 px-4 bg-white/95 text-violet-700 font-bold rounded-xl text-xs hover:bg-white transition-all shadow"
                  >
                    Details
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: PREMIUM UPGRADE (Screen 10 style) */}
          {activeTab === "upgrade" && (
            <div className="h-full overflow-y-auto p-6 md:p-8 bg-transparent flex flex-col items-center justify-center max-w-xl mx-auto w-full select-none text-center">
              
              <button 
                onClick={() => setActiveTab("profile")}
                className="absolute top-6 left-6 flex items-center gap-1.5 text-xs text-text-secondary hover:text-white transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>

              <div className="w-20 h-20 rounded-full bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-3xl mb-4 animate-bounce">
                👑
              </div>

              <h2 className="text-2xl font-bold font-display text-white tracking-tight">Upgrade to Pro</h2>
              <p className="text-xs text-text-secondary mt-1 max-w-sm">
                Unlock unlimited academic intelligence capabilities instantly
              </p>

              {/* Feature checklist */}
              <div className="w-full glass-panel rounded-3xl p-6 mt-6 text-left space-y-4 shadow-2xl relative">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-pink-500 to-violet-500" />
                
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-pink-500/10 flex items-center justify-center text-pink-400">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-semibold text-white">Unlimited AI Chats</span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-pink-500/10 flex items-center justify-center text-pink-400">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-semibold text-white">Advanced AI Models (Llama 70B, Qwen)</span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-pink-500/10 flex items-center justify-center text-pink-400">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-semibold text-white">Unlimited Document Uploads</span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-pink-500/10 flex items-center justify-center text-pink-400">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-semibold text-white">Premium Tools Access (PubChem, arXiv)</span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-pink-500/10 flex items-center justify-center text-pink-400">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-semibold text-white">No Ads</span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-pink-500/10 flex items-center justify-center text-pink-400">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-semibold text-white">Priority Academic Support</span>
                </div>
              </div>

              {/* Price Tag */}
              <div className="mt-6">
                <span className="text-2xl font-bold text-white font-display">₹499</span>
                <span className="text-xs text-text-secondary font-mono"> / month</span>
              </div>

              {/* Upgrade Button */}
              <button 
                onClick={() => {
                  alert("Thank you for supporting RX STUDY AI! Your Pro status is fully validated!");
                  setActiveTab("home");
                }}
                className="w-full max-w-sm mt-4 py-3 liquid-button text-white font-bold rounded-2xl text-sm shadow-xl shadow-pink-500/15 transition-all"
              >
                Upgrade Now
              </button>
            </div>
          )}

        </div>

        {/* Navigation Bar (Mobile-Only bottom nav - Screen 02 style) */}
        <div className="md:hidden h-16 border-t border-white/5 glass-panel flex items-center justify-around shrink-0 select-none pb-safe">
          <button
            onClick={() => setActiveTab("home")}
            className={`flex flex-col items-center gap-1 flex-1 py-1 transition-all ${
              activeTab === "home" ? "text-indigo-400 font-bold scale-105" : "text-text-secondary hover:text-white"
            }`}
          >
            <Home className="w-5 h-5" />
            <span className="text-[9px] tracking-wide">Home</span>
          </button>

          <button
            onClick={() => {
              setActiveTab("chat");
              setActiveMode("single");
            }}
            className={`flex flex-col items-center gap-1 flex-1 py-1 transition-all ${
              activeTab === "chat" ? "text-cyan-400 font-bold scale-105" : "text-text-secondary hover:text-white"
            }`}
          >
            <MessageSquare className="w-5 h-5" />
            <span className="text-[9px] tracking-wide">Chat</span>
          </button>

          <button
            onClick={() => setActiveTab("tools")}
            className={`flex flex-col items-center gap-1 flex-1 py-1 transition-all ${
              activeTab === "tools" ? "text-violet-400 font-bold scale-105" : "text-text-secondary hover:text-white"
            }`}
          >
            <LayoutGrid className="w-5 h-5" />
            <span className="text-[9px] tracking-wide">Tools</span>
          </button>

          <button
            onClick={() => setActiveTab("history")}
            className={`flex flex-col items-center gap-1 flex-1 py-1 transition-all ${
              activeTab === "history" ? "text-amber-400 font-bold scale-105" : "text-text-secondary hover:text-white"
            }`}
          >
            <History className="w-5 h-5" />
            <span className="text-[9px] tracking-wide">History</span>
          </button>

          <button
            onClick={() => setActiveTab("profile")}
            className={`flex flex-col items-center gap-1 flex-1 py-1 transition-all ${
              activeTab === "profile" ? "text-emerald-400 font-bold scale-105" : "text-text-secondary hover:text-white"
            }`}
          >
            <User className="w-5 h-5" />
            <span className="text-[9px] tracking-wide">Profile</span>
          </button>
        </div>

      </div>

      {/* Gamification Level-Up Congratulations Popup */}
      {levelUpMessage && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50 animate-fade">
          <div className="bg-[#121226] border border-indigo-500/30 p-6 rounded-3xl max-w-sm text-center shadow-2xl relative glow-box-blue animate-scale-up">
            <button
              onClick={() => setLevelUpMessage(null)}
              className="absolute top-4 right-4 text-text-secondary hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <Trophy className="w-16 h-16 text-indigo-400 mx-auto mb-4 animate-bounce" />
            <h3 className="text-xl font-bold font-display text-white mb-2">Platform Quest Level Up!</h3>
            <p className="text-xs text-text-primary leading-relaxed mb-5">{levelUpMessage}</p>
            <button
              onClick={() => setLevelUpMessage(null)}
              className="py-3 px-6 bg-gradient-to-r from-indigo-500 to-violet-600 hover:opacity-90 text-white font-bold rounded-xl text-xs w-full shadow-lg shadow-indigo-600/15 transition-all"
            >
              Exemplary! Continue Study Quest
            </button>
          </div>
        </div>
      )}

      {showAdSlot && (
        <div className="fixed bottom-20 right-3 md:bottom-5 md:right-5 z-40 hidden sm:flex flex-col items-end gap-2">
          <button
            onClick={() => setShowAdSlot(false)}
            className="glass-soft rounded-full px-2 py-1 text-[10px] text-text-secondary hover:text-white transition-colors"
          >
            Hide Ad
          </button>
          <div className="glass-panel rounded-2xl px-2 py-2">
            <p className="pb-1 text-center text-[9px] font-mono uppercase tracking-[0.22em] text-text-muted">Sponsored</p>
            <div ref={adContainerRef} style={{ width: 320, minHeight: 50 }} />
          </div>
        </div>
      )}
    </div>
  );
}
