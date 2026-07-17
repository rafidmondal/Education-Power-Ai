import { Conversation, UserPrefs } from "../types";

const DB_NAME = "RXStudyDB";
const DB_VERSION = 2;

export function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains("conversations")) {
        db.createObjectStore("conversations", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "id" });
      }
    };
  });
}

export async function saveConversation(conv: Conversation): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("conversations", "readwrite");
    const store = tx.objectStore("conversations");
    const request = store.put(conv);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getConversation(id: string): Promise<Conversation | undefined> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("conversations", "readonly");
    const store = tx.objectStore("conversations");
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllConversations(): Promise<Conversation[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("conversations", "readonly");
    const store = tx.objectStore("conversations");
    const request = store.getAll();
    request.onsuccess = () => {
      // Sort by updated_at descending
      const list = request.result || [];
      list.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
      resolve(list);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function deleteConversation(id: string): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("conversations", "readwrite");
    const store = tx.objectStore("conversations");
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function clearAllConversations(): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("conversations", "readwrite");
    const store = tx.objectStore("conversations");
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function saveUserPrefs(prefs: UserPrefs): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("settings", "readwrite");
    const store = tx.objectStore("settings");
    const request = store.put({ id: "user_prefs", ...prefs });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getUserPrefs(): Promise<UserPrefs> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("settings", "readonly");
    const store = tx.objectStore("settings");
    const request = store.get("user_prefs");
    request.onsuccess = () => {
      const defaultPrefs: UserPrefs = {
        theme: "dark",
        default_model: "auto",
        default_mode: "single",
        auto_save: true,
        sound_enabled: true,
        font_size: "medium",
        language: "en",
        display_name: "Student",
        avatar_data_url: "",
        mentor_persona: "teacher",
        response_length: "balanced",
        education_level: "school",
        target_exam: "",
        learning_focus: "",
        study_goal: "",
        answer_style: "Explain clearly, step by step, and match my learning level.",
        xp: 0,
        level: 1,
        streak: 0,
        lastActiveDate: new Date().toDateString(),
      };
      resolve(request.result ? { ...defaultPrefs, ...request.result } : defaultPrefs);
    };
    request.onerror = () => reject(request.error);
  });
}
