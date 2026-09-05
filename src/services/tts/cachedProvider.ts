import { addUsageRecord, deleteAudioAsset, findAudioByCacheKey, saveAudioAsset } from "@/db/repositories";
import type { AudioAsset } from "@/types";
import { createId, nowIso } from "@/utils/id";
import { buildCacheKey } from "./cacheKey";
import type { SynthesizeSpeechInput, SynthesizeSpeechResult, TtsProvider } from "./types";

export interface CachedSynthesizeResult extends SynthesizeSpeechResult {
  asset: AudioAsset;
}

/**
 * IndexedDB のキャッシュを前段に置き、同一キャッシュキーの生成を1回に抑える。
 * - 既存音声があれば外部 API を呼ばない
 * - 同時進行中の同一キーはひとつの Promise を共有する(重複リクエスト拒否)
 * - 呼び出し結果を usage テーブルに記録する
 */
export class CachedTtsProvider {
  private readonly inflight = new Map<string, Promise<CachedSynthesizeResult>>();

  constructor(private readonly inner: TtsProvider) {}

  get providerName(): string {
    return this.inner.name;
  }

  async synthesize(input: SynthesizeSpeechInput): Promise<CachedSynthesizeResult> {
    const rawKey = await buildCacheKey(input);
    // デモのトーン音が本番 TTS と同じキーで保存されると、本番生成がトーンを再利用してしまう
    const cacheKey = this.inner.name === "mock" ? `mock:${rawKey}` : rawKey;
    if (!input.bypassCache) {
      const cached = await findAudioByCacheKey(cacheKey);
      const cachedIsMock = !!cached?.model.startsWith("mock:");
      const wantMock = this.inner.name === "mock";
      if (cached && cachedIsMock === wantMock) {
        await addUsageRecord({
          model: cached.model,
          voice: cached.voice,
          variant: cached.variant,
          inputChars: input.text.length,
          audioSec: cached.durationSec ?? 0,
          cacheHit: true,
          ok: true,
        });
        return {
          audio: cached.blob,
          mimeType: cached.mimeType,
          model: cached.model,
          cacheKey,
          durationSec: cached.durationSec,
          cacheHit: true,
          asset: cached,
        };
      }
    }

    const pending = this.inflight.get(cacheKey);
    if (pending) return pending;

    const task = this.generate(input, cacheKey).finally(() => this.inflight.delete(cacheKey));
    this.inflight.set(cacheKey, task);
    return task;
  }

  private async generate(input: SynthesizeSpeechInput, cacheKey: string): Promise<CachedSynthesizeResult> {
    try {
      const result = await this.inner.synthesize(input);
      // 同じ id で Blob を put すると IndexedDB が古い音声を残すことがある。
      // 常に新しい id を発行し、同キーの旧行は消す。
      const existing = await findAudioByCacheKey(cacheKey);
      const asset: AudioAsset = {
        id: createId("audio"),
        cacheKey,
        blob: result.audio,
        mimeType: result.mimeType,
        model: result.model,
        voice: input.voice,
        variant: input.variant,
        durationSec: result.durationSec,
        createdAt: nowIso(),
      };
      if (existing) await deleteAudioAsset(existing.id);
      await saveAudioAsset(asset);
      await addUsageRecord({
        model: result.model,
        voice: input.voice,
        variant: input.variant,
        inputChars: input.text.length,
        audioSec: result.durationSec ?? 0,
        cacheHit: false,
        ok: true,
      });
      return { ...result, cacheKey, asset };
    } catch (err) {
      await addUsageRecord({
        model: input.model,
        voice: input.voice,
        variant: input.variant,
        inputChars: input.text.length,
        audioSec: 0,
        cacheHit: false,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }).catch(() => undefined);
      throw err;
    }
  }
}
