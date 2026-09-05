import { useLiveQuery } from "dexie-react-hooks";
import { Link } from "react-router-dom";
import { IconDatabase, IconPlus, IconSettings } from "@/components/Icons";
import { Page, PageHeader } from "@/components/PageHeader";
import { db } from "@/db/db";
import { MALE_VOICES } from "@/services/tts/voices";
import { isTtsConfigured, useSettingsStore } from "@/stores/settingsStore";
import { formatRelativeDate } from "@/utils/format";

interface LessonRow {
  id: string;
  title: string;
  segmentCount: number;
  readyCount: number;
  difficultCount: number;
  voice: string;
  lastPracticedAt?: string;
  updatedAt: string;
  lastSegmentIndex: number;
}

export function LessonListPage() {
  const configured = useSettingsStore((s) => isTtsConfigured(s));
  const rows = useLiveQuery(async (): Promise<LessonRow[]> => {
    const lessons = await db.lessons.orderBy("updatedAt").reverse().toArray();
    const segments = await db.segments.toArray();
    return lessons.map((l) => {
      const segs = segments.filter((s) => s.lessonId === l.id);
      return {
        id: l.id,
        title: l.title,
        segmentCount: segs.length,
        readyCount: segs.filter((s) => s.naturalAudioId || s.learningAudioId).length,
        difficultCount: segs.filter((s) => s.difficult).length,
        voice: l.selectedVoice,
        lastPracticedAt: l.lastPracticedAt,
        updatedAt: l.updatedAt,
        lastSegmentIndex: l.lastSegmentIndex ?? 0,
      };
    });
  }, []);

  return (
    <>
      <PageHeader
        title="Shadowing Studio"
        right={
          <div className="flex items-center gap-1">
            <Link to="/data" className="btn-ghost h-10 w-10 px-0" aria-label="データ管理">
              <IconDatabase />
            </Link>
            <Link to="/settings" className="btn-ghost h-10 w-10 px-0" aria-label="設定">
              <IconSettings />
            </Link>
          </div>
        }
      />
      <Page className="space-y-4 pb-28">
        {!configured ? (
          <Link to="/settings" className="card block border-amber-500/40 bg-amber-500/10 text-sm">
            <p className="font-medium text-amber-200">TTS プロキシが未設定です</p>
            <p className="mt-1 text-amber-200/80">
              設定画面で GAS Web App の URL を登録すると音声を生成できます。まず試すだけならデモモードも使えます。
            </p>
          </Link>
        ) : null}

        {rows === undefined ? null : rows.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.id}>
                <Link to={`/lesson/${r.id}`} className="card block transition hover:border-slate-700 active:scale-[0.99]">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{r.title}</h2>
                    <span className="shrink-0 text-xs text-slate-400">{formatRelativeDate(r.lastPracticedAt)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span>{r.segmentCount} 文</span>
                    <span>·</span>
                    <span>{MALE_VOICES.find((v) => v.id === r.voice)?.id ?? r.voice}</span>
                    {r.readyCount === r.segmentCount && r.segmentCount > 0 ? (
                      <span className="chip bg-emerald-500/15 text-emerald-300">音声あり</span>
                    ) : r.readyCount > 0 ? (
                      <span className="chip bg-amber-500/15 text-amber-300">
                        音声 {r.readyCount}/{r.segmentCount}
                      </span>
                    ) : (
                      <span className="chip bg-slate-700 text-slate-300">未生成</span>
                    )}
                    {r.difficultCount > 0 ? (
                      <span className="chip bg-rose-500/15 text-rose-300">苦手 {r.difficultCount}</span>
                    ) : null}
                    {r.lastPracticedAt && r.segmentCount > 0 ? (
                      <span className="ml-auto">
                        {r.lastSegmentIndex + 1}/{r.segmentCount} 文目から再開
                      </span>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Page>
      <div className="safe-bottom fixed inset-x-0 bottom-0 z-20 px-4 pt-3">
        <div className="mx-auto max-w-2xl">
          <Link to="/new" className="btn-primary w-full py-3.5 text-base shadow-lg shadow-sky-500/20">
            <IconPlus /> スクリプトを貼り付けて教材を作る
          </Link>
        </div>
      </div>
    </>
  );
}

function EmptyState() {
  return (
    <div className="card mt-6 text-center">
      <p className="text-lg font-semibold">まだ教材がありません</p>
      <p className="mt-2 text-sm text-slate-400">
        ChatGPT で作った英会話スクリプトをコピーして、下のボタンから貼り付けてください。
        文ごとに分割され、男性 AI 音声でシャドーイング教材になります。
      </p>
      <ol className="mt-4 space-y-1 text-left text-sm text-slate-300">
        <li>1. スクリプトを貼り付け</li>
        <li>2. 分割結果を確認・修正</li>
        <li>3. 音声を生成(端末に保存、再生成なし)</li>
        <li>4. 1 文ずつループ・速度調整・録音比較</li>
      </ol>
    </div>
  );
}
