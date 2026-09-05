import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/db";
import { createLesson, getSegmentsForLesson, saveAudioAsset, updateSegment } from "@/db/repositories";
import { buildCacheKey } from "@/services/tts/cacheKey";
import { relinkLessonAudio } from "@/services/tts/generateLesson";
import { NATURAL_STYLE_PROMPT } from "@/services/tts/prompts";
import { useSettingsStore } from "@/stores/settingsStore";
import { createId, nowIso } from "@/utils/id";

describe("relinkLessonAudio", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    useSettingsStore.setState({
      model: "gemini-2.5-flash-preview-tts",
      naturalPrompt: NATURAL_STYLE_PROMPT,
      generateLearning: false,
    });
  });

  it("points mock-linked segments at the production cache entry", async () => {
    const lesson = await createLesson({
      title: "t",
      sourceText: "Hi.",
      segmentTexts: ["Hi."],
      selectedVoice: "Schedar",
    });
    const [seg] = await getSegmentsForLesson(lesson.id);
    const rawKey = await buildCacheKey({
      text: "Hi.",
      voice: "Schedar",
      locale: "en-US",
      variant: "natural",
      stylePrompt: NATURAL_STYLE_PROMPT,
      model: "gemini-2.5-flash-preview-tts",
    });
    const mockId = createId("audio");
    const realId = createId("audio");
    await saveAudioAsset({
      id: mockId,
      cacheKey: `mock:${rawKey}`,
      blob: new Blob(["m"]),
      mimeType: "audio/wav",
      model: "mock:gemini-2.5-flash-preview-tts",
      voice: "Schedar",
      variant: "natural",
      createdAt: nowIso(),
    });
    await saveAudioAsset({
      id: realId,
      cacheKey: rawKey,
      blob: new Blob(["r"]),
      mimeType: "audio/wav",
      model: "gemini-2.5-flash-preview-tts",
      voice: "Schedar",
      variant: "natural",
      createdAt: nowIso(),
    });
    await updateSegment(seg.id, { naturalAudioId: mockId });

    const n = await relinkLessonAudio(lesson.id);
    expect(n).toBe(1);
    const [after] = await getSegmentsForLesson(lesson.id);
    expect(after.naturalAudioId).toBe(realId);
  });
});
