import { buildCacheKey } from "./cacheKey";
import type { SynthesizeSpeechInput, SynthesizeSpeechResult, TtsProvider } from "./types";
import { synthesizeToneWav } from "./wav";

/**
 * API を呼ばずにダミー音声を返すプロバイダ。
 * プロキシ未設定時の UI 確認やテストで使う。文字数に応じた長さのトーンを生成する。
 */
export class MockTtsProvider implements TtsProvider {
  readonly name = "mock";
  calls: SynthesizeSpeechInput[] = [];

  constructor(private readonly delayMs = 200) {}

  async synthesize(input: SynthesizeSpeechInput): Promise<SynthesizeSpeechResult> {
    this.calls.push(input);
    if (this.delayMs > 0) await new Promise((r) => setTimeout(r, this.delayMs));
    const words = input.text.split(/\s+/).length;
    const baseSec = Math.max(0.6, words * 0.32);
    const durationSec = input.variant === "learning" ? baseSec / 0.75 : baseSec;
    const frequency = input.variant === "learning" ? 180 : 220;
    const audio = synthesizeToneWav(durationSec, frequency);
    return {
      audio,
      mimeType: audio.type,
      model: `mock:${input.model}`,
      cacheKey: await buildCacheKey(input),
      durationSec,
      cacheHit: false,
    };
  }
}
