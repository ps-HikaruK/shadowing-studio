import { useEffect, useRef, useState } from "react";
import { addPracticeLog, saveLessonPosition } from "@/db/repositories";
import { useGenerationStore } from "@/stores/generationStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { usePlayerStore } from "@/stores/playerStore";
import type { Segment } from "@/types";
import { PlayerEngine } from "./playerEngine";

/**
 * PlayerEngine のライフサイクルを React に結びつける。
 * 設定ストアの変更をエンジンへ反映し、再生位置を教材へ保存する。
 */
export function usePlayerEngine(
  lessonId: string,
  segments: Segment[] | undefined,
  initialIndex: number | null,
): PlayerEngine | null {
  const [engine, setEngine] = useState<PlayerEngine | null>(null);
  const speed = useSettingsStore((s) => s.speed);
  const loop = useSettingsStore((s) => s.loop);
  const gapMode = useSettingsStore((s) => s.gapMode);
  const restoredRef = useRef(false);
  const lastLoggedRef = useRef("");

  useEffect(() => {
    const { speed, loop, gapMode } = useSettingsStore.getState();
    const e = new PlayerEngine({
      speed,
      loop,
      gapMode,
      isGenerating: () => {
        const g = useGenerationStore.getState();
        return g.running && g.lessonId === lessonId;
      },
      onSegmentStart: (index) => {
        void saveLessonPosition(lessonId, index);
        const key = `${lessonId}:${index}`;
        if (lastLoggedRef.current !== key) {
          lastLoggedRef.current = key;
          const seg = e.getSegments()[index];
          void addPracticeLog({ lessonId, segmentId: seg?.id, kind: "play" });
        }
      },
    });
    setEngine(e);
    restoredRef.current = false;
    return () => {
      const { index } = usePlayerStore.getState();
      void saveLessonPosition(lessonId, index);
      e.dispose();
      setEngine(null);
    };
  }, [lessonId]);

  useEffect(() => {
    engine?.updateOptions({ speed, loop, gapMode });
  }, [engine, speed, loop, gapMode]);

  useEffect(() => {
    if (engine && segments) engine.setSegments(segments);
  }, [engine, segments]);

  useEffect(() => {
    if (restoredRef.current || !engine || initialIndex === null || !segments) return;
    restoredRef.current = true;
    const idx = Math.min(Math.max(0, initialIndex), Math.max(0, segments.length - 1));
    usePlayerStore.getState().set({ index: idx, phase: "idle", playing: false, currentTime: 0, duration: 0 });
    void addPracticeLog({ lessonId, kind: "session" });
  }, [engine, initialIndex, segments, lessonId]);

  return engine;
}
