import type { SegmentationMode } from "@/types";

export interface SegmentationOptions {
  mode?: SegmentationMode;
  /** これより長い文は節の区切りで分割する。0 で無効 */
  maxChars?: number;
}

const DEFAULT_MAX_CHARS = 160;

const LATIN_RE = /[A-Za-z]/g;
const CJK_RE = /[\u3040-\u30ff\u3400-\u9fff\uff66-\uff9f]/g;

const ABBREVIATIONS = [
  "Mr",
  "Mrs",
  "Ms",
  "Dr",
  "Prof",
  "Sr",
  "Jr",
  "St",
  "Mt",
  "vs",
  "etc",
  "approx",
  "dept",
  "e.g",
  "i.e",
  "a.m",
  "p.m",
  "U.S",
  "U.K",
];

const DOT = "\u0001";
const ELLIPSIS = "\u0002";

/**
 * ChatGPT のスクリプトから英文行だけを抽出する。
 * Markdown 記法、話者ラベル、日本語訳、区切り線を取り除く。
 */
export function extractEnglishLines(source: string): string[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const result: string[] = [];
  for (const raw of lines) {
    const cleaned = cleanLine(raw);
    if (cleaned && isEnglishLine(cleaned)) result.push(cleaned);
  }
  return result;
}

export function cleanLine(raw: string): string {
  let line = raw.trim();
  if (!line) return "";
  if (/^[-=_*~#>]{3,}$/.test(line)) return "";

  // Markdown: 見出し・引用・リスト・番号
  line = line.replace(/^#{1,6}\s+/, "");
  line = line.replace(/^>\s?/, "");
  line = line.replace(/^(?:[-*+•▪◦]|\d{1,3}[.)]|\(\d{1,3}\))\s+/, "");
  // 強調・インラインコード
  line = line.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1");
  line = line.replace(/(^|\s)\*(\S[^*]*?)\*(?=\s|$|[.,!?])/g, "$1$2");
  line = line.replace(/`([^`]+)`/g, "$1");
  line = line.replace(/\*\*|__/g, "");

  // 日本語の括弧書き(訳注)を除去
  line = line.replace(/（[^）]*）/g, "");
  line = line.replace(/\([^)]*[\u3040-\u9fff][^)]*\)/g, "");
  line = line.replace(/【[^】]*】/g, "");

  // 話者ラベル: "A:", "You:", "ChatGPT:", "あなた：" など
  line = line.replace(/^(?!\d)[^\s:：]{1,20}(?:\s[^\s:：]{1,20})?\s*[:：]\s*(?!\/\/)(?=\S)/, "");

  // 行全体を包む引用符を外す
  line = line.trim();
  const quoted = line.match(/^["“「](.+)["”」]$/);
  if (quoted) line = quoted[1].trim();

  return line.replace(/\s+/g, " ").trim();
}

export function isEnglishLine(line: string): boolean {
  const latin = (line.match(LATIN_RE) ?? []).length;
  const cjk = (line.match(CJK_RE) ?? []).length;
  if (latin < 2) return false;
  return latin / (latin + cjk) >= 0.6;
}

/** 1行の英文を文単位に分割する */
export function splitSentences(line: string): string[] {
  let text = line;
  text = text.replace(/\.{3}|…/g, ELLIPSIS);
  for (const abbr of ABBREVIATIONS) {
    const re = new RegExp(`\\b${abbr.replace(/\./g, "\\.")}\\.`, "g");
    text = text.replace(re, () => abbr.replace(/\./g, DOT) + DOT);
  }
  // 小数・イニシャル(例: 3.5 / J.K.)
  text = text.replace(/(\d)\.(\d)/g, `$1${DOT}$2`);
  text = text.replace(/\b([A-Z])\.(?=[A-Z]\.)/g, `$1${DOT}`);

  // 終端記号(省略記号を含む)+ 閉じ引用符の後の空白で、次が大文字・数字なら分割
  const parts = text.split(new RegExp(`(?<=[.!?${ELLIPSIS}]["'”’)]*)\\s+(?=["'“‘(]*[A-Z0-9])`));
  return parts
    .map((p) => p.replace(new RegExp(DOT, "g"), ".").replace(new RegExp(ELLIPSIS, "g"), "...").trim())
    .filter(Boolean);
}

/** 長い文を節の境界(, ; — など)で分割する */
export function splitLongSentence(text: string, maxChars: number): string[] {
  if (maxChars <= 0 || text.length <= maxChars) return [text];
  const boundary = /[,;:—–]\s+|\s+(?:and|but|so|because|which|that|when|while|although)\s+/g;
  const candidates: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = boundary.exec(text)) !== null) {
    // 区切り記号は前半側に残す
    const idx = /^[,;:—–]/.test(m[0]) ? m.index + 1 : m.index;
    if (idx > 15 && text.length - idx > 15) candidates.push(idx);
  }
  if (candidates.length === 0) return [text];
  const mid = text.length / 2;
  const best = candidates.reduce((a, b) => (Math.abs(b - mid) < Math.abs(a - mid) ? b : a));
  const left = text.slice(0, best).trim();
  const right = text.slice(best).trim();
  return [...splitLongSentence(left, maxChars), ...splitLongSentence(right, maxChars)];
}

/** スクリプト全文から練習セグメントの配列を作る */
export function segmentScript(source: string, options: SegmentationOptions = {}): string[] {
  const mode = options.mode ?? "sentence";
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const lines = extractEnglishLines(source);
  const units = mode === "line" ? lines : lines.flatMap(splitSentences);
  return units.flatMap((u) => splitLongSentence(u, maxChars)).filter((u) => u.length > 0);
}

/** 教材タイトルの自動生成(先頭文を短く切る) */
export function suggestTitle(segments: string[], maxLen = 40): string {
  const first = segments.find((s) => s.trim().length > 0);
  if (!first) {
    return `Lesson ${new Date().toLocaleDateString("ja-JP")}`;
  }
  const trimmed = first.replace(/[.!?…]+$/, "").trim();
  if (trimmed.length <= maxLen) return trimmed;
  const cut = trimmed.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxLen * 0.5 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

/** キャッシュキー用の正規化(空白・引用符の揺れを吸収) */
export function normalizeText(text: string): string {
  return text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
