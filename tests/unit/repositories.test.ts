import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/db";
import {
  createLesson,
  deleteLesson,
  getSegmentsForLesson,
  replaceSegments,
  saveAudioAsset,
  saveRecording,
  updateSegment,
} from "@/db/repositories";
import { exportBackup, importBackup } from "@/utils/backup";
import { synthesizeToneWav } from "@/services/tts/wav";
import type { AudioAsset } from "@/types";

function asset(id: string, cacheKey = id): AudioAsset {
  return {
    id,
    cacheKey,
    blob: synthesizeToneWav(0.05),
    mimeType: "audio/wav",
    model: "mock",
    voice: "Schedar",
    variant: "natural",
    durationSec: 0.05,
    createdAt: new Date().toISOString(),
  };
}

describe("repositories", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("creates a lesson with ordered segments", async () => {
    const lesson = await createLesson({
      title: "t",
      sourceText: "src",
      segmentTexts: ["One.", "Two.", "Three."],
      selectedVoice: "Schedar",
    });
    const segs = await getSegmentsForLesson(lesson.id);
    expect(segs.map((s) => s.text)).toEqual(["One.", "Two.", "Three."]);
    expect(segs.map((s) => s.order)).toEqual([0, 1, 2]);
    expect(lesson.segmentIds).toEqual(segs.map((s) => s.id));
  });

  it("replaceSegments keeps audio for unchanged text and drops it for edited text", async () => {
    const lesson = await createLesson({
      title: "t",
      sourceText: "",
      segmentTexts: ["Keep me.", "Edit me."],
      selectedVoice: "Schedar",
    });
    const [a, b] = await getSegmentsForLesson(lesson.id);
    await saveAudioAsset(asset("audio-a"));
    await saveAudioAsset(asset("audio-b"));
    await updateSegment(a.id, { naturalAudioId: "audio-a" });
    await updateSegment(b.id, { naturalAudioId: "audio-b" });

    const next = await replaceSegments(lesson.id, [
      { id: b.id, text: "Edited." },
      { id: a.id, text: "Keep me." },
      { text: "Brand new." },
    ]);
    expect(next.map((s) => s.text)).toEqual(["Edited.", "Keep me.", "Brand new."]);
    expect(next[0].naturalAudioId).toBeUndefined();
    expect(next[1].naturalAudioId).toBe("audio-a");
    expect(next[1].id).toBe(a.id);
    // 編集された文の旧音声は孤立したので削除される
    expect(await db.audioAssets.get("audio-b")).toBeUndefined();
    expect(await db.audioAssets.get("audio-a")).toBeDefined();
  });

  it("deleteLesson removes only unreferenced audio", async () => {
    const l1 = await createLesson({ title: "1", sourceText: "", segmentTexts: ["Same."], selectedVoice: "S" });
    const l2 = await createLesson({ title: "2", sourceText: "", segmentTexts: ["Same.", "Other."], selectedVoice: "S" });
    await saveAudioAsset(asset("shared"));
    await saveAudioAsset(asset("only-l2"));
    const [s1] = await getSegmentsForLesson(l1.id);
    const [s2a, s2b] = await getSegmentsForLesson(l2.id);
    await updateSegment(s1.id, { naturalAudioId: "shared" });
    await updateSegment(s2a.id, { naturalAudioId: "shared" });
    await updateSegment(s2b.id, { naturalAudioId: "only-l2" });
    await saveRecording({ lessonId: l2.id, segmentId: s2b.id, blob: synthesizeToneWav(0.01), mimeType: "audio/wav" });

    await deleteLesson(l2.id);
    expect(await db.lessons.get(l2.id)).toBeUndefined();
    expect(await db.segments.where("lessonId").equals(l2.id).count()).toBe(0);
    expect(await db.recordings.count()).toBe(0);
    expect(await db.audioAssets.get("shared")).toBeDefined();
    expect(await db.audioAssets.get("only-l2")).toBeUndefined();
  });

  it("backup export/import round-trips lessons, segments and audio", async () => {
    const lesson = await createLesson({ title: "b", sourceText: "s", segmentTexts: ["A.", "B."], selectedVoice: "S" });
    const [a] = await getSegmentsForLesson(lesson.id);
    await saveAudioAsset(asset("audio-a", "key-a"));
    await updateSegment(a.id, { naturalAudioId: "audio-a", difficult: true });

    const file = await exportBackup({ includeAudio: true, includeRecordings: true });
    expect(file.lessons).toHaveLength(1);
    expect(file.audioAssets[0].blobBase64.length).toBeGreaterThan(0);

    await db.delete();
    await db.open();
    const summary = await importBackup(JSON.parse(JSON.stringify(file)));
    expect(summary.lessons).toBe(1);
    const segs = await getSegmentsForLesson(lesson.id);
    expect(segs[0].naturalAudioId).toBe("audio-a");
    expect(segs[0].difficult).toBe(true);
    const restored = await db.audioAssets.get("audio-a");
    expect(restored?.blob.size).toBeGreaterThan(44);
  });

  it("import without audio clears dangling audio references", async () => {
    const lesson = await createLesson({ title: "b", sourceText: "s", segmentTexts: ["A."], selectedVoice: "S" });
    const [a] = await getSegmentsForLesson(lesson.id);
    await saveAudioAsset(asset("audio-a"));
    await updateSegment(a.id, { naturalAudioId: "audio-a" });
    const file = await exportBackup({ includeAudio: false, includeRecordings: false });
    await db.delete();
    await db.open();
    await importBackup(file);
    const segs = await getSegmentsForLesson(lesson.id);
    expect(segs[0].naturalAudioId).toBeUndefined();
  });
});
