/**
 * TTS 生成の再試行ポリシー。
 * 無料枠の Gemini は 1 分あたりの回数制限が厳しいため、固定バックオフで空回りするより
 * サーバーが返す `retry in Ns` に従った方が総時間が短い(2026-09-04 フィードバック 2.1 方針 4)。
 */

export const BACKOFF_MIN_MS = 2_000;
export const BACKOFF_MAX_MS = 65_000;

/** エラー文から Gemini の再試行指示(秒)を取り出す。GAS 側の要約 `retry=47s` と生の `Please retry in 46.4s` の両方に対応 */
export function parseRetryAfterMs(message: string | undefined | null): number | undefined {
  if (!message) return undefined;
  const m = /retry(?:\s+in)?[=:\s]+([\d.]+)\s*s/i.exec(message);
  if (!m) return undefined;
  const sec = Number(m[1]);
  if (!Number.isFinite(sec) || sec <= 0) return undefined;
  return Math.ceil(sec * 1000);
}

/**
 * 次の再試行までの待ち時間(ms)。
 * - サーバー指示があればそれに 500ms のマージンを足す(上限あり)
 * - 無ければ 4s, 8s, 16s… の指数バックオフ
 */
export function computeBackoffMs(attempt: number, retryAfterMs?: number): number {
  if (retryAfterMs && retryAfterMs > 0) {
    return Math.min(BACKOFF_MAX_MS, Math.max(BACKOFF_MIN_MS, retryAfterMs + 500));
  }
  const exp = 4_000 * 2 ** Math.max(0, attempt - 1);
  return Math.min(BACKOFF_MAX_MS, Math.max(BACKOFF_MIN_MS, exp));
}

/** エラー種別ごとの最大試行回数。レート制限は待てば通るので多めに、サーバーエラーは控えめに */
export function maxAttemptsFor(code: string | undefined): number {
  if (code === "rate_limit") return 5;
  if (code === "server" || code === "network") return 3;
  return 1;
}
