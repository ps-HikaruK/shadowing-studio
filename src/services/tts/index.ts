import { useSettingsStore } from "@/stores/settingsStore";
import { CachedTtsProvider } from "./cachedProvider";
import { GasTtsProvider } from "./gasProvider";
import { MockTtsProvider } from "./mockProvider";
import type { TtsProvider } from "./types";

export * from "./types";
export { CachedTtsProvider } from "./cachedProvider";

let cached: { key: string; provider: CachedTtsProvider } | null = null;

/** 設定に応じたプロバイダを返す(設定が変わると作り直す) */
export function getTtsProvider(): CachedTtsProvider {
  const { proxyUrl, proxyToken, demoMode } = useSettingsStore.getState();
  const key = demoMode ? "mock" : `gas:${proxyUrl}:${proxyToken}`;
  if (cached && cached.key === key) return cached.provider;
  const inner: TtsProvider = demoMode
    ? new MockTtsProvider()
    : new GasTtsProvider({ endpoint: proxyUrl.trim(), token: proxyToken.trim() });
  cached = { key, provider: new CachedTtsProvider(inner) };
  return cached.provider;
}
