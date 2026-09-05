import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";
import { confirmDialog } from "@/components/ConfirmDialog";
import { Page, PageHeader } from "@/components/PageHeader";
import { toast } from "@/components/Toast";
import { db } from "@/db/db";
import {
  getStorageStats,
  purgeAllOrphanAudio,
  requestPersistentStorage,
  type StorageStats,
} from "@/db/repositories";
import { backupFileName, downloadJson, exportBackup, importBackup } from "@/utils/backup";
import { estimateTtsCostUsd, formatBytes } from "@/utils/format";

export function DataPage() {
  const [includeAudio, setIncludeAudio] = useState(true);
  const [includeRecordings, setIncludeRecordings] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const usage = useLiveQuery(() => db.usage.toArray(), []);
  // Dexie のテーブルを参照するので、教材・音声・録音の増減に追従して再計算される
  const stats: StorageStats | undefined = useLiveQuery(() => getStorageStats(), []);

  useEffect(() => {
    let active = true;
    navigator.storage
      ?.persisted?.()
      .then((v) => active && setPersisted(v))
      .catch(() => active && setPersisted(null));
    return () => {
      active = false;
    };
  }, []);

  const usageSummary = (() => {
    if (!usage) return null;
    const calls = usage.filter((u) => !u.cacheHit);
    const ok = calls.filter((u) => u.ok);
    const audioSec = ok.reduce((n, u) => n + u.audioSec, 0);
    const chars = ok.reduce((n, u) => n + u.inputChars, 0);
    const cost = ok.reduce((n, u) => n + estimateTtsCostUsd(u.model, u.audioSec, u.inputChars), 0);
    const today = new Date().toDateString();
    const todayCalls = calls.filter((u) => new Date(u.createdAt).toDateString() === today);
    return {
      apiCalls: calls.length,
      failed: calls.length - ok.length,
      cacheHits: usage.length - calls.length,
      audioSec,
      chars,
      cost,
      todayCalls: todayCalls.length,
    };
  })();

  const doExport = async () => {
    setBusy("export");
    try {
      const data = await exportBackup({ includeAudio, includeRecordings });
      downloadJson(data, backupFileName());
      toast.success("バックアップを書き出しました");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "書き出しに失敗しました");
    } finally {
      setBusy(null);
    }
  };

  const doImport = async (file: File) => {
    setBusy("import");
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const summary = await importBackup(json);
      toast.success(`復元: 教材 ${summary.lessons} / 文 ${summary.segments} / 音声 ${summary.audioAssets}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "復元に失敗しました");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const purge = async () => {
    const ok = await confirmDialog({
      title: "未参照の音声を削除しますか?",
      message: "どの教材からも使われていない音声キャッシュだけを削除します。",
      confirmLabel: "削除",
      danger: true,
    });
    if (!ok) return;
    const n = await purgeAllOrphanAudio();
    toast.success(`${n} 件の音声を削除しました`);
  };

  const clearUsage = async () => {
    const ok = await confirmDialog({ title: "API 利用履歴を消去しますか?", confirmLabel: "消去", danger: true });
    if (!ok) return;
    await db.usage.clear();
  };

  const persist = async () => {
    const ok = await requestPersistentStorage();
    setPersisted(ok);
    toast[ok ? "success" : "info"](ok ? "永続ストレージが有効になりました" : "このブラウザでは自動判定されます");
  };

  return (
    <>
      <PageHeader title="データ管理" backTo="/" />
      <Page className="space-y-6">
        <section className="card space-y-3">
          <h2 className="text-sm font-semibold">ストレージ使用量</h2>
          {stats ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-slate-400">教材</dt>
              <dd className="text-right tabular-nums">{stats.lessonCount} 件 / {stats.segmentCount} 文</dd>
              <dt className="text-slate-400">AI 音声キャッシュ</dt>
              <dd className="text-right tabular-nums">
                {stats.audioCount} 件 · {formatBytes(stats.audioBytes)}
              </dd>
              <dt className="text-slate-400">録音</dt>
              <dd className="text-right tabular-nums">
                {stats.recordingCount} 件 · {formatBytes(stats.recordingBytes)}
              </dd>
              {stats.quota ? (
                <>
                  <dt className="text-slate-400">ブラウザの割り当て</dt>
                  <dd className="text-right tabular-nums">
                    {formatBytes(stats.quotaUsage ?? 0)} / {formatBytes(stats.quota)}
                  </dd>
                </>
              ) : null}
            </dl>
          ) : (
            <p className="text-sm text-slate-400">計測中…</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary text-xs" onClick={purge}>
              未参照の音声を削除
            </button>
            <button className="btn-secondary text-xs" onClick={persist} disabled={persisted === true}>
              {persisted ? "永続ストレージ: 有効" : "永続ストレージを要求"}
            </button>
          </div>
          <p className="text-xs text-slate-500">
            iOS の Safari は、ホーム画面に追加した PWA を長期間使わないとデータを消すことがあります。
            定期的に JSON バックアップを取ってください。
          </p>
        </section>

        <section className="card space-y-3">
          <h2 className="text-sm font-semibold">API 利用量(概算)</h2>
          {usageSummary ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-slate-400">TTS 呼び出し</dt>
              <dd className="text-right tabular-nums">
                {usageSummary.apiCalls} 回(今日 {usageSummary.todayCalls})
              </dd>
              <dt className="text-slate-400">失敗</dt>
              <dd className="text-right tabular-nums">{usageSummary.failed} 回</dd>
              <dt className="text-slate-400">キャッシュヒット</dt>
              <dd className="text-right tabular-nums">{usageSummary.cacheHits} 回</dd>
              <dt className="text-slate-400">生成音声</dt>
              <dd className="text-right tabular-nums">
                {(usageSummary.audioSec / 60).toFixed(1)} 分 / {usageSummary.chars.toLocaleString()} 文字
              </dd>
              <dt className="text-slate-400">概算コスト(有料枠換算)</dt>
              <dd className="text-right tabular-nums">${usageSummary.cost.toFixed(3)}</dd>
            </dl>
          ) : null}
          <p className="text-xs text-slate-500">
            音声出力 25 トークン/秒、2.5 Flash $10/1M トークン、3.1 Flash $20/1M トークンで計算。
            Gemini Developer API の無料枠内なら実費は発生しません。
          </p>
          <button className="btn-ghost text-xs" onClick={clearUsage}>
            履歴を消去
          </button>
        </section>

        <section className="card space-y-3">
          <h2 className="text-sm font-semibold">バックアップ(JSON)</h2>
          <label className="flex items-center justify-between text-sm">
            <span>
              AI 音声を含める
              <span className="block text-xs text-slate-400">含めないと復元後に再生成が必要(ファイルは小さい)</span>
            </span>
            <input
              type="checkbox"
              className="h-5 w-5 accent-sky-500"
              checked={includeAudio}
              onChange={(e) => setIncludeAudio(e.target.checked)}
            />
          </label>
          <label className="flex items-center justify-between text-sm">
            <span>自分の録音を含める</span>
            <input
              type="checkbox"
              className="h-5 w-5 accent-sky-500"
              checked={includeRecordings}
              onChange={(e) => setIncludeRecordings(e.target.checked)}
            />
          </label>
          <div className="flex gap-2">
            <button className="btn-primary flex-1" disabled={busy !== null} onClick={doExport}>
              {busy === "export" ? "書き出し中…" : "JSON を書き出す"}
            </button>
            <button className="btn-secondary flex-1" disabled={busy !== null} onClick={() => fileRef.current?.click()}>
              {busy === "import" ? "復元中…" : "JSON から復元"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void doImport(f);
              }}
            />
          </div>
          <p className="text-xs text-slate-500">
            復元は上書きマージです(同じ ID の教材は置き換え、無いものは追加)。
          </p>
        </section>
      </Page>
    </>
  );
}
