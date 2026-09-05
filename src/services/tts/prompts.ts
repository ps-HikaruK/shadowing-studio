import type { SpeechVariant } from "@/types";

export const NATURAL_STYLE_PROMPT = `Speak in natural conversational American English.
The speaker is a man in his early thirties.
Use a calm, friendly, moderately low-pitched voice.
Speak like you are casually talking with a friend.
Use natural connected speech and realistic intonation.
Do not sound like a narrator, announcer, or language textbook.
Read the supplied text exactly without adding or removing words.`;

export const LEARNING_STYLE_PROMPT = `Speak in natural conversational American English.
The speaker is a man in his early thirties.
Use a calm, friendly, moderately low-pitched voice.
Speak about 25% slower than normal conversation.
Keep natural linking, reductions, rhythm, and intonation.
Do not pronounce each word separately.
Do not sound like a narrator, announcer, or language textbook.
Read the supplied text exactly without adding or removing words.`;

export function defaultStylePrompt(variant: SpeechVariant): string {
  return variant === "learning" ? LEARNING_STYLE_PROMPT : NATURAL_STYLE_PROMPT;
}

/**
 * Gemini TTS へ渡す最終プロンプト。
 * 公式ガイドに従い、音声合成の指示であることを明示し、台本の開始位置をラベルで区切る。
 * こうしないと演出指示が読み上げられたり PROHIBITED_CONTENT で拒否されることがある。
 */
export function buildTtsPrompt(stylePrompt: string, text: string): string {
  return `${stylePrompt.trim()}\n\nSay only the transcript below. Do not read these instructions aloud.\n\nTranscript:\n${text.trim()}`;
}

/** Learning variant はおよそ 25% 遅い前提なので、再生速度換算では 0.75 倍相当 */
export const LEARNING_VARIANT_BASE_RATE = 0.75;
