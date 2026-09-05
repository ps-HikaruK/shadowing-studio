import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  IconCompare,
  IconEdit,
  IconEye,
  IconEyeOff,
  IconFlag,
  IconLoop,
  IconMic,
  IconNext,
  IconPause,
  IconPlay,
  IconPrev,
  IconRewind,
  IconSpinner,
  IconStop,
  IconVolume,
} from "@/components/Icons";
import { Page, PageHeader } from "@/components/PageHeader";
import { toast } from "@/components/Toast";
import { confirmDialog } from "@/components/ConfirmDialog";
import { db } from "@/db/db";
import { addPracticeLog, deleteRecordingForSegment, saveRecording, updateSegment } from "@/db/repositories";
import { generateLessonAudio, relinkLessonAudio, remeasureLessonAudio } from "@/services/tts/generateLesson";
import { useGenerationStore } from "@/stores/generationStore";
import { usePlayerStore } from "@/stores/playerStore";
import { isTtsConfigured, useSettingsStore } from "@/stores/settingsStore";
import { PLAYBACK_SPEEDS, type GapMode, type PlaybackSpeed, type Segment } from "@/types";
import { formatSeconds } from "@/utils/format";
import { useRecorder } from "@/features/recorder/useRecorder";
import { GenerationBanner } from "./GenerationBanner";
import { usePlayerEngine } from "./usePlayerEngine";

const GAP_OPTIONS: Array<[GapMode, string]> = [
  ["none", "ポーズなし"],
  ["0.5s", "0.5 秒"],
  ["1s", "1 秒"],
  ["2s", "2 秒"],
  ["mirror", "文と同じ長さ"],
];

/** 非表示中に「一時表示」で英文を見せる秒数 */
const REVEAL_MS = 3000;

/** 速度ボタンの補足ラベル */
const SPEED_HINT: Record<PlaybackSpeed, string> = {
  0.8: "ゆっくり",
  1.0: "標準",
  1.2: "速め",
};

export function PlayerPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();

  // 読み込み中(undefined)と未存在({ lesson: undefined })を区別するためラップする
  const lessonResult = useLiveQuery(async () => ({ lesson: await db.lessons.get(id) }), [id]);
  const lesson = lessonResult?.lesson;
  const segments = useLiveQuery(
    () => db.segments.where("[lessonId+order]").between([id, -Infinity], [id, Infinity]).toArray(),
    [id],
  );
  const initialIndex = lesson ? (lesson.lastSegmentIndex ?? 0) : null;
  const engine = usePlayerEngine(id, segments, initialIndex);

  const player = usePlayerStore();
  const settings = useSettingsStore();
  const configured = isTtsConfigured(settings);
  const generation = useGenerationStore();
  const generating = generation.running && generation.lessonId === id;

  const recorder = useRecorder();
  const [savingRecording, setSavingRecording] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);
  const relinkAttemptedFor = useRef<string | null>(null);
  const engineRef = useRef(engine);
  engineRef.current = engine;

  // 英文非表示中の一時表示(タップで数秒だけ見せる)。
  // 「どの文を表示中か」を持つことで、文が変わったら自動的に非表示へ戻る(次の文を先読みさせない)
  const [revealedIndex, setRevealedIndex] = useState<number | null>(null);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealText = useCallback(() => {
    if (revealTimer.current) clearTimeout(revealTimer.current);
    setRevealedIndex(player.index);
    revealTimer.current = setTimeout(() => setRevealedIndex(null), REVEAL_MS);
  }, [player.index]);
  useEffect(
    () => () => {
      if (revealTimer.current) clearTimeout(revealTimer.current);
    },
    [],
  );
  const textVisible = settings.showText || revealedIndex === player.index;

  const current: Segment | undefined = segments?.[player.index];
  const readyCount = useMemo(
    () => segments?.filter((s) => s.naturalAudioId || s.learningAudioId).length ?? 0,
    [segments],
  );
  const hasAnyAudio = readyCount > 0;

  // 一覧に表示する各文の長さ(秒)。非表示中に英文の代わりに出す
  const audioIds = useMemo(
    () => (segments ?? []).map((s) => s.naturalAudioId ?? s.learningAudioId).filter((x): x is string => !!x),
    [segments],
  );
  const audioMeta = useLiveQuery(async () => {
    if (audioIds.length === 0) return { durations: new Map<string, number>(), hasMock: false };
    const assets = await db.audioAssets.where("id").anyOf(audioIds).toArray();
    return {
      durations: new Map(assets.map((a) => [a.id, a.durationSec ?? 0])),
      hasMock: assets.some((a) => a.model.startsWith("mock:")),
    };
    // 生成完了後に同じ id の中身が差し替わる(再計測)ので finishedAt でも取り直す
  }, [audioIds.join(","), generation.finishedAt]);
  const durationOf = (s: Segment): number | undefined => {
    const id = s.naturalAudioId ?? s.learningAudioId;
    const sec = id ? audioMeta?.durations.get(id) : undefined;
    return sec && sec > 0 ? sec : undefined;
  };
  const hasMockAudio = audioMeta?.hasMock ?? false;

  useEffect(() => {
    if (settings.demoMode || generating || !hasMockAudio || !id) return;
    if (relinkAttemptedFor.current === id) return;
    relinkAttemptedFor.current = id;
    void relinkLessonAudio(id).then((n) => {
      engineRef.current?.clearAudioCache();
      if (n > 0) toast.success(`保存済みの英語音声 ${n} 件を結び直しました。再生して確認してください`);
    });
  }, [hasMockAudio, generating, settings.demoMode, id]);

  useEffect(() => {
    if (lessonResult && !lessonResult.lesson) {
      toast.error("教材が見つかりません");
      navigate("/", { replace: true });
    }
  }, [lessonResult, navigate]);

  // 現在の文が見えるようにスクロール
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${player.index}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [player.index]);

  useEffect(() => {
    if (player.error) toast.error(player.error);
  }, [player.error]);

  // 同じ音声 id の中身を作り直したあと、古い blob URL が残ると 0:00 のままになる
  useEffect(() => {
    if (!generation.finishedAt || generation.running || !engine) return;
    engine.clearAudioCache();
  }, [generation.finishedAt, generation.running, engine]);

  const withUnlock = useCallback(
    (fn: () => void) => () => {
      engine?.unlock();
      fn();
    },
    [engine],
  );

  const startGeneration = () => {
    generateLessonAudio(id).catch((err) => toast.error(err instanceof Error ? err.message : "生成に失敗しました"));
  };

  const remeasureFromApi = async () => {
    const ok = await confirmDialog({
      title: "API から音声を作り直しますか?",
      message:
        "端末内のキャッシュを使わず、Gemini に全文を送ります。課金後の生成時間の計測用です。同じ文でも API 料金がかかります。",
      confirmLabel: "再生成する",
    });
    if (!ok) return;
    remeasureLessonAudio(id).catch((err) => toast.error(err instanceof Error ? err.message : "再生成に失敗しました"));
  };

  const toggleDifficult = async () => {
    if (!current) return;
    await updateSegment(current.id, { difficult: !current.difficult });
  };

  const toggleRecording = async () => {
    if (!current || !engine) return;
    if (recorder.status === "recording") {
      setSavingRecording(true);
      try {
        const result = await recorder.stop();
        if (!result) {
          toast.error("録音データが空でした");
          return;
        }
        const oldId = current.recordingId;
        const rec = await saveRecording({
          lessonId: id,
          segmentId: current.id,
          blob: result.blob,
          mimeType: result.mimeType,
          durationSec: result.durationSec,
        });
        if (oldId) engine.invalidate(oldId);
        engine.invalidate(rec.id);
        void addPracticeLog({ lessonId: id, segmentId: current.id, kind: "record" });
        toast.success("録音を保存しました。「比較」でお手本と聴き比べられます");
      } finally {
        setSavingRecording(false);
      }
      return;
    }
    engine.pause();
    await recorder.start();
  };

  const compare = () => {
    if (!current?.recordingId || !engine) return;
    engine.unlock();
    void addPracticeLog({ lessonId: id, segmentId: current.id, kind: "compare" });
    void engine.compare(player.index);
  };

  const playMyRecording = () => {
    if (!current?.recordingId || !engine) return;
    engine.unlock();
    void engine.playRecording(current.recordingId);
  };

  const removeRecording = async () => {
    if (!current?.recordingId) return;
    engine?.invalidate(current.recordingId);
    await deleteRecordingForSegment(current.id);
    toast.info("録音を削除しました");
  };

  if (!lesson || !segments) return <PageHeader title="読み込み中…" backTo="/" />;

  const isRecording = recorder.status === "recording";
  const phaseLabel =
    player.phase === "gap"
      ? "ポーズ"
      : player.phase === "waiting"
        ? "この文の音声を生成中…"
      : player.phase === "recording"
        ? "自分の録音"
        : player.phase === "compare-model-before"
          ? "比較: お手本"
          : player.phase === "compare-self"
            ? "比較: 自分"
            : player.phase === "compare-model-after"
              ? "比較: お手本(2回目)"
              : player.variant === "learning"
                ? "Learning(ゆっくり)"
                : player.variant === "natural"
                  ? "Natural"
                  : "";

  return (
    <div className="flex min-h-dvh flex-col">
      <PageHeader
        title={lesson.title}
        backTo="/"
        subtitle={`${player.index + 1} / ${segments.length} 文 · ${lesson.selectedVoice}`}
        right={
          <Link to={`/lesson/${id}/edit`} className="btn-ghost h-10 w-10 px-0" aria-label="編集">
            <IconEdit />
          </Link>
        }
      />

      <Page className="flex-1 space-y-3 pb-[21rem]">
        <GenerationBanner lessonId={id} />

        {settings.demoMode ? (
          <div className="card border-amber-500/40 text-sm">
            <p className="font-medium text-amber-200">デモモード中です</p>
            <p className="mt-1 text-slate-400">
              API を呼ばずトーン音を出しています。本番の英語音声にするには、設定でデモモードをオフにしてから生成し直してください。
            </p>
            <Link to="/settings" className="btn-secondary mt-3 inline-flex">
              設定を開く
            </Link>
          </div>
        ) : hasMockAudio && !generating ? (
          <div className="card border-amber-500/40 text-sm">
            <p className="font-medium text-amber-200">いまの音声はデモ用のトーンです</p>
            <p className="mt-1 text-slate-400">Gemini の英語音声ではありません。下のボタンで、保存済みの本番音声があれば結び直し、無ければ生成します。</p>
            <button
              className="btn-primary mt-3"
              disabled={!configured}
              onClick={() => {
                void (async () => {
                  const n = await relinkLessonAudio(id);
                  engine?.clearAudioCache();
                  if (n > 0) {
                    toast.success(`保存済みの英語音声 ${n} 件を結び直しました。再生して確認してください`);
                    return;
                  }
                  await remeasureFromApi();
                })();
              }}
            >
              本番の音声を生成し直す
            </button>
          </div>
        ) : null}

        {!hasAnyAudio && !generating ? (
          <div className="card border-sky-500/30 text-sm">
            <p className="font-medium">音声がまだ生成されていません</p>
            <p className="mt-1 text-slate-400">
              {configured
                ? `${settings.generateLearning ? "Natural / Learning の 2 種類" : "Natural 音声"}を生成して端末に保存します。先頭の文ができた時点から再生でき、以降の再生で API は呼ばれません。`
                : "設定画面で TTS プロキシを登録すると生成できます。"}
            </p>
            <div className="mt-3 flex gap-2">
              <button className="btn-primary flex-1" disabled={!configured} onClick={startGeneration}>
                音声を生成する
              </button>
              {!configured ? (
                <Link to="/settings" className="btn-secondary">
                  設定へ
                </Link>
              ) : null}
            </div>
          </div>
        ) : hasAnyAudio && readyCount < segments.length && !generating ? (
          <div className="card flex flex-col gap-3 border-amber-500/30 text-sm sm:flex-row sm:items-center sm:justify-between">
            <span className="text-amber-200">
              音声が無い文が {segments.length - readyCount} 件あります
            </span>
            <div className="flex shrink-0 gap-2">
              <button className="btn-secondary text-xs" disabled={!configured} onClick={startGeneration}>
                不足分を生成
              </button>
              {configured ? (
                <button className="btn-ghost text-xs" onClick={() => void remeasureFromApi()}>
                  API から再生成
                </button>
              ) : null}
            </div>
          </div>
        ) : hasAnyAudio && !generating && configured ? (
          <div className="flex justify-end">
            <button className="text-[11px] text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline" onClick={() => void remeasureFromApi()}>
              計測のため API から再生成
            </button>
          </div>
        ) : null}

        {/* 現在の文 */}
        <section className="card min-h-[7.5rem]">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>{phaseLabel || "\u00a0"}</span>
            <span className="tabular-nums">
              {formatSeconds(player.currentTime)} / {formatSeconds(player.duration)}
            </span>
          </div>
          {textVisible ? (
            <p className="mt-2 text-xl leading-relaxed font-medium">{current?.text ?? ""}</p>
          ) : (
            // ぼかしは輪郭から推測できるうえ描画も重いので、テキストを DOM に置かず置き換える
            <button
              type="button"
              className="mt-2 flex min-h-[3.5rem] w-full items-center justify-between gap-3 rounded-xl border border-dashed border-slate-700 px-3 py-2 text-left text-sm text-slate-400 transition hover:border-slate-500"
              onClick={revealText}
              aria-label="英文を 3 秒だけ表示"
            >
              <span>
                英文は非表示中
                <span className="block text-xs text-slate-500">タップで 3 秒だけ表示</span>
              </span>
              <IconEye size={18} className="shrink-0 text-slate-500" />
            </button>
          )}
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-sky-500 transition-[width] duration-200"
              style={{ width: `${player.duration ? Math.min(100, (player.currentTime / player.duration) * 100) : 0}%` }}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            {current?.difficult ? <span className="chip bg-rose-500/15 text-rose-300">苦手</span> : null}
            {current?.recordingId ? <span className="chip bg-violet-500/15 text-violet-300">録音あり</span> : null}
            {current && !(current.naturalAudioId || current.learningAudioId) ? (
              <span className="chip bg-slate-700 text-slate-300">音声なし</span>
            ) : null}
          </div>
        </section>

        {/* 文一覧 */}
        <ol ref={listRef} className="space-y-1">
          {segments.map((s, i) => {
            const active = i === player.index;
            const ready = !!(s.naturalAudioId || s.learningAudioId);
            const sec = durationOf(s);
            return (
              <li key={s.id} data-index={i}>
                <button
                  className={`flex w-full items-start gap-3 rounded-xl px-3 text-left transition ${
                    settings.showText ? "py-2.5" : "py-2"
                  } ${active ? "bg-sky-500/15 ring-1 ring-sky-500/50" : "hover:bg-slate-900"}`}
                  onClick={withUnlock(() => (active ? engine?.toggle() : engine?.playSegment(i)))}
                  aria-label={settings.showText ? undefined : `${i + 1} 文目${sec ? ` ${sec.toFixed(1)} 秒` : ""}`}
                >
                  <span className={`mt-0.5 w-6 shrink-0 text-right text-xs tabular-nums ${active ? "text-sky-300" : "text-slate-500"}`}>
                    {i + 1}
                  </span>
                  {settings.showText ? (
                    <span
                      className={`min-w-0 flex-1 text-[15px] leading-relaxed ${
                        active ? "text-white" : ready ? "text-slate-200" : "text-slate-500"
                      }`}
                    >
                      {s.text}
                    </span>
                  ) : (
                    // 非表示中は現在文も含めて英文を出さない。番号と長さだけでナビゲーションする
                    <span className={`min-w-0 flex-1 text-xs tabular-nums ${active ? "text-sky-200" : "text-slate-500"}`}>
                      {sec ? `${sec.toFixed(1)} 秒` : ready ? "" : "生成待ち"}
                    </span>
                  )}
                  <span className="mt-1 flex shrink-0 items-center gap-1">
                    {s.difficult ? <IconFlag size={14} className="text-rose-400" /> : null}
                    {s.recordingId ? <IconMic size={14} className="text-violet-400" /> : null}
                    {!ready ? <span className="h-1.5 w-1.5 rounded-full bg-slate-600" /> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </Page>

      {/* 固定コントロール */}
      <div className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-slate-800 bg-slate-950/95 px-4 pt-3 backdrop-blur">
        <div className="mx-auto max-w-2xl space-y-3">
          {/* 速度 */}
          <div className="flex items-center gap-1">
            <span className="mr-1 text-[11px] text-slate-500">速度</span>
            <div className="flex flex-1 overflow-hidden rounded-xl border border-slate-800 text-sm">
              {PLAYBACK_SPEEDS.map((sp) => (
                <button
                  key={sp}
                  className={`flex-1 py-1.5 tabular-nums transition ${
                    settings.speed === sp ? "bg-slate-700 font-semibold text-white" : "text-slate-400"
                  }`}
                  onClick={() => settings.update({ speed: sp })}
                  aria-label={`${sp.toFixed(1)}×`}
                >
                  {sp.toFixed(1)}×
                  <span className="block text-[10px] font-normal leading-none text-slate-500">{SPEED_HINT[sp]}</span>
                </button>
              ))}
            </div>
          </div>

          {/* トランスポート */}
          <div className="flex items-center justify-between">
            <button
              className={`btn-icon ${settings.loop ? "bg-sky-500/20 text-sky-300 ring-1 ring-sky-500/50" : ""}`}
              aria-label="この文をループ"
              onClick={() => settings.update({ loop: !settings.loop })}
            >
              <IconLoop />
            </button>
            <button className="btn-icon" aria-label="前の文" disabled={player.index === 0} onClick={withUnlock(() => engine?.prev())}>
              <IconPrev />
            </button>
            <button className="btn-icon" aria-label="3秒戻る" onClick={withUnlock(() => engine?.rewind(3))}>
              <IconRewind />
            </button>
            <button
              className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-sky-500 text-slate-950 shadow-lg shadow-sky-500/30 transition active:scale-95 disabled:opacity-40"
              aria-label={player.playing ? "一時停止" : "再生"}
              disabled={(!hasAnyAudio && !generating) || isRecording}
              onClick={withUnlock(() => engine?.toggle())}
            >
              {player.phase === "waiting" && player.playing ? (
                <IconSpinner size={28} />
              ) : player.playing ? (
                <IconPause size={28} />
              ) : (
                <IconPlay size={28} />
              )}
            </button>
            <button
              className="btn-icon"
              aria-label="次の文"
              disabled={player.index >= segments.length - 1}
              onClick={withUnlock(() => engine?.next())}
            >
              <IconNext />
            </button>
            <button
              className={`btn-icon ${player.autoAdvance ? "" : "bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/50"}`}
              aria-label={player.autoAdvance ? "連続再生中(タップで1文ずつ)" : "1文ずつ(タップで連続再生)"}
              title={player.autoAdvance ? "連続再生" : "1文ずつ"}
              onClick={() => player.set({ autoAdvance: !player.autoAdvance })}
            >
              <span className="text-[11px] font-semibold leading-none">{player.autoAdvance ? "連続" : "1文"}</span>
            </button>
          </div>

          {/* 練習ツール */}
          <div className="flex items-center gap-2">
            <button
              className="btn-icon h-11 w-11"
              aria-label={settings.showText ? "英文を隠す" : "英文を表示"}
              onClick={() => settings.update({ showText: !settings.showText })}
            >
              {settings.showText ? <IconEye size={20} /> : <IconEyeOff size={20} />}
            </button>
            <select
              className="input h-11 flex-1 py-0 text-sm"
              value={settings.gapMode}
              onChange={(e) => settings.update({ gapMode: e.target.value as GapMode })}
              aria-label="文間ポーズ"
            >
              {GAP_OPTIONS.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
            <button
              className={`btn-icon h-11 w-11 ${current?.difficult ? "bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/50" : ""}`}
              aria-label="苦手にマーク"
              disabled={!current}
              onClick={toggleDifficult}
            >
              <IconFlag size={20} />
            </button>
            <button
              className={`btn-icon h-11 w-11 ${isRecording ? "recording-pulse bg-rose-600 text-white" : ""}`}
              aria-label={isRecording ? "録音を停止" : "この文を録音"}
              disabled={!current || recorder.status === "unsupported" || savingRecording || recorder.status === "requesting"}
              onClick={withUnlock(() => void toggleRecording())}
            >
              {savingRecording || recorder.status === "requesting" ? (
                <IconSpinner size={20} />
              ) : isRecording ? (
                <IconStop size={20} />
              ) : (
                <IconMic size={20} />
              )}
            </button>
            <button
              className={`btn-icon h-11 w-11 ${player.phase.startsWith("compare") ? "bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/50" : ""}`}
              aria-label="お手本と比較再生"
              disabled={!current?.recordingId || isRecording}
              onClick={compare}
            >
              <IconCompare size={20} />
            </button>
          </div>

          {isRecording ? (
            <p className="text-center text-xs text-rose-300">
              録音中 {recorder.elapsed.toFixed(1)} 秒 — もう一度タップで停止
            </p>
          ) : recorder.error ? (
            <p className="text-center text-xs text-rose-300">{recorder.error}</p>
          ) : current?.recordingId ? (
            <div className="flex items-center justify-center gap-4 text-xs text-slate-400">
              <button className="inline-flex items-center gap-1 underline" onClick={playMyRecording}>
                <IconVolume size={14} /> 自分の録音を聞く
              </button>
              <button className="underline" onClick={removeRecording}>
                録音を削除
              </button>
            </div>
          ) : recorder.status === "unsupported" ? (
            <p className="text-center text-xs text-slate-500">このブラウザは録音に対応していません</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
