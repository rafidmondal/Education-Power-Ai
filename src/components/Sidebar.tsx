import React, { useState } from "react";
import { Conversation, UserPrefs } from "../types";
import { 
  Plus, Search, Trash2, Download, Upload, Settings, 
  Flame, BookOpen, Volume2, VolumeX, Sparkles, Award, RotateCcw
} from "lucide-react";

interface SidebarProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  onClearAll: () => void;
  userPrefs: UserPrefs;
  onUpdatePrefs: (prefs: Partial<UserPrefs>) => void;
  onImportBackup: (data: string) => void;
  onExportBackup: () => void;
}

export default function Sidebar({
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onClearAll,
  userPrefs,
  onUpdatePrefs,
  onImportBackup,
  onExportBackup,
}: SidebarProps) {
  const [search, setSearch] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  const filteredConversations = conversations.filter(c => 
    c.title.toLowerCase().includes(search.toLowerCase()) ||
    c.messages.some(m => m.content.toLowerCase().includes(search.toLowerCase()))
  );

  const xpNeeded = userPrefs.level * 200;
  const xpPercent = Math.min(100, Math.floor((userPrefs.xp / xpNeeded) * 100));

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        onImportBackup(event.target.result as string);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div id="rx-sidebar" className="w-full lg:w-80 glass-panel border-r border-border-main flex flex-col h-full overflow-hidden select-none">
      {/* Platform Brand */}
      <div className="p-4 border-b border-border-main flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img
            src="/web-logo.png"
            alt="RX Study AI logo"
            className="w-11 h-11 object-contain"
          />
          <div>
            <h1 className="text-white font-bold text-md font-display tracking-tight">RX Study AI</h1>
            <p className="text-[10px] text-text-secondary uppercase tracking-widest font-mono">Learn Smarter</p>
          </div>
        </div>
        <button 
          onClick={() => setShowSettings(!showSettings)}
          className="p-1.5 rounded-lg text-text-secondary hover:text-white hover:bg-bg-tertiary transition-colors"
          title="Platform Settings"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>

      {/* Profile & Gamification Stats */}
      <div className="p-4 border-b border-border-main glass-soft">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Award className="w-4 h-4 text-accent-tertiary" />
            <span className="text-xs font-mono font-medium text-text-primary">LEVEL {userPrefs.level}</span>
          </div>
          <div className="flex items-center gap-1">
            <Flame className="w-4 h-4 text-error" />
            <span className="text-xs font-mono font-medium text-text-primary">{userPrefs.streak} DAY STREAK</span>
          </div>
        </div>
        
        {/* XP Bar */}
        <div className="w-full bg-bg-tertiary h-2 rounded-full overflow-hidden mb-1">
          <div 
            className="bg-accent-secondary h-full transition-all duration-500 rounded-full glow-text-blue"
            style={{ width: `${xpPercent}%` }}
          />
        </div>
        <div className="flex justify-between items-center text-[10px] text-text-secondary font-mono">
          <span>{userPrefs.xp} XP</span>
          <span>{xpNeeded} XP NEXT LEVEL</span>
        </div>
      </div>

      {/* Settings Modal Overlay */}
      {showSettings && (
        <div className="p-4 bg-bg-tertiary/90 border-b border-border-main text-sm animate-fade">
          <div className="flex items-center justify-between mb-3">
            <span className="font-bold text-white font-display">Configure Platform</span>
            <button 
              onClick={() => setShowSettings(false)}
              className="text-text-secondary hover:text-white text-xs px-2 py-0.5 rounded bg-bg-secondary"
            >
              Close
            </button>
          </div>

          <div className="space-y-3">
            {/* Preferred Language */}
            <div>
              <label className="block text-[11px] font-mono text-text-secondary uppercase mb-1">Response Language</label>
              <select 
                value={userPrefs.language}
                onChange={(e) => onUpdatePrefs({ language: e.target.value as any })}
                className="w-full bg-bg-secondary border border-border-main rounded px-2 py-1 text-xs text-white outline-none focus:border-accent-secondary"
              >
                <option value="en">English (US/UK)</option>
                <option value="bn">Bengali (বাংলা)</option>
                <option value="hi">Hindi (हिंदी)</option>
              </select>
            </div>

            {/* Fonts and size */}
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-[11px] font-mono text-text-secondary uppercase mb-1">Text Size</label>
                <select 
                  value={userPrefs.font_size}
                  onChange={(e) => onUpdatePrefs({ font_size: e.target.value as any })}
                  className="w-full bg-bg-secondary border border-border-main rounded px-2 py-1 text-xs text-white outline-none focus:border-accent-secondary"
                >
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                </select>
              </div>

              {/* Sound Settings */}
              <div className="flex flex-col justify-end items-center pb-1">
                <button
                  onClick={() => onUpdatePrefs({ sound_enabled: !userPrefs.sound_enabled })}
                  className="p-2 rounded bg-bg-secondary border border-border-main text-text-primary hover:text-white"
                  title="Toggle Study Soundscapes"
                >
                  {userPrefs.sound_enabled ? <Volume2 className="w-4 h-4 text-success" /> : <VolumeX className="w-4 h-4 text-error" />}
                </button>
              </div>
            </div>

            {/* Platform Backup */}
            <div className="pt-2 border-t border-border-main flex gap-2">
              <button 
                onClick={onExportBackup}
                className="flex-1 flex items-center justify-center gap-1 py-1 px-2 text-xs bg-bg-secondary border border-border-main text-text-primary rounded hover:bg-bg-primary hover:text-white transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Backup JSON
              </button>
              
              <label className="flex-1 flex items-center justify-center gap-1 py-1 px-2 text-xs bg-bg-secondary border border-border-main text-text-primary rounded hover:bg-bg-primary hover:text-white cursor-pointer text-center transition-colors">
                <Upload className="w-3.5 h-3.5" />
                Import
                <input 
                  type="file" 
                  accept=".json" 
                  onChange={handleFileImport} 
                  className="hidden" 
                />
              </label>
            </div>

            {/* Database Wipe */}
            <button 
              onClick={onClearAll}
              className="w-full flex items-center justify-center gap-1.5 py-1 px-2 text-xs bg-error/15 border border-error/30 text-error rounded hover:bg-error/25 transition-colors font-mono uppercase"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Local Storage
            </button>
          </div>
        </div>
      )}

      {/* New Study Conversation Trigger */}
      <div className="p-4">
        <button
          onClick={onNewConversation}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-accent-primary hover:bg-accent-primary/90 text-white rounded-xl text-sm font-semibold font-display tracking-tight transition-all duration-200 glow-box-green"
        >
          <Plus className="w-4 h-4" />
          Start New Study Session
        </button>
      </div>

      {/* Search Conversations */}
      <div className="px-4 mb-2">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-text-secondary" />
          <input
            type="text"
            placeholder="Search study history..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-bg-primary border border-border-main rounded-xl pl-9 pr-4 py-2 text-xs text-white outline-none focus:border-accent-secondary placeholder-text-muted transition-colors"
          />
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1 py-2">
        {filteredConversations.length === 0 ? (
          <div className="p-8 text-center text-xs text-text-muted">
            <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
            No matching study sessions
          </div>
        ) : (
          filteredConversations.map((conv) => {
            const isActive = conv.id === activeConversationId;
            return (
              <div
                key={conv.id}
                className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all duration-200 ${
                  isActive 
                    ? "bg-bg-tertiary border-l-4 border-accent-secondary" 
                    : "hover:bg-bg-tertiary/40 border-l-4 border-transparent"
                }`}
                onClick={() => onSelectConversation(conv.id)}
              >
                <div className="flex-1 min-w-0 pr-2">
                  <div className="text-xs font-semibold text-white truncate font-display">
                    {conv.title}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[10px] text-text-secondary font-mono">
                      {new Date(conv.updated_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                    <span className="text-[10px] text-text-muted font-mono">•</span>
                    <span className="text-[10px] text-accent-secondary font-mono uppercase tracking-wide">
                      {conv.settings?.mode || "study"}
                    </span>
                  </div>
                </div>
                
                {/* Delete Study Session Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteConversation(conv.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-text-secondary hover:text-error hover:bg-bg-secondary transition-all"
                  title="Delete Study History"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Quick Credits */}
      <div className="p-3 border-t border-border-main bg-bg-secondary text-center text-[10px] text-text-muted font-mono">
        RX Platform — 100% Privacy Preserved
      </div>
    </div>
  );
}
