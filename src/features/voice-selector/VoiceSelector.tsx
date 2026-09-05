import { useState } from "react";
import { IconPause, IconSpinner, IconVolume } from "@/components/Icons";
import { MALE_VOICES } from "@/services/tts/voices";
import { isTtsConfigured, useSettingsStore } from "@/stores/settingsStore";
import type { SpeechVariant } from "@/types";
import { useVoicePreview } from "./useVoicePreview";

interface Props {
  value: string;
  onChange: (voice: string) => void;
  /** 全音声を並べて比較するモード(Phase 0 の A/B テスト用) */
  expanded?: boolean;
}

export function VoiceSelector({ value, onChange, expanded: initialExpanded = false }: Props) {
  const [expanded, setExpanded] = useState(initialExpanded);
  const [variant, setVariant] = useState<SpeechVariant>("natural");
  const configured = useSettingsStore((s) => isTtsConfigured(s));
  const { preview, loadingVoice, playingVoice } = useVoicePreview();
  const current = MALE_VOICES.find((v) => v.id === value);

  return (
    <div>
      <div className="flex items-center gap-2">
        <select className="input flex-1" value={value} onChange={(e) => onChange(e.target.value)}>
          {MALE_VOICES.map((v) => (
            <option key={v.id} value={v.id}>
              {v.id} — {v.trait}({v.note})
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn-secondary h-11 w-11 px-0"
          disabled={!configured || loadingVoice !== null}
          onClick={() => preview(value, variant)}
          aria-label="試聴"
          title={configured ? "試聴" : "設定で TTS プロキシを登録すると試聴できます"}
        >
          {loadingVoice === value ? <IconSpinner /> : playingVoice === value ? <IconPause /> : <IconVolume />}
        </button>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
        <span>{current ? `${current.trait} / ${current.note}` : ""}</span>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-slate-700 text-[11px]">
            {(["natural", "learning"] as SpeechVariant[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVariant(v)}
                className={`px-2 py-1 ${variant === v ? "bg-slate-700 text-white" : "text-slate-400"}`}
              >
                {v === "natural" ? "Natural" : "Learning"}
              </button>
            ))}
          </div>
          <button type="button" className="underline" onClick={() => setExpanded((e) => !e)}>
            {expanded ? "閉じる" : "全音声を比較"}
          </button>
        </div>
      </div>
      {expanded ? (
        <ul className="mt-3 divide-y divide-slate-800 overflow-hidden rounded-xl border border-slate-800">
          {MALE_VOICES.map((v) => (
            <li
              key={v.id}
              className={`flex items-center gap-3 px-3 py-2 ${v.id === value ? "bg-sky-500/10" : ""}`}
            >
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onChange(v.id)}>
                <div className="text-sm font-medium">{v.id}</div>
                <div className="text-xs text-slate-400">
                  {v.trait} / {v.note}
                </div>
              </button>
              <button
                type="button"
                className="btn-icon h-10 w-10"
                disabled={!configured || (loadingVoice !== null && loadingVoice !== v.id)}
                onClick={() => preview(v.id, variant)}
                aria-label={`${v.id} を試聴`}
              >
                {loadingVoice === v.id ? (
                  <IconSpinner size={18} />
                ) : playingVoice === v.id ? (
                  <IconPause size={18} />
                ) : (
                  <IconVolume size={18} />
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {!configured ? (
        <p className="mt-2 text-xs text-amber-400">
          試聴には設定画面で TTS プロキシ URL の登録(またはデモモード)が必要です。
        </p>
      ) : null}
    </div>
  );
}
