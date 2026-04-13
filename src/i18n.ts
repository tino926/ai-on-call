import * as fs from 'fs';
import * as path from 'path';
import { Context } from 'telegraf';

type TranslationData = Record<string, any>;
export type Language = 'zh-TW' | 'zh-CN' | 'en';

const SUPPORTED_LANGUAGES: Language[] = ['zh-TW', 'zh-CN', 'en'];
const DEFAULT_LANGUAGE: Language = 'zh-TW';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CacheEntry {
  lang: Language;
  timestamp: number;
}

const translations: Map<Language, TranslationData> = new Map();
const userLangCache: Map<number, CacheEntry> = new Map();
const userLangSetting: Map<number, Language> = new Map();

const DATA_DIR = path.join(process.cwd(), 'data');
const USER_LANGS_FILE = path.join(DATA_DIR, 'user-langs.json');

interface StoredUserLang {
  userId: number;
  lang: Language;
  timestamp: number;
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadUserLangSettings(): void {
  ensureDataDir();
  try {
    if (fs.existsSync(USER_LANGS_FILE)) {
      const content = fs.readFileSync(USER_LANGS_FILE, 'utf-8');
      const data: StoredUserLang[] = JSON.parse(content);
      for (const entry of data) {
        userLangSetting.set(entry.userId, entry.lang);
        userLangCache.set(entry.userId, { lang: entry.lang, timestamp: entry.timestamp });
      }
    }
  } catch (e) {
    console.error('Failed to load user language settings:', e);
  }
}

function saveUserLangSettings(): void {
  ensureDataDir();
  try {
    const data: StoredUserLang[] = [];
    for (const [userId, lang] of Array.from(userLangSetting.entries())) {
      const cached = userLangCache.get(userId);
      data.push({
        userId,
        lang,
        timestamp: cached?.timestamp || Date.now(),
      });
    }
    fs.writeFileSync(USER_LANGS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to save user language settings:', e);
  }
}

function loadTranslations(): void {
  const localesDir = path.join(process.cwd(), 'locales');
  
  for (const lang of SUPPORTED_LANGUAGES) {
    const filePath = path.join(localesDir, `${lang}.json`);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      translations.set(lang, JSON.parse(content));
    } catch (e) {
      console.error(`Failed to load ${lang}.json:`, e);
    }
  }
}

loadTranslations();
loadUserLangSettings();

export function getSupportedLanguages(): Language[] {
  return SUPPORTED_LANGUAGES;
}

export function getDefaultLanguage(): Language {
  return DEFAULT_LANGUAGE;
}

function normalizeTelegramLanguage(lang: string | undefined): Language | null {
  if (!lang) return null;
  
  const lower = lang.toLowerCase();
  
  if (lower === 'zh-tw' || lower === 'zh-hant') return 'zh-TW';
  if (lower === 'zh-cn' || lower === 'zh-hans') return 'zh-CN';
  if (lower === 'en') return 'en';
  
  return null;
}

export function getUserLang(ctx: Context): Language {
  const userId = ctx.from?.id;
  
  if (userId) {
    const cached = userLangCache.get(userId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.lang;
    }
    
    const setting = userLangSetting.get(userId);
    if (setting) {
      return setting;
    }
  }
  
  const telegramLang = normalizeTelegramLanguage(ctx.from?.language_code);
  if (telegramLang) {
    if (userId) {
      userLangCache.set(userId, { lang: telegramLang, timestamp: Date.now() });
    }
    return telegramLang;
  }
  
  return DEFAULT_LANGUAGE;
}

export function setUserLang(userId: number, lang: string): boolean {
  const normalized = lang.toLowerCase();
  let targetLang: Language | null = null;
  
  if (normalized === 'zh-tw' || normalized === 'zh-hant') targetLang = 'zh-TW';
  else if (normalized === 'zh-cn' || normalized === 'zh-hans') targetLang = 'zh-CN';
  else if (normalized === 'en') targetLang = 'en';
  
  if (targetLang) {
    userLangSetting.set(userId, targetLang);
    userLangCache.set(userId, { lang: targetLang, timestamp: Date.now() });
    saveUserLangSettings();
    return true;
  }
  
  return false;
}

export function getUserLangSetting(userId: number): Language | undefined {
  return userLangSetting.get(userId);
}

export function t(key: string, lang: Language, params?: Record<string, string>): string {
  const translation = translations.get(lang);
  if (!translation) {
    return key;
  }
  
  const keys = key.split('.');
  let value: any = translation;
  
  for (const k of keys) {
    value = value?.[k];
    if (value === undefined) {
      const fallback = translations.get(DEFAULT_LANGUAGE);
      value = fallback;
      for (const fk of keys) {
        value = value?.[fk];
        if (value === undefined) break;
      }
      if (value === undefined) {
        return key;
      }
      break;
    }
  }
  
  if (typeof value !== 'string') {
    return key;
  }
  
  if (params) {
    for (const [paramKey, paramValue] of Object.entries(params)) {
      value = value.replaceAll(`{${paramKey}}`, paramValue);
    }
  }
  
  return value;
}

export function reloadTranslations(): void {
  translations.clear();
  loadTranslations();
}
