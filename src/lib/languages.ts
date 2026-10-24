import { z } from "zod";
export const languages = {
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
  en: "English",
  ja: "日本語",
  ko: "한국어",
  de: "Deutsch",
  fr: "Français",
  es: "Español",
} as const;
export const languageSchema = z.enum([
  "zh-CN",
  "zh-TW",
  "en",
  "ja",
  "ko",
  "de",
  "fr",
  "es",
]);
export const translationKeySchema = z
  .string()
  .max(100)
  .regex(/^[a-z0-9]*(?:-[a-z0-9]+)*$/);
