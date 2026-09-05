import { create } from "zustand";
import type { SpeechVariant } from "@/types";

export type TaskStatus = "pending" | "running" | "done" | "cached" | "failed" | "skipped";

export interface GenerationTask {
  key: string;
  segmentId: string;
  variant: SpeechVariant;
  status: TaskStatus;
  error?: string;
  retryable?: boolean;
  /** API 呼び出し(待機を含む)にかかった時間(ms) */
  durationMs?: number;
  attempts?: number;
}

/**
 * 生成 1 回分の計測値。「モデル待ち」と「レート制限待ち」を区別するために持つ
 * (2026-09-04 フィードバック 2.1 方針 1)。
 */
export interface GenerationMetrics {
  /** 実際に API へ投げた回数(キャッシュヒットは含まない) */
  apiCalls: number;
  /** API 応答にかかった合計(ms)。バックオフ待機は含まない */
  apiMs: number;
  /** 1 回の API 応答の最長(ms) */
  maxApiMs: number;
  /** 429 を受けた回数 */
  rateLimitHits: number;
  /** 429 後にバックオフで待った合計(ms) */
  rateLimitWaitMs: number;
  /** 最初の Natural 音声が使えるようになるまで(ms)。段階的再生の指標 */
  firstReadyMs?: number;
  /** 直近の 429 本文(quota 名や retry 秒)。バナーに出して課金判断を確定する */
  lastRateLimitDetail?: string;
}

export interface GenerationState {
  lessonId: string | null;
  running: boolean;
  cancelRequested: boolean;
  tasks: Record<string, GenerationTask>;
  startedAt?: number;
  finishedAt?: number;
  lastError?: string;
  metrics: GenerationMetrics;

  begin: (lessonId: string, tasks: GenerationTask[]) => void;
  setTask: (key: string, patch: Partial<GenerationTask>) => void;
  recordApiCall: (ms: number) => void;
  recordRateLimit: (waitMs: number, detail?: string) => void;
  markFirstReady: () => void;
  finish: () => void;
  requestCancel: () => void;
  reset: () => void;
}

const EMPTY_METRICS: GenerationMetrics = {
  apiCalls: 0,
  apiMs: 0,
  maxApiMs: 0,
  rateLimitHits: 0,
  rateLimitWaitMs: 0,
  firstReadyMs: undefined,
  lastRateLimitDetail: undefined,
};

export const useGenerationStore = create<GenerationState>()((set, get) => ({
  lessonId: null,
  running: false,
  cancelRequested: false,
  tasks: {},
  metrics: EMPTY_METRICS,
  begin: (lessonId, tasks) =>
    set({
      lessonId,
      running: true,
      cancelRequested: false,
      tasks: Object.fromEntries(tasks.map((t) => [t.key, t])),
      startedAt: Date.now(),
      finishedAt: undefined,
      lastError: undefined,
      metrics: { ...EMPTY_METRICS },
    }),
  setTask: (key, patch) =>
    set((s) => ({ tasks: { ...s.tasks, [key]: { ...s.tasks[key], ...patch } } })),
  recordApiCall: (ms) =>
    set((s) => ({
      metrics: {
        ...s.metrics,
        apiCalls: s.metrics.apiCalls + 1,
        apiMs: s.metrics.apiMs + ms,
        maxApiMs: Math.max(s.metrics.maxApiMs, ms),
      },
    })),
  recordRateLimit: (waitMs, detail) =>
    set((s) => ({
      metrics: {
        ...s.metrics,
        rateLimitHits: s.metrics.rateLimitHits + 1,
        rateLimitWaitMs: s.metrics.rateLimitWaitMs + waitMs,
        lastRateLimitDetail: detail || s.metrics.lastRateLimitDetail,
      },
    })),
  markFirstReady: () => {
    const { metrics, startedAt } = get();
    if (metrics.firstReadyMs !== undefined || !startedAt) return;
    set({ metrics: { ...metrics, firstReadyMs: Date.now() - startedAt } });
  },
  finish: () => set({ running: false, finishedAt: Date.now() }),
  requestCancel: () => set({ cancelRequested: true }),
  reset: () => set({ lessonId: null, running: false, cancelRequested: false, tasks: {}, metrics: EMPTY_METRICS }),
}));

export function summarizeTasks(tasks: Record<string, GenerationTask>) {
  const list = Object.values(tasks);
  const count = (status: TaskStatus) => list.filter((t) => t.status === status).length;
  const done = count("done") + count("cached") + count("skipped");
  return {
    total: list.length,
    done,
    cached: count("cached"),
    failed: count("failed"),
    running: count("running"),
    pending: count("pending"),
    progress: list.length === 0 ? 1 : done / list.length,
    failedTasks: list.filter((t) => t.status === "failed"),
    hasLearning: list.some((t) => t.variant === "learning"),
  };
}

/** 計測値を人が読める 1 行にする(バナー・コンソール共用) */
export function describeMetrics(m: GenerationMetrics, elapsedMs: number): string {
  const parts: string[] = [];
  parts.push(`経過 ${formatMs(elapsedMs)}`);
  if (m.firstReadyMs !== undefined) parts.push(`最初の文まで ${formatMs(m.firstReadyMs)}`);
  if (m.apiCalls > 0) parts.push(`API ${m.apiCalls} 回 / 平均 ${formatMs(m.apiMs / m.apiCalls)}`);
  if (m.rateLimitHits > 0) parts.push(`429 ${m.rateLimitHits} 回(待機 ${formatMs(m.rateLimitWaitMs)})`);
  const quota = m.lastRateLimitDetail ? summarizeRateLimitDetail(m.lastRateLimitDetail) : undefined;
  if (quota) parts.push(quota);
  return parts.join(" · ");
}

/** quota 名と retry 秒だけ返す。本文に Gemini 429 が無いときは出さない(成功バナーを失敗に見せない) */
export function summarizeRateLimitDetail(detail: string): string | undefined {
  const gemini = /Gemini 429:\s*([^\]\n]+)/i.exec(detail);
  if (!gemini) return undefined;
  const body = gemini[1].trim();
  if (!body) return undefined;
  return body.length > 80 ? `${body.slice(0, 77)}…` : body;
}

export function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0 秒";
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)} 秒`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec} 秒`;
  return `${Math.floor(sec / 60)} 分 ${String(sec % 60).padStart(2, "0")} 秒`;
}
