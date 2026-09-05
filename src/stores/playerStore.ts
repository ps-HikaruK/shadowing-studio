import { create } from "zustand";
import type { SpeechVariant } from "@/types";

export type PlayerPhase =
  | "idle"
  | "model"
  | "gap"
  /** 生成中の文に到達し、音声が出来るのを待っている */
  | "waiting"
  | "recording"
  | "compare-model-before"
  | "compare-self"
  | "compare-model-after";

export interface PlayerState {
  index: number;
  playing: boolean;
  phase: PlayerPhase;
  currentTime: number;
  duration: number;
  variant: SpeechVariant | null;
  /** 連続再生(true)か 1 文ずつ(false)か */
  autoAdvance: boolean;
  error: string | null;

  set: (patch: Partial<Omit<PlayerState, "set">>) => void;
}

export const usePlayerStore = create<PlayerState>()((set) => ({
  index: 0,
  playing: false,
  phase: "idle",
  currentTime: 0,
  duration: 0,
  variant: null,
  autoAdvance: true,
  error: null,
  set: (patch) => set(patch),
}));
