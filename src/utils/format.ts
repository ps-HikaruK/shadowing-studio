export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}

export function formatSeconds(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatRelativeDate(iso: string | undefined): string {
  if (!iso) return "未練習";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const day = 86_400_000;
  if (diff < 60_000) return "たった今";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分前`;
  if (diff < day) return `${Math.floor(diff / 3_600_000)}時間前`;
  if (diff < day * 7) return `${Math.floor(diff / day)}日前`;
  return d.toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
}

/**
 * Gemini TTS の概算コスト(USD)。音声出力は 25 トークン/秒。
 * 2.5 Flash: $10 / 1M 出力トークン, 3.1 Flash: $20 / 1M(README 3.3)
 */
export function estimateTtsCostUsd(model: string, audioSec: number, inputChars: number): number {
  const outputTokens = audioSec * 25;
  const inputTokens = inputChars / 4;
  const is31 = model.includes("3.1");
  const isPro = model.includes("pro");
  const outRate = is31 ? 20 : isPro ? 20 : 10;
  const inRate = is31 ? 1 : isPro ? 1 : 0.5;
  return (outputTokens / 1_000_000) * outRate + (inputTokens / 1_000_000) * inRate;
}
