import { useRef, type ChangeEvent } from "react";
import { IconDown, IconMerge, IconPlus, IconSplit, IconTrash, IconUp } from "@/components/Icons";
import { createId } from "@/utils/id";

export interface DraftSegment {
  key: string;
  /** 既存セグメントを編集する場合の id */
  id?: string;
  text: string;
  difficult?: boolean;
  /** 音声が生成済みか(表示用) */
  hasAudio?: boolean;
}

export function toDrafts(texts: string[]): DraftSegment[] {
  return texts.map((text) => ({ key: createId("d"), text }));
}

interface Props {
  drafts: DraftSegment[];
  onChange: (next: DraftSegment[]) => void;
}

export function SegmentEditor({ drafts, onChange }: Props) {
  const refs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  const update = (i: number, patch: Partial<DraftSegment>) => {
    const next = drafts.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const remove = (i: number) => onChange(drafts.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= drafts.length) return;
    const next = drafts.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const mergeWithNext = (i: number) => {
    if (i >= drafts.length - 1) return;
    const merged: DraftSegment = {
      key: createId("d"),
      text: `${drafts[i].text.trim()} ${drafts[i + 1].text.trim()}`.trim(),
      difficult: drafts[i].difficult || drafts[i + 1].difficult,
    };
    const next = drafts.slice();
    next.splice(i, 2, merged);
    onChange(next);
  };
  const splitAtCursor = (i: number) => {
    const el = refs.current[drafts[i].key];
    const text = drafts[i].text;
    let pos = el ? el.selectionStart : -1;
    if (pos <= 0 || pos >= text.length) {
      // カーソルが無ければ中央付近の空白で分割
      const mid = Math.floor(text.length / 2);
      const left = text.lastIndexOf(" ", mid);
      const right = text.indexOf(" ", mid);
      pos = left > 0 && (right < 0 || mid - left <= right - mid) ? left : right;
      if (pos <= 0) return;
    }
    const a = text.slice(0, pos).trim();
    const b = text.slice(pos).trim();
    if (!a || !b) return;
    const next = drafts.slice();
    next.splice(i, 1, { key: createId("d"), text: a, difficult: drafts[i].difficult }, { key: createId("d"), text: b });
    onChange(next);
  };
  const insertAfter = (i: number) => {
    const next = drafts.slice();
    next.splice(i + 1, 0, { key: createId("d"), text: "" });
    onChange(next);
    setTimeout(() => refs.current[next[i + 1].key]?.focus(), 0);
  };

  const autoGrow = (e: ChangeEvent<HTMLTextAreaElement>) => {
    e.target.style.height = "auto";
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  if (drafts.length === 0) {
    return (
      <div className="card text-center text-sm text-slate-400">
        <p>セグメントがありません。</p>
        <button className="btn-secondary mt-3" onClick={() => onChange([{ key: createId("d"), text: "" }])}>
          <IconPlus size={16} /> 1文追加
        </button>
      </div>
    );
  }

  return (
    <ol className="space-y-2">
      {drafts.map((d, i) => (
        <li key={d.key} className="card p-3">
          <div className="flex items-start gap-2">
            <span className="mt-2 w-6 shrink-0 text-right text-xs tabular-nums text-slate-500">{i + 1}</span>
            <textarea
              ref={(el) => {
                refs.current[d.key] = el;
                if (el) {
                  el.style.height = "auto";
                  el.style.height = `${el.scrollHeight}px`;
                }
              }}
              className="input min-h-[2.75rem] resize-none py-2 leading-relaxed"
              rows={1}
              value={d.text}
              placeholder="英文を入力"
              onChange={(e) => {
                autoGrow(e);
                update(i, { text: e.target.value });
              }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between pl-8">
            <div className="flex items-center gap-1">
              <EditorButton label="上へ" disabled={i === 0} onClick={() => move(i, -1)}>
                <IconUp size={16} />
              </EditorButton>
              <EditorButton label="下へ" disabled={i === drafts.length - 1} onClick={() => move(i, 1)}>
                <IconDown size={16} />
              </EditorButton>
              <EditorButton label="カーソル位置で分割" onClick={() => splitAtCursor(i)}>
                <IconSplit size={16} />
              </EditorButton>
              <EditorButton label="次の文と結合" disabled={i === drafts.length - 1} onClick={() => mergeWithNext(i)}>
                <IconMerge size={16} />
              </EditorButton>
              <EditorButton label="下に追加" onClick={() => insertAfter(i)}>
                <IconPlus size={16} />
              </EditorButton>
            </div>
            <div className="flex items-center gap-2">
              {d.hasAudio ? <span className="chip bg-emerald-500/15 text-emerald-300">音声あり</span> : null}
              <EditorButton label="削除" onClick={() => remove(i)} danger>
                <IconTrash size={16} />
              </EditorButton>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function EditorButton({
  children,
  label,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition active:scale-95 disabled:opacity-30 ${
        danger ? "text-rose-400 hover:bg-rose-500/10" : "text-slate-300 hover:bg-slate-800"
      }`}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
