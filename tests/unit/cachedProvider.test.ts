import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/db";
import { CachedTtsProvider } from "@/services/tts/cachedProvider";
import { MockTtsProvider } from "@/services/tts/mockProvider";
import type { SynthesizeSpeechInput } from "@/services/tts/types";

const input: SynthesizeSpeechInput = {
  text: "Hey, how's it going?",
  voice: "Schedar",
  locale: "en-US",
  variant: "natural",
  stylePrompt: "casual",
  model: "gemini-2.5-flash-preview-tts",
};

describe("CachedTtsProvider", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("calls the inner provider once and serves the second request from IndexedDB", async () => {
    const inner = new MockTtsProvider(0);
    const provider = new CachedTtsProvider(inner);

    const first = await provider.synthesize(input);
    expect(first.cacheHit).toBe(false);
    expect(inner.calls).toHaveLength(1);

    const second = await provider.synthesize({ ...input, text: "  Hey,  how's it going? " });
    expect(second.cacheHit).toBe(true);
    expect(second.asset.id).toBe(first.asset.id);
    expect(inner.calls).toHaveLength(1);

    const usage = await db.usage.toArray();
    expect(usage.filter((u) => u.cacheHit)).toHaveLength(1);
    expect(usage.filter((u) => !u.cacheHit)).toHaveLength(1);
  });

  it("shares in-flight requests for the same cache key", async () => {
    const inner = new MockTtsProvider(30);
    const provider = new CachedTtsProvider(inner);
    const [a, b] = await Promise.all([provider.synthesize(input), provider.synthesize(input)]);
    expect(inner.calls).toHaveLength(1);
    expect(a.asset.id).toBe(b.asset.id);
    expect(await db.audioAssets.count()).toBe(1);
  });

  it("treats variant, voice and prompt as distinct cache entries", async () => {
    const inner = new MockTtsProvider(0);
    const provider = new CachedTtsProvider(inner);
    await provider.synthesize(input);
    await provider.synthesize({ ...input, variant: "learning" });
    await provider.synthesize({ ...input, voice: "Orus" });
    await provider.synthesize({ ...input, stylePrompt: "slow" });
    expect(inner.calls).toHaveLength(4);
    expect(await db.audioAssets.count()).toBe(4);
  });

  it("records failures in usage without caching", async () => {
    const failing = {
      name: "failing",
      async synthesize() {
        throw new Error("boom");
      },
    };
    const provider = new CachedTtsProvider(failing);
    await expect(provider.synthesize(input)).rejects.toThrow("boom");
    expect(await db.audioAssets.count()).toBe(0);
    const usage = await db.usage.toArray();
    expect(usage).toHaveLength(1);
    expect(usage[0].ok).toBe(false);
  });

  it("bypassCache skips IndexedDB and overwrites the stored asset", async () => {
    const inner = new MockTtsProvider(0);
    const provider = new CachedTtsProvider(inner);

    const first = await provider.synthesize(input);
    expect(inner.calls).toHaveLength(1);

    const second = await provider.synthesize({ ...input, bypassCache: true });
    expect(second.cacheHit).toBe(false);
    expect(inner.calls).toHaveLength(2);
    expect(second.asset.id).not.toBe(first.asset.id);
    expect(await db.audioAssets.count()).toBe(1);
    expect(await db.audioAssets.get(first.asset.id)).toBeUndefined();
    const usage = await db.usage.toArray();
    expect(usage.filter((u) => !u.cacheHit)).toHaveLength(2);
  });
});
