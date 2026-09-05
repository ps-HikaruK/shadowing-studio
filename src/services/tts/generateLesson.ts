import {
  clearSegmentAudioField,
  findAudioByCacheKey,
  getAudioAsset,
  getLesson,
  getSegmentsForLesson,
  updateSegment,
} from "@/db/repositories";
import { describeMetrics, useGenerationStore, type GenerationTask } from "@/stores/generationStore";
import { useSettingsStore } from "@/stores/settingsStore";
import type { Segment, SpeechVariant } from "@/types";
import { computeBackoffMs, maxAttemptsFor } from "./backoff";
import { buildCacheKey } from "./cacheKey";
import { getTtsProvider } from "./index";
import { TtsError } from "./types";

export interface GenerateOptions {
  /** 既に音声があるセグメントも作り直す */
  force?: boolean;
  /** IndexedDB / GAS のキャッシュを使わず API を呼ぶ(課金後の再計測用) */
  bypassCache?: boolean;
  /** 対象を絞る(再試行用) */
  only?: Array<{ segmentId: string; variant: SpeechVariant }>;
  variants?: SpeechVariant[];
}

function taskKey(segmentId: string, variant: SpeechVariant) {
  return `${segmentId}:${variant}`;
}

function audioIdOf(seg: Segment, variant: SpeechVariant) {
  return variant === "natural" ? seg.naturalAudioId : seg.learningAudioId;
}

export function isMockAudioModel(model: string | undefined): boolean {
  return !!model?.startsWith("mock:");
}

/** デモモードで作ったトーン音は、本番生成時には「無いもの」として作り直す */
async function hasUsableAudio(
  seg: Segment,
  variant: SpeechVariant,
  replaceMock: boolean,
): Promise<boolean> {
  const id = audioIdOf(seg, variant);
  if (!id) return false;
  if (!replaceMock) return true;
  const asset = await getAudioAsset(id);
  return !!asset && !isMockAudioModel(asset.model);
}

/** 設定に基づく既定のバリアント。Natural は常に、Learning はオプトイン時のみ */
export function defaultVariants(settings = useSettingsStore.getState()): SpeechVariant[] {
  return settings.generateLearning ? ["natural", "learning"] : ["natural"];
}

/**
 * 教材の全セグメントの音声を生成する。
 * - Natural を文の順に先に作り、Learning(有効時)は後回しにする。先頭の文が出来た時点で再生を始められる
 * - 進捗・計測は generationStore に反映される。既存音声はキャッシュから再利用し API を呼ばない
 */
export async function generateLessonAudio(lessonId: string, options: GenerateOptions = {}): Promise<void> {
  const store = useGenerationStore.getState();
  if (store.running) throw new Error("別の生成処理が実行中です");

  const lesson = await getLesson(lessonId);
  if (!lesson) throw new Error("教材が見つかりません");
  const segments = await getSegmentsForLesson(lessonId);
  const settings = useSettingsStore.getState();
  const provider = getTtsProvider();
  const variants = options.variants ?? defaultVariants(settings);

  const onlySet = options.only ? new Set(options.only.map((o) => taskKey(o.segmentId, o.variant))) : null;
  const replaceMock = !settings.demoMode;
  const tasks: GenerationTask[] = [];
  // バリアント外側・セグメント内側: Natural #1, #2, … → Learning #1, #2, … の順で並ぶ
  for (const variant of variants) {
    for (const seg of segments) {
      const key = taskKey(seg.id, variant);
      if (onlySet && !onlySet.has(key)) continue;
      const has = await hasUsableAudio(seg, variant, replaceMock);
      tasks.push({
        key,
        segmentId: seg.id,
        variant,
        status: has && !options.force ? "skipped" : "pending",
      });
    }
  }
  useGenerationStore.getState().begin(lessonId, tasks);
  // 先頭の文がすでに本番音声を持っていれば「最初の文まで」は 0 とみなす
  const firstSeg = segments[0];
  if (firstSeg && (await hasUsableAudio(firstSeg, "natural", replaceMock)) && !options.force) {
    useGenerationStore.getState().markFirstReady();
  }

  const queue = tasks.filter((t) => t.status === "pending");
  const concurrency = Math.max(1, Math.min(4, settings.concurrency));
  let index = 0;

  const worker = async () => {
    while (index < queue.length) {
      if (useGenerationStore.getState().cancelRequested) return;
      const task = queue[index++];
      const seg = segments.find((s) => s.id === task.segmentId)!;
      await runTask(
        task,
        seg,
        lesson.selectedVoice,
        settings,
        provider,
        seg.order === firstSeg?.order,
        options.bypassCache === true,
      );
    }
  };

  try {
    await Promise.all(Array.from({ length: concurrency }, worker));
    const relinked = await relinkLessonAudio(lessonId);
    if (relinked > 0) console.info(`[tts] 既存の本番音声 ${relinked} 件を結び直しました`);
  } finally {
    const s = useGenerationStore.getState();
    s.finish();
    const elapsed = (s.finishedAt ?? Date.now()) - (s.startedAt ?? Date.now());
    console.info(`[tts] 生成完了: ${describeMetrics(useGenerationStore.getState().metrics, elapsed)}`);
  }
}

async function runTask(
  task: GenerationTask,
  seg: Segment,
  voice: string,
  settings: ReturnType<typeof useSettingsStore.getState>,
  provider: ReturnType<typeof getTtsProvider>,
  isFirstSegment: boolean,
  bypassCache: boolean,
) {
  const gen = useGenerationStore.getState();
  gen.setTask(task.key, { status: "running", error: undefined });
  const stylePrompt = task.variant === "learning" ? settings.learningPrompt : settings.naturalPrompt;
  const taskStarted = performance.now();

  let attempt = 0;
  for (;;) {
    attempt++;
    const callStarted = performance.now();
    try {
      const result = await provider.synthesize({
        text: seg.text,
        voice,
        locale: "en-US",
        variant: task.variant,
        stylePrompt,
        model: settings.model,
        bypassCache,
      });
      const callMs = performance.now() - callStarted;
      if (!result.cacheHit) {
        gen.recordApiCall(callMs);
        console.info(
          `[tts] #${seg.order + 1} ${task.variant} ${Math.round(callMs)}ms` +
            (attempt > 1 ? ` (試行 ${attempt})` : "") +
            (result.durationSec ? ` 音声 ${result.durationSec.toFixed(1)}s` : ""),
        );
      }
      const patch =
        task.variant === "natural"
          ? { naturalAudioId: result.asset.id }
          : { learningAudioId: result.asset.id };
      await updateSegment(seg.id, patch);
      if (isFirstSegment && task.variant === "natural") gen.markFirstReady();
      gen.setTask(task.key, {
        status: result.cacheHit ? "cached" : "done",
        durationMs: Math.round(performance.now() - taskStarted),
        attempts: attempt,
      });
      return;
    } catch (err) {
      const ttsErr = err instanceof TtsError ? err : null;
      const code = ttsErr?.code;
      const retryable = ttsErr ? ttsErr.retryable : true;
      const maxAttempts = maxAttemptsFor(code);
      if (retryable && attempt < maxAttempts) {
        const waitMs = computeBackoffMs(attempt, ttsErr?.retryAfterMs);
        if (code === "rate_limit") gen.recordRateLimit(waitMs, ttsErr?.message);
        console.warn(
          `[tts] #${seg.order + 1} ${task.variant} ${code ?? "error"} → ${Math.round(waitMs / 1000)}s 待って再試行 (${attempt}/${maxAttempts})`,
          ttsErr?.message ?? err,
        );
        await sleep(waitMs);
        if (useGenerationStore.getState().cancelRequested) {
          gen.setTask(task.key, { status: "pending" });
          return;
        }
        continue;
      }
      gen.setTask(task.key, {
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
        retryable,
        durationMs: Math.round(performance.now() - taskStarted),
        attempts: attempt,
      });
      return;
    }
  }
}

/** 失敗したタスクだけを再試行する */
export async function retryFailedTasks(lessonId: string): Promise<void> {
  const failed = Object.values(useGenerationStore.getState().tasks).filter((t) => t.status === "failed");
  if (failed.length === 0) return;
  await generateLessonAudio(lessonId, {
    only: failed.map((t) => ({ segmentId: t.segmentId, variant: t.variant })),
  });
}

/**
 * デモ用トーンを指しているセグメントを、同じ文の本番音声(キャッシュキー一致)へ付け替える。
 * 再計測で Gemini 音声は保存されたが、教材側が古いトーン id のまま、という状態を API なしで直す。
 */
export async function relinkLessonAudio(lessonId: string): Promise<number> {
  const lesson = await getLesson(lessonId);
  if (!lesson) return 0;
  const segments = await getSegmentsForLesson(lessonId);
  const settings = useSettingsStore.getState();
  let n = 0;

  for (const seg of segments) {
    let learningId = seg.learningAudioId;
    for (const variant of ["natural", "learning"] as const) {
      const stylePrompt = variant === "learning" ? settings.learningPrompt : settings.naturalPrompt;
      const rawKey = await buildCacheKey({
        text: seg.text,
        voice: lesson.selectedVoice,
        locale: "en-US",
        variant,
        stylePrompt,
        model: settings.model,
      });
      const real = await findAudioByCacheKey(rawKey);
      if (!real || isMockAudioModel(real.model)) continue;
      const currentId = variant === "natural" ? seg.naturalAudioId : learningId;
      if (currentId === real.id) continue;
      await updateSegment(
        seg.id,
        variant === "natural" ? { naturalAudioId: real.id } : { learningAudioId: real.id },
      );
      if (variant === "learning") learningId = real.id;
      n++;
    }

    if (learningId) {
      const learning = await getAudioAsset(learningId);
      if (learning && isMockAudioModel(learning.model)) {
        await clearSegmentAudioField(seg.id, "learningAudioId");
        n++;
      }
    }
  }
  return n;
}

/** キャッシュを使わず全文を API から作り直す(課金後の再計測用) */
export async function remeasureLessonAudio(lessonId: string): Promise<void> {
  await generateLessonAudio(lessonId, { force: true, bypassCache: true });
}

/** 特定セグメントの音声を作り直す(声を変えた時や文を直した時) */
export async function regenerateSegment(lessonId: string, segmentId: string): Promise<void> {
  await generateLessonAudio(lessonId, {
    force: true,
    only: defaultVariants().map((variant) => ({ segmentId, variant })),
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
