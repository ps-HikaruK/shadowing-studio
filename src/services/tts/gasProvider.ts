import { parseRetryAfterMs } from "./backoff";
import { buildCacheKey } from "./cacheKey";
import { buildTtsPrompt } from "./prompts";
import { TtsError, type SynthesizeSpeechInput, type SynthesizeSpeechResult, type TtsProvider } from "./types";
import { base64ToBytes, parsePcmMimeType, pcmDurationSec, pcmToWav, GEMINI_PCM } from "./wav";

export interface GasProviderOptions {
  endpoint: string;
  token?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface GasSuccess {
  ok: true;
  audioBase64: string;
  mimeType?: string;
  model?: string;
}

interface GasFailure {
  ok: false;
  error: string;
  code?: string;
}

/**
 * Google Apps Script Web App 経由で Gemini TTS を呼ぶプロバイダ。
 * GAS は OPTIONS(preflight)に応答できないため、Content-Type を text/plain にして
 * simple request として送る。
 */
export class GasTtsProvider implements TtsProvider {
  readonly name = "gas";
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: GasProviderOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
  }

  async synthesize(input: SynthesizeSpeechInput): Promise<SynthesizeSpeechResult> {
    if (!this.options.endpoint) {
      throw new TtsError("TTS プロキシの URL が設定されていません", "config", false);
    }
    const cacheKey = await buildCacheKey(input);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 90_000);
    const endpoint = this.options.endpoint.trim();
    const { url, headers, viaProxy } = resolveGasRequest(endpoint);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers,
        redirect: "follow",
        credentials: "omit",
        signal: controller.signal,
        body: JSON.stringify({
          text: input.text,
          voice: input.voice,
          model: input.model,
          variant: input.variant,
          prompt: buildTtsPrompt(input.stylePrompt, input.text),
          token: this.options.token ?? "",
          // bypass 時は GAS 側の 120 秒 duplicate 拒否を避ける(IndexedDB のキーは変えない)
          cacheKey: input.bypassCache ? `${cacheKey}:fresh:${Date.now()}` : cacheKey,
          // 開発用 Vite プロキシが読む。GAS 側は未知フィールドを無視する
          proxyTarget: viaProxy ? endpoint : undefined,
        }),
      });
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === "AbortError";
      const detail = err instanceof Error && err.message ? ` (${err.message})` : "";
      throw new TtsError(
        aborted
          ? "TTS リクエストがタイムアウトしました"
          : viaProxy
            ? `開発サーバーの TTS 中継に接続できません${detail}。ページをハードリロード(Cmd+Shift+R)してください`
            : `ネットワークエラーで TTS に接続できません${detail}`,
        "network",
      );
    } finally {
      clearTimeout(timer);
    }

    let payload: GasSuccess | GasFailure;
    try {
      payload = (await response.json()) as GasSuccess | GasFailure;
    } catch {
      if (response.status === 401 || response.status === 403) {
        throw new TtsError(
          "GAS ウェブアプリが認証を要求しています。デプロイの「アクセスできるユーザー」を「全員」(Anyone) にして再デプロイしてください",
          "config",
          false,
        );
      }
      throw new TtsError(`TTS プロキシの応答を解釈できません (HTTP ${response.status})`, "invalid_response");
    }

    if (!payload.ok) {
      throw mapGasError(payload);
    }
    if (!payload.audioBase64) {
      throw new TtsError("音声データが返されませんでした", "invalid_response");
    }

    const bytes = base64ToBytes(payload.audioBase64);
    const mime = payload.mimeType ?? "audio/L16;codec=pcm;rate=24000";
    const pcmFormat = parsePcmMimeType(mime);
    const audio = pcmFormat
      ? pcmToWav(bytes, pcmFormat)
      : new Blob([bytes as BlobPart], { type: mime });
    return {
      audio,
      mimeType: audio.type,
      model: payload.model ?? input.model,
      cacheKey,
      durationSec: pcmFormat ? pcmDurationSec(bytes.byteLength, pcmFormat ?? GEMINI_PCM) : undefined,
      cacheHit: false,
    };
  }
}

/**
 * 開発サーバーでは GAS の 302 + CORS を避けるため、同一オリジンの Vite プロキシ経由にする。
 * URL の形式が少し違っても直接 POST しない(CORS で「ネットワークエラー」に化けて原因が消える)。
 * 本番(GitHub Pages 等)では設定された Web App URL へ直接 POST する。
 */
function resolveGasRequest(endpoint: string): { url: string; headers: Record<string, string>; viaProxy: boolean } {
  const headers: Record<string, string> = {
    "Content-Type": "text/plain;charset=utf-8",
  };
  if (import.meta.env.DEV) {
    return {
      url: "/__tts_proxy",
      headers: {
        ...headers,
        "X-Tts-Proxy-Target": endpoint,
      },
      viaProxy: true,
    };
  }
  return { url: endpoint, headers, viaProxy: false };
}

function mapGasError(payload: GasFailure): TtsError {
  const code = (payload.code ?? "").toLowerCase();
  if (code === "unauthorized") return new TtsError("トークンが一致しません", "config", false);
  if (code === "auth_required")
    return new TtsError(
      "GAS ウェブアプリがログインを要求しています。「アクセスできるユーザー: 全員」で再デプロイし、新しい URL を設定してください",
      "config",
      false,
    );
  if (code === "rate_limit" || code === "resource_exhausted") {
    const detail = payload.error && payload.error !== "Gemini rate limit (429)" ? ` [${payload.error}]` : "";
    return new TtsError(`レート制限に達しました。少し待って再試行してください${detail}`, "rate_limit", true, {
      retryAfterMs: parseRetryAfterMs(payload.error),
    });
  }
  if (code === "daily_limit") return new TtsError("1日の生成上限に達しました", "quota", false);
  if (code === "too_long") return new TtsError("文が長すぎます。分割してください", "rejected", false);
  if (code === "prohibited_content")
    return new TtsError("この文は TTS に拒否されました。文を修正してください", "rejected", false);
  if (code === "duplicate")
    return new TtsError("同じ文の生成が直前に完了しています。少し待って再試行してください", "rate_limit");
  if (code === "config") return new TtsError("GAS 側に GEMINI_API_KEY が設定されていません", "config", false);
  if (code === "bad_request") return new TtsError(payload.error || "リクエストが不正です", "rejected", false);
  if (code === "server") return new TtsError(payload.error || "TTS サーバーエラー", "server");
  if (code === "network")
    return new TtsError(
      payload.error ? `TTS プロキシから GAS に接続できません (${payload.error})` : "TTS プロキシから GAS に接続できません",
      "network",
    );
  return new TtsError(payload.error || "TTS の生成に失敗しました", "unknown");
}
