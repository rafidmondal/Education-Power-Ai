import React, { useState } from "react";
import { UserPrefs } from "../types";
import {
  Award,
  BookOpen,
  Brain,
  Download,
  Flame,
  GraduationCap,
  HelpCircle,
  ImagePlus,
  Shield,
  Sparkles,
  Target,
  Trash2,
  Upload,
  User,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

interface ProfileViewProps {
  userPrefs: UserPrefs;
  onUpdatePrefs: (prefs: Partial<UserPrefs>) => void;
  onImportBackup: (data: string) => void;
  onExportBackup: () => void;
  onClearAll: () => void;
}

const mentorOptions: { id: UserPrefs["mentor_persona"]; label: string; description: string }[] = [
  { id: "friend", label: "Friend", description: "Casual, easy, supportive explanation style" },
  { id: "teacher", label: "Teacher", description: "Clear academic teaching with structure" },
  { id: "doctor", label: "Doctor", description: "Calm, precise, careful expert tone" },
  { id: "coach", label: "Coach", description: "Motivating, action-focused, progress driven" },
];

const responseLengthOptions: { id: UserPrefs["response_length"]; label: string }[] = [
  { id: "short", label: "Short" },
  { id: "balanced", label: "Balanced" },
  { id: "detailed", label: "Detailed" },
];

const educationLevelOptions: { id: UserPrefs["education_level"]; label: string }[] = [
  { id: "school", label: "School" },
  { id: "college", label: "College" },
  { id: "university", label: "University" },
  { id: "competitive", label: "Competitive Exam" },
  { id: "self", label: "Self Study" },
];

export default function ProfileView({
  userPrefs,
  onUpdatePrefs,
  onImportBackup,
  onExportBackup,
  onClearAll,
}: ProfileViewProps) {
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const xpNeeded = userPrefs.level * 200;
  const xpPercent = Math.min(100, Math.floor((userPrefs.xp / xpNeeded) * 100));
  const avatarInitial = (userPrefs.display_name || "S").trim().charAt(0).toUpperCase();

  const showToast = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 2800);
  };

  const updatePrefs = (prefs: Partial<UserPrefs>, toast?: string) => {
    onUpdatePrefs(prefs);
    if (toast) showToast(toast);
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        onImportBackup(event.target.result as string);
        showToast("Backup imported successfully!");
      }
    };
    reader.readAsText(file);
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      showToast("Profile image should be under 2 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result;
      if (typeof result === "string") {
        updatePrefs({ avatar_data_url: result }, "Profile photo saved locally.");
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-bg-primary overflow-y-auto pb-24">
      {successMsg && (
        <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-success px-4 py-2.5 text-xs font-semibold text-white shadow-lg animate-fade">
          {successMsg}
        </div>
      )}

      <div className="relative overflow-hidden border-b border-border-main bg-gradient-to-b from-bg-secondary via-[#10172a] to-bg-primary p-6 select-none">
        <div className="absolute inset-0 opacity-10 pointer-events-none bg-[radial-gradient(circle_at_top,_var(--color-accent-primary)_0%,_transparent_55%)]" />

        <div className="mx-auto max-w-4xl">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                {userPrefs.avatar_data_url ? (
                  <img
                    src={userPrefs.avatar_data_url}
                    alt="Profile avatar"
                    className="h-24 w-24 rounded-3xl border border-white/10 object-cover shadow-2xl shadow-accent-primary/10"
                  />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-tr from-accent-primary to-accent-pink text-3xl font-bold text-white shadow-2xl shadow-accent-primary/10">
                    {avatarInitial}
                  </div>
                )}
                <div className="absolute -bottom-2 -right-2 rounded-full border border-bg-primary bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white">
                  Local
                </div>
              </div>

              <div>
                <h2 className="text-2xl font-bold font-display tracking-tight text-white">
                  {userPrefs.display_name || "Student"}
                </h2>
                <p className="mt-1 text-xs text-text-secondary">
                  AI mentor: <span className="font-semibold capitalize text-text-primary">{userPrefs.mentor_persona}</span>
                  {" "}• Response style: <span className="font-semibold capitalize text-text-primary">{userPrefs.response_length}</span>
                </p>
                <p className="mt-1 text-[11px] text-text-secondary">
                  Everything in this profile stays in your local browser storage. No backend profile account is used.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:min-w-[280px]">
              <div className="rounded-2xl border border-border-main bg-bg-secondary/70 p-3">
                <div className="flex items-center gap-2 text-accent-amber">
                  <Flame className="h-4 w-4" />
                  <span className="text-[10px] font-mono uppercase text-text-secondary">Streak</span>
                </div>
                <p className="mt-2 text-lg font-bold text-white">{userPrefs.streak} days</p>
              </div>
              <div className="rounded-2xl border border-border-main bg-bg-secondary/70 p-3">
                <div className="flex items-center gap-2 text-accent-purple">
                  <Award className="h-4 w-4" />
                  <span className="text-[10px] font-mono uppercase text-text-secondary">XP</span>
                </div>
                <p className="mt-2 text-lg font-bold text-white">{userPrefs.xp}</p>
              </div>
            </div>
          </div>

          <div className="mt-5 max-w-xl">
            <div className="mb-1.5 flex items-center justify-between text-[10px] font-mono text-text-secondary">
              <span>{userPrefs.xp} / {xpNeeded} XP</span>
                <span>Level {userPrefs.level} {"->"} {userPrefs.level + 1}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-bg-tertiary">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent-primary to-accent-pink transition-all duration-700"
                style={{ width: `${xpPercent}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-4">
        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-border-main bg-bg-secondary/40 p-5">
            <div className="mb-4 flex items-center gap-2">
              <User className="h-5 w-5 text-accent-primary" />
              <div>
                <h3 className="text-sm font-bold text-white">Learner Identity</h3>
                <p className="text-[11px] text-text-secondary">Local profile info for this browser only</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-white">Display Name</label>
                <input
                  type="text"
                  value={userPrefs.display_name}
                  onChange={(e) => updatePrefs({ display_name: e.target.value })}
                  placeholder="Your name"
                  className="w-full rounded-2xl border border-border-main bg-bg-primary px-3 py-2.5 text-xs text-white outline-none transition-all focus:border-accent-primary"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-white">Education Level</label>
                <select
                  value={userPrefs.education_level}
                  onChange={(e) => updatePrefs({ education_level: e.target.value as UserPrefs["education_level"] })}
                  className="w-full rounded-2xl border border-border-main bg-bg-primary px-3 py-2.5 text-xs text-white outline-none transition-all focus:border-accent-primary"
                >
                  {educationLevelOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-[11px] font-semibold text-white">Target Exam / Goal</label>
                <input
                  type="text"
                  value={userPrefs.target_exam}
                  onChange={(e) => updatePrefs({ target_exam: e.target.value })}
                  placeholder="HSC, SSC, NEET, JEE, University admission, semester final..."
                  className="w-full rounded-2xl border border-border-main bg-bg-primary px-3 py-2.5 text-xs text-white outline-none transition-all focus:border-accent-primary"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-border-main bg-bg-primary px-3 py-2 text-xs font-semibold text-text-primary hover:bg-bg-tertiary transition-all">
                <ImagePlus className="h-3.5 w-3.5 text-accent-secondary" />
                Upload DP
                <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
              </label>

              {userPrefs.avatar_data_url && (
                <button
                  onClick={() => updatePrefs({ avatar_data_url: "" }, "Profile photo removed.")}
                  className="inline-flex items-center gap-2 rounded-2xl border border-border-main bg-bg-primary px-3 py-2 text-xs font-semibold text-text-primary hover:bg-bg-tertiary transition-all"
                >
                  <X className="h-3.5 w-3.5 text-accent-pink" />
                  Remove DP
                </button>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-border-main bg-bg-secondary/40 p-5">
            <div className="mb-4 flex items-center gap-2">
              <Shield className="h-5 w-5 text-emerald-400" />
              <div>
                <h3 className="text-sm font-bold text-white">Privacy Snapshot</h3>
                <p className="text-[11px] text-text-secondary">Your profile image and settings stay cached locally</p>
              </div>
            </div>

            <div className="space-y-3 text-xs text-text-secondary">
              <div className="rounded-2xl border border-white/5 bg-bg-primary/60 p-3">
                <p className="font-semibold text-white">Stored locally</p>
                <p className="mt-1">Display photo, name, AI mentor type, answer style, study focus, and profile preferences remain in browser storage only.</p>
              </div>
              <div className="rounded-2xl border border-white/5 bg-bg-primary/60 p-3">
                <p className="font-semibold text-white">Used for better answers</p>
                <p className="mt-1">The app sends only your learning preferences with each chat request so the AI can answer like a friend, teacher, doctor, or coach.</p>
              </div>
              <div className="rounded-2xl border border-white/5 bg-bg-primary/60 p-3">
                <p className="font-semibold text-white">Backup available</p>
                <p className="mt-1">If you export backup JSON, your profile settings and local avatar go with it for this project workspace.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-border-main bg-bg-secondary/40 p-5">
          <div className="mb-4 flex items-center gap-2">
            <Brain className="h-5 w-5 text-accent-purple" />
            <div>
              <h3 className="text-sm font-bold text-white">AI Teaching Style</h3>
              <p className="text-[11px] text-text-secondary">Control how the app should teach and answer for you</p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {mentorOptions.map((option) => (
              <button
                key={option.id}
                onClick={() => updatePrefs({ mentor_persona: option.id })}
                className={`rounded-2xl border p-4 text-left transition-all ${
                  userPrefs.mentor_persona === option.id
                    ? "border-accent-primary bg-accent-primary/10"
                    : "border-border-main bg-bg-primary hover:bg-bg-tertiary"
                }`}
              >
                <p className="text-xs font-bold capitalize text-white">{option.label}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-text-secondary">{option.description}</p>
              </button>
            ))}
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div>
              <label className="mb-2 block text-[11px] font-semibold text-white">Response Length</label>
              <div className="flex gap-2 rounded-2xl border border-border-main bg-bg-primary p-1">
                {responseLengthOptions.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => updatePrefs({ response_length: option.id })}
                    className={`flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
                      userPrefs.response_length === option.id
                        ? "bg-accent-primary text-white"
                        : "text-text-secondary hover:text-white"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-[11px] font-semibold text-white">Preferred Language</label>
              <select
                value={userPrefs.language}
                onChange={(e) => updatePrefs({ language: e.target.value as UserPrefs["language"] })}
                className="w-full rounded-2xl border border-border-main bg-bg-primary px-3 py-2.5 text-xs text-white outline-none transition-all focus:border-accent-primary"
              >
                <option value="en">English</option>
                <option value="bn">Bengali</option>
                <option value="hi">Hindi</option>
              </select>
            </div>

            <div className="lg:col-span-2">
              <label className="mb-2 block text-[11px] font-semibold text-white">What kind of answer do you want?</label>
              <textarea
                value={userPrefs.answer_style}
                onChange={(e) => updatePrefs({ answer_style: e.target.value })}
                placeholder="Example: answer in Bangla, step by step, exam-friendly, use short examples, keep it simple..."
                rows={4}
                className="w-full rounded-2xl border border-border-main bg-bg-primary px-3 py-3 text-xs text-white outline-none transition-all focus:border-accent-primary resize-y"
              />
            </div>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-3xl border border-border-main bg-bg-secondary/40 p-5">
            <div className="mb-4 flex items-center gap-2">
              <Target className="h-5 w-5 text-accent-secondary" />
              <div>
                <h3 className="text-sm font-bold text-white">Learning Focus</h3>
                <p className="text-[11px] text-text-secondary">Guide the AI toward your current subjects and priorities</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-[11px] font-semibold text-white">Current Focus Subjects</label>
                <textarea
                  value={userPrefs.learning_focus}
                  onChange={(e) => updatePrefs({ learning_focus: e.target.value })}
                  placeholder="Math, physics numericals, grammar, coding, biology diagrams..."
                  rows={4}
                  className="w-full rounded-2xl border border-border-main bg-bg-primary px-3 py-3 text-xs text-white outline-none transition-all focus:border-accent-primary resize-y"
                />
              </div>

              <div>
                <label className="mb-2 block text-[11px] font-semibold text-white">Current Study Goal</label>
                <textarea
                  value={userPrefs.study_goal}
                  onChange={(e) => updatePrefs({ study_goal: e.target.value })}
                  placeholder="Finish chapter 5 by tonight, improve MCQ speed, revise organic chemistry..."
                  rows={4}
                  className="w-full rounded-2xl border border-border-main bg-bg-primary px-3 py-3 text-xs text-white outline-none transition-all focus:border-accent-primary resize-y"
                />
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-border-main bg-bg-secondary/40 p-5">
            <div className="mb-4 flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-accent-amber" />
              <div>
                <h3 className="text-sm font-bold text-white">Education App Essentials</h3>
                <p className="text-[11px] text-text-secondary">Useful study controls a learner usually needs</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-2xl border border-border-main bg-bg-primary/70 p-3">
                <div>
                  <p className="text-xs font-semibold text-white">Sound Effects</p>
                  <p className="text-[11px] text-text-secondary">Level-up and quiz feedback sounds</p>
                </div>
                <button
                  onClick={() => updatePrefs({ sound_enabled: !userPrefs.sound_enabled })}
                  className={`rounded-xl border p-2 transition-all ${
                    userPrefs.sound_enabled
                      ? "border-accent-primary bg-accent-primary/20 text-accent-primary"
                      : "border-border-main bg-bg-secondary text-text-secondary"
                  }`}
                >
                  {userPrefs.sound_enabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                </button>
              </div>

              <div className="rounded-2xl border border-border-main bg-bg-primary/70 p-3">
                <p className="text-xs font-semibold text-white">Text Size</p>
                <div className="mt-3 flex gap-2">
                  {(["small", "medium", "large"] as const).map((size) => (
                    <button
                      key={size}
                      onClick={() => updatePrefs({ font_size: size })}
                      className={`rounded-xl px-3 py-2 text-[11px] font-bold capitalize transition-all ${
                        userPrefs.font_size === size
                          ? "bg-accent-primary text-white"
                          : "bg-bg-secondary text-text-secondary hover:text-white"
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-accent-purple/25 bg-gradient-to-r from-accent-purple/10 to-accent-pink/10 p-4">
                <div className="flex items-start gap-3">
                  <Sparkles className="mt-0.5 h-5 w-5 text-accent-pink" />
                  <div>
                    <p className="text-xs font-bold text-white">Live Answer Personalization</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-text-secondary">
                      These profile settings now shape the AI's answer style across chat, notes, diagram, quiz, and parallel modes.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-border-main bg-bg-secondary/40 p-5">
          <div className="mb-4 flex items-center gap-2">
            <Shield className="h-5 w-5 text-accent-primary" />
            <div>
              <h3 className="text-sm font-bold text-white">Backup & Local Workspace</h3>
              <p className="text-[11px] text-text-secondary">Keep your profile and study history safe on this device</p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <button
              onClick={() => {
                onExportBackup();
                showToast("Backup file exported.");
              }}
              className="flex items-center justify-center gap-2 rounded-2xl border border-border-main bg-bg-primary px-4 py-3 text-xs font-semibold text-text-primary transition-all hover:bg-bg-tertiary"
            >
              <Download className="h-4 w-4 text-accent-secondary" />
              Backup JSON
            </button>

            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-border-main bg-bg-primary px-4 py-3 text-xs font-semibold text-text-primary transition-all hover:bg-bg-tertiary">
              <Upload className="h-4 w-4 text-accent-purple" />
              Import Data
              <input type="file" accept=".json" onChange={handleFileImport} className="hidden" />
            </label>
          </div>

          <div className="mt-4 rounded-2xl border border-white/5 bg-bg-primary/60 p-4">
            <div className="flex items-start gap-3">
              <HelpCircle className="mt-0.5 h-4 w-4 text-accent-amber" />
              <p className="text-[11px] leading-relaxed text-text-secondary">
                Exported backup includes your conversations, XP, profile photo data, name, learning goals, and AI preferences for this app.
              </p>
            </div>
          </div>

          <button
            onClick={onClearAll}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-error/25 bg-error/10 px-4 py-3 text-xs font-bold text-error transition-all hover:bg-error/15"
          >
            <Trash2 className="h-4 w-4" />
            Clear Local Workspace Data
          </button>
        </div>
      </div>
    </div>
  );
}
