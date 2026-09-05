import { useEffect, useState } from "react";
import { IconAlert, IconCheck, IconSpinner } from "@/components/Icons";
import { toast } from "@/components/Toast";
import { retryFailedTasks } from "@/services/tts/generateLesson";
import { describeMetrics, summarizeTasks, useGenerationStore } from "@/stores/generationStore";
import { useSettingsStore } from "@/stores/settingsStore";

/** 生成中は 1 秒ごとに現在時刻を更新して経過時間を進める */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

export function GenerationBanner({ lessonId }: { lessonId: string }) {
  const state = useGenerationStore();
  const demoMode = useSettingsStore((s) => s.demoMode);
  const [dismissedAt, setDismissedAt] = useState<number | undefined>(undefined);
  const now = useNow(state.running);

  // 正常完了から 1 分後にバナーを自動で閉じる
  useEffect(() => {
    if (state.running || !state.finishedAt) return;
    const timer = setTimeout(() => setDismissedAt(state.finishedAt), 60_000);
    return () => clearTimeout(timer);
  }, [state.running, state.finishedAt]);

  if (state.lessonId !== lessonId) return null;
  const s = summarizeTasks(state.tasks);
  if (s.total === 0) return null;
  const finishedClean = !state.running && s.failed === 0;
  if (finishedClean && dismissedAt === state.finishedAt) return null;

  const endMs = state.running ? now : (state.finishedAt ?? now);
  const elapsedMs = Math.max(0, endMs - (state.startedAt ?? endMs));
  const metricsLine = describeMetrics(state.metrics, elapsedMs);
  const firstReady = state.metrics.firstReadyMs !== undefined;

  return (
    <div
      className={`card mb-3 ${s.failed > 0 && !state.running ? "border-rose-500/40" : finishedClean ? "border-emerald-500/40" : "border-sky-500/40"}`}
    >
      <div className="flex items-center gap-3">
        {state.running ? (
          <IconSpinner className="text-sky-400" />
        ) : s.failed > 0 ? (
          <IconAlert className="text-rose-400" />
        ) : (
          <IconCheck className="text-emerald-400" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {state.running
              ? `音声を生成中… ${s.done + s.failed}/${s.total}`
              : s.failed > 0
                ? `${s.failed} 件の生成に失敗しました`
                : "音声の生成が完了しました"}
          </p>
          <p className="text-xs text-slate-400">
            {demoMode ? "デモモード: トーン音を生成しています · " : ""}
            {s.cached > 0 ? `キャッシュ再利用 ${s.cached} · ` : ""}
            {s.hasLearning ? "Natural / Learning の 2 種類を生成します" : "Natural 音声を生成します"}
            {state.running && firstReady ? " · できた文から再生できます" : ""}
          </p>
          <p className="mt-0.5 text-[11px] tabular-nums text-slate-500" aria-live="off">
            {metricsLine}
          </p>
        </div>
        {state.running ? (
          <button className="btn-ghost text-xs" onClick={() => state.requestCancel()}>
            中断
          </button>
        ) : s.failed > 0 ? (
          <button
            className="btn-secondary text-xs"
            onClick={() =>
              retryFailedTasks(lessonId).catch((e) => toast.error(e instanceof Error ? e.message : "再試行に失敗"))
            }
          >
            失敗分を再試行
          </button>
        ) : null}
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full transition-all ${s.failed > 0 && !state.running ? "bg-rose-500" : "bg-sky-500"}`}
          style={{ width: `${Math.round(((s.done + s.failed) / s.total) * 100)}%` }}
        />
      </div>
      {!state.running && s.failedTasks.length > 0 ? (
        <ul className="mt-2 space-y-0.5 text-xs text-rose-300">
          {Array.from(new Set(s.failedTasks.map((t) => t.error))).slice(0, 3).map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
