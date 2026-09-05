import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Page, PageHeader } from "@/components/PageHeader";
import { toast } from "@/components/Toast";
import { createLesson } from "@/db/repositories";
import { generateLessonAudio } from "@/services/tts/generateLesson";
import { isTtsConfigured, useSettingsStore } from "@/stores/settingsStore";
import type { SegmentationMode } from "@/types";
import { segmentScript, suggestTitle } from "@/utils/segmenter";
import { VoiceSelector } from "@/features/voice-selector/VoiceSelector";
import { SegmentEditor, toDrafts, type DraftSegment } from "./SegmentEditor";

type Step = "paste" | "review";

export function ImportPage() {
  const navigate = useNavigate();
  const settings = useSettingsStore();
  const configured = isTtsConfigured(settings);

  const [step, setStep] = useState<Step>("paste");
  const [source, setSource] = useState("");
  const [mode, setMode] = useState<SegmentationMode>(settings.segmentationMode);
  const [drafts, setDrafts] = useState<DraftSegment[]>([]);
  const [title, setTitle] = useState("");
  const [voice, setVoice] = useState(settings.defaultVoice);
  const [saving, setSaving] = useState(false);

  const runSegmentation = () => {
    const texts = segmentScript(source, { mode });
    if (texts.length === 0) {
      toast.error("英文が見つかりませんでした。貼り付けた内容を確認してください");
      return;
    }
    setDrafts(toDrafts(texts));
    setTitle((t) => t || suggestTitle(texts));
    setStep("review");
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        toast.info("クリップボードが空です");
        return;
      }
      setSource(text);
    } catch {
      toast.error("クリップボードを読み取れません。長押しして貼り付けてください");
    }
  };

  const save = async (generate: boolean) => {
    const texts = drafts.map((d) => d.text.trim()).filter(Boolean);
    if (texts.length === 0) {
      toast.error("セグメントが空です");
      return;
    }
    setSaving(true);
    try {
      const lesson = await createLesson({
        title: title.trim() || suggestTitle(texts),
        sourceText: source,
        segmentTexts: texts,
        selectedVoice: voice,
      });
      if (generate) {
        generateLessonAudio(lesson.id).catch((err) =>
          toast.error(err instanceof Error ? err.message : "音声生成を開始できませんでした"),
        );
      }
      navigate(`/lesson/${lesson.id}`, { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  if (step === "paste") {
    return (
      <>
        <PageHeader title="新しい教材" backTo="/" />
        <Page className="space-y-4">
          <div>
            <label className="label">ChatGPT のスクリプトを貼り付け</label>
            <textarea
              className="input min-h-[45vh] resize-y leading-relaxed"
              placeholder={
                "例:\nA: Hey, how's it going?\nB: Not bad. I've been swamped with work lately, though.\n\n日本語訳や Markdown 記法は自動で取り除かれます。"
              }
              value={source}
              onChange={(e) => setSource(e.target.value)}
            />
            <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
              <span>{source.length.toLocaleString()} 文字</span>
              <div className="flex gap-3">
                <button type="button" className="underline" onClick={pasteFromClipboard}>
                  クリップボードから貼り付け
                </button>
                {source ? (
                  <button type="button" className="underline" onClick={() => setSource("")}>
                    クリア
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div>
            <label className="label">分割方法</label>
            <div className="flex overflow-hidden rounded-xl border border-slate-700 text-sm">
              {(
                [
                  ["sentence", "文ごと(推奨)"],
                  ["line", "行ごと"],
                ] as Array<[SegmentationMode, string]>
              ).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`flex-1 py-2.5 ${mode === m ? "bg-slate-700 text-white" : "text-slate-400"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <button className="btn-primary w-full py-3 text-base" disabled={!source.trim()} onClick={runSegmentation}>
            分割して確認する
          </button>
        </Page>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="分割結果を確認"
        onBack={() => setStep("paste")}
        subtitle={`${drafts.length} セグメント`}
      />
      <Page className="space-y-5 pb-36">
        <div>
          <label className="label">タイトル</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="label">音声</label>
          <VoiceSelector value={voice} onChange={setVoice} />
        </div>
        <div>
          <label className="label">セグメント(TTS 生成前に確認・修正)</label>
          <SegmentEditor drafts={drafts} onChange={setDrafts} />
        </div>
      </Page>
      <div className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-slate-800 bg-slate-950/95 px-4 pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl gap-2">
          <button className="btn-secondary flex-1" disabled={saving} onClick={() => save(false)}>
            保存のみ
          </button>
          <button
            className="btn-primary flex-[2] py-3"
            disabled={saving || !configured}
            onClick={() => save(true)}
            title={configured ? "" : "設定で TTS プロキシを登録してください"}
          >
            保存して音声を生成
          </button>
        </div>
        {!configured ? (
          <p className="mx-auto mt-2 max-w-2xl text-center text-xs text-amber-400">
            音声生成には設定画面で TTS プロキシの登録が必要です(保存だけは可能)
          </p>
        ) : null}
      </div>
    </>
  );
}
