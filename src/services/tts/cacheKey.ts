import { normalizeText } from "@/utils/segmenter";
import type { SynthesizeSpeechInput } from "./types";

/**
 * README 3.3 の方針: normalizedText + model + voice + locale + stylePrompt + variant
 * を連結して SHA-256 を取る。
 */
export async function buildCacheKey(input: SynthesizeSpeechInput): Promise<string> {
  const material = [
    normalizeText(input.text),
    input.model,
    input.voice,
    input.locale,
    normalizeText(input.stylePrompt),
    input.variant,
  ].join("\u241f");
  return sha256Hex(material);
}

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // crypto.subtle が無い環境(古い WebView 等)向けの簡易フォールバック
  let h1 = 0x811c9dc5;
  for (const byte of data) {
    h1 ^= byte;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
  }
  return `fnv_${h1.toString(16)}_${data.length}`;
}
