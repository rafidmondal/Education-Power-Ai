export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  model?: string;
  has_image?: boolean;
  image_url?: string;
  ocr_text?: string;
  mode?: 'single' | 'triple' | 'quiz' | 'diagram' | 'notes';
  metadata?: {
    tokens_used?: number;
    latency_ms?: number;
    quiz_data?: QuizData;
    diagram_code?: string;
    tool_used?: string;
    notes?: boolean;
    mode?: string;
    model_responses?: {
      fast?: ParallelResponse;
      balanced?: ParallelResponse;
      deep?: ParallelResponse;
    };
  };
}

export interface ParallelResponse {
  reply: string;
  model: string;
  latency_ms: number;
  tokens_used: number;
}

export interface QuizQuestion {
  q: string;
  options: string[];
  correct: number;
  explanation: string;
}

export interface QuizData {
  quiz_title: string;
  questions: QuizQuestion[];
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: Message[];
  settings?: {
    default_model: string;
    mode: 'single' | 'triple' | 'quiz' | 'diagram' | 'notes';
    language: string;
  };
  stats?: {
    message_count: number;
    total_tokens: number;
    quiz_score?: number;
    quiz_total?: number;
    study_time_minutes?: number;
  };
}

export interface UserPrefs {
  theme: 'dark' | 'light' | 'auto';
  default_model: string;
  default_mode: 'single' | 'triple' | 'quiz' | 'diagram' | 'notes';
  auto_save: boolean;
  sound_enabled: boolean;
  font_size: 'small' | 'medium' | 'large';
  language: 'en' | 'bn' | 'hi';
  display_name: string;
  avatar_data_url?: string;
  mentor_persona: 'friend' | 'teacher' | 'doctor' | 'coach';
  response_length: 'short' | 'balanced' | 'detailed';
  education_level: 'school' | 'college' | 'university' | 'competitive' | 'self';
  target_exam: string;
  learning_focus: string;
  study_goal: string;
  answer_style: string;
  xp: number;
  level: number;
  streak: number;
  lastActiveDate?: string;
}
