import { useState } from "react";
import { Page, PageHeader } from "@/components/PageHeader";
import { toast } from "@/components/Toast";
import { GasTtsProvider } from "@/services/tts/gasProvider";
import { PREVIEW_SENTENCES, TTS_MODELS } from "@/services/tts/voices";
import { useSettingsStore } from "@/stores/settingsStore";
import { VoiceSelector } from "@/features/voice-selector/VoiceSelector";

export function SettingsPage() {
  const s = useSettingsStore();
  const [testing, setTesting] = useState(false);

  const testConnection = async () => {
    setTesting(true);
    try {
      const provider = new GasTtsProvider({ endpoint: s.proxyUrl.trim(), token: s.proxyToken.trim() });
      const started = performance.now();
      const result = await provider.synthesize({
        text: "Testing, one two three.",
        voice: s.defaultVoice,
        locale: "en-US",
        variant: "natural",
        stylePrompt: s.naturalPrompt,
        model: s.model,
      });
      const ms = Math.round(performance.now() - started);
      toast.success(`接続OK: ${result.model} / ${(result.audio.size / 1024).toFixed(0)} KB / ${ms} ms`);
      const audio = new Audio(URL.createObjectURL(result.audio));
      await audio.play().catch(() => undefined);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "接続に失敗しました");
    } finally {
      setTesting(false);
    }
  };

  return (
    <>
      <PageHeader title="設定" backTo="/" />
      <Page className="space-y-6">
        <section className="card space-y-3">
          <h2 className="text-sm font-semibold">TTS プロキシ(Google Apps Script)</h2>
          <div>
            <label className="label">Web App URL</label>
            <input
              className="input font-mono text-sm"
              placeholder="https://script.google.com/macros/s/.../exec"
              inputMode="url"
              autoCapitalize="off"
              value={s.proxyUrl}
              onChange={(e) => s.update({ proxyUrl: e.target.value })}
            />
          </div>
          <div>
            <label className="label">共有トークン(GAS の Script Properties: SHARED_TOKEN)</label>
            <input
              className="input font-mono text-sm"
              type="password"
              autoCapitalize="off"
              value={s.proxyToken}
              onChange={(e) => s.update({ proxyToken: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-secondary" disabled={!s.proxyUrl.trim() || testing} onClick={testConnection}>
              {testing ? "接続テスト中…" : "接続テスト(短い音声を生成)"}
            </button>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-xl bg-slate-800/60 px-3 py-2.5 text-sm">
            <span>
              デモモード
              <span className="block text-xs text-slate-400">
                API を呼ばずトーン音で UI を試す。本番の英語音声にはなりません
              </span>
            </span>
            <input
              type="checkbox"
              className="h-5 w-5 accent-sky-500"
              checked={s.demoMode}
              onChange={(e) => s.update({ demoMode: e.target.checked })}
            />
          </label>
          {s.demoMode ? (
            <p className="text-xs text-amber-300">デモモードがオンです。教材の生成はすべてトーン音になります。</p>
          ) : null}
          <p className="text-xs text-slate-500">
            API キーはブラウザに保存されません。GAS 側の Script Properties(GEMINI_API_KEY)で管理します。
            セットアップ手順は README を参照してください。
          </p>
        </section>

        <section className="card space-y-3">
          <h2 className="text-sm font-semibold">音声</h2>
          <div>
            <label className="label">モデル</label>
            <select className="input" value={s.model} onChange={(e) => s.update({ model: e.target.value })}>
              {TTS_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">デフォルトの声(新規教材に適用)</label>
            <VoiceSelector value={s.defaultVoice} onChange={(v) => s.update({ defaultVoice: v })} />
          </div>
          <label className="flex items-center justify-between gap-3 rounded-xl bg-slate-800/60 px-3 py-2.5 text-sm">
            <span>
              ゆっくり音声(Learning)も生成する
              <span className="block text-xs text-slate-400">
                API 呼び出しが 2 倍になります。0.8× は Natural を遅く再生するだけで自然なので、通常はオフで十分です
              </span>
            </span>
            <input
              type="checkbox"
              className="h-5 w-5 shrink-0 accent-sky-500"
              checked={s.generateLearning}
              onChange={(e) => s.update({ generateLearning: e.target.checked })}
            />
          </label>
          <div>
            <label className="label">
              同時生成数(無料枠は 1。有料枠は 2〜3 を推奨。レート制限に当たると自動で待ちます)
            </label>
            <select
              className="input"
              value={s.concurrency}
              onChange={(e) => s.update({ concurrency: Number(e.target.value) })}
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="card space-y-3">
          <h2 className="text-sm font-semibold">スタイルプロンプト</h2>
          <p className="text-xs text-slate-400">
            変更すると新しく生成する音声に反映されます(キャッシュキーが変わるため、既存教材の再生成時は新規生成になります)。
          </p>
          <div>
            <label className="label">Natural variant</label>
            <textarea
              className="input min-h-[9rem] text-sm leading-relaxed"
              value={s.naturalPrompt}
              onChange={(e) => s.update({ naturalPrompt: e.target.value })}
            />
          </div>
          <div>
            <label className="label">
              Learning variant(約 25% 遅く、リンキングを保つ)
              {s.generateLearning ? "" : " — 現在は生成オフ"}
            </label>
            <textarea
              className={`input min-h-[9rem] text-sm leading-relaxed ${s.generateLearning ? "" : "opacity-60"}`}
              value={s.learningPrompt}
              onChange={(e) => s.update({ learningPrompt: e.target.value })}
            />
          </div>
          <button className="btn-ghost text-xs" onClick={() => s.resetPrompts()}>
            プロンプトを初期値に戻す
          </button>
        </section>

        <section className="card space-y-3">
          <h2 className="text-sm font-semibold">教材作成</h2>
          <div>
            <label className="label">デフォルトの分割方法</label>
            <select
              className="input"
              value={s.segmentationMode}
              onChange={(e) => s.update({ segmentationMode: e.target.value as "sentence" | "line" })}
            >
              <option value="sentence">文ごと</option>
              <option value="line">行ごと</option>
            </select>
          </div>
        </section>

        <section className="card space-y-2 text-xs text-slate-400">
          <h2 className="text-sm font-semibold text-slate-200">Phase 0: 音声の A/B テスト</h2>
          <p>
            上の「全音声を比較」で同じ文を各音声で試聴できます。Natural / Learning を切り替えて、
            自分の声域で真似しやすいか・日常会話として自然か・長時間聴いても疲れないかを確認してください。
          </p>
          <p className="font-mono text-[11px] text-slate-500">{PREVIEW_SENTENCES[0]}</p>
        </section>
      </Page>
    </>
  );
}
