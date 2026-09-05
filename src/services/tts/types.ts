import type { SpeechVariant } from "@/types";

export interface SynthesizeSpeechInput {
  text: string;
  voice: string;
  locale: "en-US";
  variant: SpeechVariant;
  stylePrompt: string;
  model: string;
  /**
   * true のとき IndexedDB も GAS の短時間重複キャッシュも使わず API を呼ぶ。
   * 課金後の再計測や、同じ文を意図的に作り直すときに使う。キャッシュキーには含めない。
   */
  bypassCache?: boolean;
}

export interface SynthesizeSpeechResult {
  audio: Blob;
  mimeType: string;
  model: string;
  cacheKey: string;
  durationSec?: number;
  /** IndexedDB のキャッシュから返した場合 true */
  cacheHit: boolean;
}

export interface TtsProvider {
  readonly name: string;
  synthesize(input: SynthesizeSpeechInput): Promise<SynthesizeSpeechResult>;
}

export type TtsErrorCode =
  | "network"
  | "config"
  | "rate_limit"
  | "quota"
  | "invalid_response"
  | "rejected"
  | "server"
  | "unknown";

export class TtsError extends Error {
  /** サーバーが指示した再試行までの待ち時間(ms)。Gemini の `retry in Ns` 由来 */
  readonly retryAfterMs?: number;

  constructor(
    message: string,
    public readonly code: TtsErrorCode = "unknown",
    public readonly retryable = true,
    options: { retryAfterMs?: number } = {},
  ) {
    super(message);
    this.name = "TtsError";
    this.retryAfterMs = options.retryAfterMs;
  }
}
