import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_MODEL, DEFAULT_VOICE } from "@/services/tts/voices";
import { LEARNING_STYLE_PROMPT, NATURAL_STYLE_PROMPT } from "@/services/tts/prompts";
import { normalizePlaybackSpeed, type GapMode, type PlaybackSpeed, type SegmentationMode } from "@/types";

export interface SettingsState {
  proxyUrl: string;
  proxyToken: string;
  /** プロキシ未設定時などに、ダミー音声で UI を試すモード */
  demoMode: boolean;
  model: string;
  defaultVoice: string;
  naturalPrompt: string;
  learningPrompt: string;
  /**
   * Learning(約 25% 遅い)音声も生成するか。既定オフ。
   * オンにすると API 呼び出しが 2 倍になる。0.8× は Natural の playbackRate で十分自然だったため、
   * 0.6〜0.7× 相当の高品質なスロー再生が欲しいときだけ有効にする(2026-09-04 フィードバック 2.3)。
   */
  generateLearning: boolean;
  /** 同時に投げる TTS リクエスト数。無料枠では 1 が安全 */
  concurrency: number;
  segmentationMode: SegmentationMode;

  // プレーヤーの永続設定
  speed: PlaybackSpeed;
  showText: boolean;
  gapMode: GapMode;
  loop: boolean;

  update: (patch: Partial<Omit<SettingsState, "update" | "resetPrompts">>) => void;
  resetPrompts: () => void;
}

const envUrl = (import.meta.env.VITE_TTS_PROXY_URL as string | undefined) ?? "";
const envToken = (import.meta.env.VITE_TTS_PROXY_TOKEN as string | undefined) ?? "";

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      proxyUrl: envUrl,
      proxyToken: envToken,
      demoMode: false,
      model: DEFAULT_MODEL,
      defaultVoice: DEFAULT_VOICE,
      naturalPrompt: NATURAL_STYLE_PROMPT,
      learningPrompt: LEARNING_STYLE_PROMPT,
      generateLearning: false,
      concurrency: 1,
      segmentationMode: "sentence",
      speed: 1.0,
      showText: true,
      gapMode: "1s",
      loop: false,
      update: (patch) => set(patch),
      resetPrompts: () =>
        set({ naturalPrompt: NATURAL_STYLE_PROMPT, learningPrompt: LEARNING_STYLE_PROMPT }),
    }),
    {
      name: "shadowing-studio:settings",
      version: 2,
      // 関数を除いた状態のみ保存
      partialize: (s) =>
        Object.fromEntries(Object.entries(s).filter(([, v]) => typeof v !== "function")) as Partial<SettingsState>,
      migrate: (persisted, version) => {
        const s = { ...(persisted as Partial<SettingsState>) };
        if (version < 2) {
          // v1: 速度 5 段階・Learning 常時生成・同時 2。v2 で 3 段階・Learning オプトイン・同時 1 に変更
          s.speed = normalizePlaybackSpeed(s.speed);
          s.generateLearning = false;
          s.concurrency = 1;
        }
        return s as SettingsState;
      },
    },
  ),
);

export function isTtsConfigured(state: Pick<SettingsState, "proxyUrl" | "demoMode">): boolean {
  return state.demoMode || state.proxyUrl.trim().length > 0;
}
