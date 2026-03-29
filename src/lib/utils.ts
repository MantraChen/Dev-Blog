import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function estimateReadingTime(content: string): number {
  // Strip markdown syntax to get plain text
  const plain = content
    .replace(/```[\s\S]*?```/g, "")   // code blocks
    .replace(/`[^`]*`/g, "")           // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // images
    .replace(/\[[^\]]*\]\([^)]*\)/g, "$1") // links → text
    .replace(/#{1,6}\s/g, "")          // headings
    .replace(/[*_~>{}\[\]|\\-]/g, "")  // markdown symbols
    .trim();

  const chineseChars = (plain.match(/[\u4e00-\u9fff]/g) || []).length;
  const withoutChinese = plain.replace(/[\u4e00-\u9fff]/g, " ");
  const englishWords = withoutChinese.split(/\s+/).filter(Boolean).length;

  const minutes = chineseChars / 200 + englishWords / 250;
  return Math.max(1, Math.ceil(minutes));
}
