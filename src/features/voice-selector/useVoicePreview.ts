import { useCallback, useEffect, useRef, useState } from "react";
import { getTtsProvider } from "@/services/tts";
import { PREVIEW_SENTENCES } from "@/services/tts/voices";
import { useSettingsStore } from "@/stores/settingsStore";
import type { SpeechVariant } from "@/types";
import { toast } from "@/components/Toast";

/**
 * 音声の試聴。生成結果はキャッシュされるので、同じ声の 2 回目以降は API を呼ばない。
 */
export function useVoicePreview() {
  const [loadingVoice, setLoadingVoice] = useState<string | null>(null);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    setPlayingVoice(null);
  }, []);

  useEffect(
    () => () => {
      audioRef.current?.pause();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const preview = useCallback(
    async (voice: string, variant: SpeechVariant = "natural", text = PREVIEW_SENTENCES[0]) => {
      if (playingVoice === voice) {
        stop();
        return;
      }
      stop();
      const settings = useSettingsStore.getState();
      setLoadingVoice(voice);
      try {
        const result = await getTtsProvider().synthesize({
          text,
          voice,
          locale: "en-US",
          variant,
          stylePrompt: variant === "learning" ? settings.learningPrompt : settings.naturalPrompt,
          model: settings.model,
        });
        if (!audioRef.current) audioRef.current = new Audio();
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        const url = URL.createObjectURL(result.audio);
        urlRef.current = url;
        const audio = audioRef.current;
        audio.src = url;
        audio.onended = () => setPlayingVoice(null);
        await audio.play();
        setPlayingVoice(voice);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "試聴に失敗しました");
      } finally {
        setLoadingVoice(null);
      }
    },
    [playingVoice, stop],
  );

  return { preview, stop, loadingVoice, playingVoice };
}
