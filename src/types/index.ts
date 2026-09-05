export type SpeechVariant = "natural" | "learning";

export interface Lesson {
  id: string;
  title: string;
  sourceText: string;
  segmentIds: string[];
  selectedVoice: string;
  createdAt: string;
  updatedAt: string;
  lastPracticedAt?: string;
  /** 前回練習していたセグメントの位置(0始まり) */
  lastSegmentIndex?: number;
}

export interface Segment {
  id: string;
  lessonId: string;
  order: number;
  text: string;
  naturalAudioId?: string;
  learningAudioId?: string;
  recordingId?: string;
  difficult: boolean;
}

export interface AudioAsset {
  id: string;
  cacheKey: string;
  blob: Blob;
  mimeType: string;
  model: string;
  voice: string;
  variant: SpeechVariant;
  /** 音声の長さ(秒)。WAV から計算できる場合のみ */
  durationSec?: number;
  createdAt: string;
}

export interface Recording {
  id: string;
  lessonId: string;
  segmentId: string;
  blob: Blob;
  mimeType: string;
  durationSec?: number;
  createdAt: string;
}

export interface PracticeLog {
  id: string;
  lessonId: string;
  segmentId?: string;
  /** 再生・録音・比較などのイベント種別 */
  kind: "play" | "loop" | "record" | "compare" | "session";
  createdAt: string;
}

/** TTS API 呼び出し1回分の利用記録(コスト可視化用) */
export interface UsageRecord {
  id: string;
  createdAt: string;
  model: string;
  voice: string;
  variant: SpeechVariant;
  inputChars: number;
  /** 生成された音声の長さ(秒) */
  audioSec: number;
  cacheHit: boolean;
  ok: boolean;
  error?: string;
}

/**
 * 再生速度。2026-09-04 のレビューで 5 段階(0.6〜1.0)から 3 段階へ簡素化。
 * 0.8 は Learning 音声があればそれを、無ければ Natural を playbackRate で再生する。
 */
export type PlaybackSpeed = 0.8 | 1.0 | 1.2;

export const PLAYBACK_SPEEDS: PlaybackSpeed[] = [0.8, 1.0, 1.2];

/** 旧設定(0.6〜1.0 の 5 段階)を新しい 3 段階へ丸める */
export function normalizePlaybackSpeed(value: unknown): PlaybackSpeed {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 1.0;
  if (n <= 0.85) return 0.8;
  if (n >= 1.1) return 1.2;
  return 1.0;
}

export type GapMode = "none" | "0.5s" | "1s" | "2s" | "mirror";

export type SegmentationMode = "sentence" | "line";
