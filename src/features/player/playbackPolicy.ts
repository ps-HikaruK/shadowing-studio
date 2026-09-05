import { LEARNING_VARIANT_BASE_RATE } from "@/services/tts/prompts";
import type { GapMode, PlaybackSpeed, Segment, SpeechVariant } from "@/types";

export interface ResolvedPlayback {
  audioId: string;
  variant: SpeechVariant;
  /** HTMLAudioElement.playbackRate に設定する値 */
  rate: number;
}

/**
 * README 3.4: 0.8 倍は Learning variant があればそれを、無ければ Natural を playbackRate で再生する。
 * 1.0 / 1.2 倍は Natural variant を使う。
 * Learning variant はもともと約 25% 遅いので、体感速度を合わせるため rate = speed / 0.75 とする。
 * Learning は既定では生成されない(設定でオプトイン)ため、通常は Natural のみで解決される。
 */
export function resolvePlayback(
  segment: Pick<Segment, "naturalAudioId" | "learningAudioId">,
  speed: PlaybackSpeed,
): ResolvedPlayback | null {
  const preferLearning = speed <= 0.8;
  if (preferLearning && segment.learningAudioId) {
    return {
      audioId: segment.learningAudioId,
      variant: "learning",
      rate: round(speed / LEARNING_VARIANT_BASE_RATE),
    };
  }
  if (segment.naturalAudioId) {
    return { audioId: segment.naturalAudioId, variant: "natural", rate: speed };
  }
  if (segment.learningAudioId) {
    return {
      audioId: segment.learningAudioId,
      variant: "learning",
      rate: round(speed / LEARNING_VARIANT_BASE_RATE),
    };
  }
  return null;
}

/** 文と文の間のポーズ(ms)。mirror は直前の文と同じ長さだけ空ける */
export function resolveGapMs(mode: GapMode, lastPlaybackSec: number): number {
  switch (mode) {
    case "none":
      return 0;
    case "0.5s":
      return 500;
    case "1s":
      return 1000;
    case "2s":
      return 2000;
    case "mirror":
      return Math.max(400, Math.round(lastPlaybackSec * 1000));
  }
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}
