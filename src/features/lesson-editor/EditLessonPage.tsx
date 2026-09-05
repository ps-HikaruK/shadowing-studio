import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Page, PageHeader } from "@/components/PageHeader";
import { toast } from "@/components/Toast";
import { confirmDialog } from "@/components/ConfirmDialog";
import { deleteLesson, getLesson, getSegmentsForLesson, replaceSegments, updateLesson } from "@/db/repositories";
import { generateLessonAudio } from "@/services/tts/generateLesson";
import { isTtsConfigured, useSettingsStore } from "@/stores/settingsStore";
import type { Lesson } from "@/types";
import { VoiceSelector } from "@/features/voice-selector/VoiceSelector";
import { SegmentEditor, type DraftSegment } from "./SegmentEditor";
import { db } from "@/db/db";

export function EditLessonPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const configured = useSettingsStore((s) => isTtsConfigured(s));
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [title, setTitle] = useState("");
  const [voice, setVoice] = useState("");
  const [drafts, setDrafts] = useState<DraftSegment[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const l = await getLesson(id);
      if (!l) {
        toast.error("教材が見つかりません");
        navigate("/", { replace: true });
        return;
      }
      const segs = await getSegmentsForLesson(id);
      setLesson(l);
      setTitle(l.title);
      setVoice(l.selectedVoice);
      setDrafts(
        segs.map((s) => ({
          key: s.id,
          id: s.id,
          text: s.text,
          difficult: s.difficult,
          hasAudio: !!s.naturalAudioId,
        })),
      );
    })();
  }, [id, navigate]);

  const save = async (generateMissing: boolean) => {
    if (!lesson) return;
    const cleaned = drafts.map((d) => ({ ...d, text: d.text.trim() })).filter((d) => d.text);
    if (cleaned.length === 0) {
      toast.error("セグメントが空です");
      return;
    }
    setSaving(true);
    try {
      const voiceChanged = voice !== lesson.selectedVoice;
      await updateLesson(lesson.id, { title: title.trim() || lesson.title, selectedVoice: voice });
      await replaceSegments(
        lesson.id,
        cleaned.map((d) => ({ id: d.id, text: d.text, difficult: d.difficult })),
      );
      if (voiceChanged) {
        // 声を変えたら既存の音声参照を外し、次の生成で作り直す(旧音声はキャッシュとして残る)
        const segs = await getSegmentsForLesson(lesson.id);
        await db.segments.bulkPut(
          segs.map((s) => ({ ...s, naturalAudioId: undefined, learningAudioId: undefined })),
        );
      }
      if (generateMissing) {
        generateLessonAudio(lesson.id).catch((err) =>
          toast.error(err instanceof Error ? err.message : "音声生成を開始できませんでした"),
        );
      }
      toast.success("保存しました");
      navigate(`/lesson/${lesson.id}`, { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!lesson) return;
    const ok = await confirmDialog({
      title: "この教材を削除しますか?",
      message: "セグメント、録音、他の教材で使われていない音声が削除されます。",
      confirmLabel: "削除",
      danger: true,
    });
    if (!ok) return;
    await deleteLesson(lesson.id);
    toast.success("削除しました");
    navigate("/", { replace: true });
  };

  if (!lesson) return null;

  return (
    <>
      <PageHeader title="教材を編集" backTo={`/lesson/${id}`} subtitle={`${drafts.length} セグメント`} />
      <Page className="space-y-5 pb-40">
        <div>
          <label className="label">タイトル</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="label">音声</label>
          <VoiceSelector value={voice} onChange={setVoice} />
          {voice !== lesson.selectedVoice ? (
            <p className="mt-1 text-xs text-amber-400">声を変更すると全セグメントの音声を再生成します</p>
          ) : null}
        </div>
        <div>
          <label className="label">セグメント(文を変更すると、その文だけ再生成されます)</label>
          <SegmentEditor drafts={drafts} onChange={setDrafts} />
        </div>
        <details className="card">
          <summary className="cursor-pointer text-sm text-slate-300">元のスクリプト</summary>
          <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap text-xs text-slate-400">
            {lesson.sourceText}
          </pre>
        </details>
        <button className="btn-danger w-full" onClick={remove}>
          この教材を削除
        </button>
      </Page>
      <div className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-slate-800 bg-slate-950/95 px-4 pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl gap-2">
          <button className="btn-secondary flex-1" disabled={saving} onClick={() => save(false)}>
            保存のみ
          </button>
          <button className="btn-primary flex-[2] py-3" disabled={saving || !configured} onClick={() => save(true)}>
            保存して不足分を生成
          </button>
        </div>
      </div>
    </>
  );
}
