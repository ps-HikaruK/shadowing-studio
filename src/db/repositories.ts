import { db } from "./db";
import type { AudioAsset, Lesson, PracticeLog, Recording, Segment, UsageRecord } from "@/types";
import { createId, nowIso } from "@/utils/id";

// ---------- Lessons ----------

export interface CreateLessonInput {
  title: string;
  sourceText: string;
  segmentTexts: string[];
  selectedVoice: string;
}

export async function createLesson(input: CreateLessonInput): Promise<Lesson> {
  const lessonId = createId("lesson");
  const ts = nowIso();
  const segments: Segment[] = input.segmentTexts.map((text, order) => ({
    id: createId("seg"),
    lessonId,
    order,
    text,
    difficult: false,
  }));
  const lesson: Lesson = {
    id: lessonId,
    title: input.title,
    sourceText: input.sourceText,
    segmentIds: segments.map((s) => s.id),
    selectedVoice: input.selectedVoice,
    createdAt: ts,
    updatedAt: ts,
    lastSegmentIndex: 0,
  };
  await db.transaction("rw", db.lessons, db.segments, async () => {
    await db.lessons.add(lesson);
    await db.segments.bulkAdd(segments);
  });
  return lesson;
}

export async function getLesson(id: string): Promise<Lesson | undefined> {
  return db.lessons.get(id);
}

export async function listLessons(): Promise<Lesson[]> {
  return db.lessons.orderBy("updatedAt").reverse().toArray();
}

export async function updateLesson(id: string, patch: Partial<Lesson>): Promise<void> {
  await db.lessons.update(id, { ...patch, updatedAt: nowIso() });
}

/** 練習位置だけを更新する(updatedAt は動かさない) */
export async function saveLessonPosition(id: string, index: number): Promise<void> {
  await db.lessons.update(id, { lastSegmentIndex: index, lastPracticedAt: nowIso() });
}

export async function getSegmentsForLesson(lessonId: string): Promise<Segment[]> {
  return db.segments.where("[lessonId+order]").between([lessonId, -Infinity], [lessonId, Infinity]).toArray();
}

/**
 * 分割結果の編集を保存する。既存セグメントは id を保持し、音声参照を維持する。
 * テキストが変わったセグメントは音声参照を外し、再生成対象にする。
 */
export async function replaceSegments(
  lessonId: string,
  next: Array<{ id?: string; text: string; difficult?: boolean }>,
): Promise<Segment[]> {
  const existing = await getSegmentsForLesson(lessonId);
  const byId = new Map(existing.map((s) => [s.id, s]));
  const result: Segment[] = next.map((n, order) => {
    const prev = n.id ? byId.get(n.id) : undefined;
    if (prev && prev.text === n.text) {
      return { ...prev, order, difficult: n.difficult ?? prev.difficult };
    }
    return {
      id: prev?.id ?? createId("seg"),
      lessonId,
      order,
      text: n.text,
      difficult: n.difficult ?? prev?.difficult ?? false,
      // テキスト変更時は録音も対応しなくなるので参照を外す
    };
  });
  const keepIds = new Set(result.map((s) => s.id));
  const removed = existing.filter((s) => !keepIds.has(s.id));
  const resultById = new Map(result.map((s) => [s.id, s]));
  // テキストが変わって音声・録音の参照が外れたセグメント
  const changed = existing.filter((s) => {
    const n = resultById.get(s.id);
    return n && n.text !== s.text;
  });
  const staleRecordingIds = [...removed, ...changed]
    .map((s) => s.recordingId)
    .filter((x): x is string => !!x);
  const staleAudioIds = [...removed, ...changed].flatMap((s) =>
    [s.naturalAudioId, s.learningAudioId].filter((x): x is string => !!x),
  );

  await db.transaction("rw", db.lessons, db.segments, db.recordings, db.audioAssets, async () => {
    if (removed.length > 0) await db.segments.bulkDelete(removed.map((s) => s.id));
    if (staleRecordingIds.length > 0) await db.recordings.bulkDelete(staleRecordingIds);
    await db.segments.bulkPut(result);
    await db.lessons.update(lessonId, {
      segmentIds: result.map((s) => s.id),
      updatedAt: nowIso(),
    });
    await deleteOrphanAudio(staleAudioIds);
  });
  return result;
}

export async function updateSegment(id: string, patch: Partial<Segment>): Promise<void> {
  await db.segments.update(id, patch);
}

export async function deleteLesson(lessonId: string): Promise<void> {
  await db.transaction(
    "rw",
    db.lessons,
    db.segments,
    db.audioAssets,
    db.recordings,
    db.practiceLogs,
    async () => {
      const segments = await db.segments.where("lessonId").equals(lessonId).toArray();
      const audioIds = new Set<string>();
      for (const s of segments) {
        if (s.naturalAudioId) audioIds.add(s.naturalAudioId);
        if (s.learningAudioId) audioIds.add(s.learningAudioId);
      }
      await db.segments.bulkDelete(segments.map((s) => s.id));
      await db.recordings.where("lessonId").equals(lessonId).delete();
      await db.practiceLogs.where("lessonId").equals(lessonId).delete();
      await db.lessons.delete(lessonId);
      await deleteOrphanAudio([...audioIds]);
    },
  );
}

/** 他のセグメントから参照されていない音声だけを削除する */
export async function deleteOrphanAudio(candidateIds: string[]): Promise<number> {
  if (candidateIds.length === 0) return 0;
  const referenced = new Set<string>();
  await db.segments.each((s) => {
    if (s.naturalAudioId) referenced.add(s.naturalAudioId);
    if (s.learningAudioId) referenced.add(s.learningAudioId);
  });
  const orphans = candidateIds.filter((id) => !referenced.has(id));
  if (orphans.length > 0) await db.audioAssets.bulkDelete(orphans);
  return orphans.length;
}

/** どのセグメントからも参照されない音声を全て削除する */
export async function purgeAllOrphanAudio(): Promise<number> {
  const all = await db.audioAssets.toCollection().primaryKeys();
  return deleteOrphanAudio(all as string[]);
}

// ---------- Audio ----------

export async function findAudioByCacheKey(cacheKey: string): Promise<AudioAsset | undefined> {
  return db.audioAssets.where("cacheKey").equals(cacheKey).first();
}

export async function saveAudioAsset(asset: AudioAsset): Promise<void> {
  await db.audioAssets.put(asset);
}

export async function deleteAudioAsset(id: string): Promise<void> {
  await db.audioAssets.delete(id);
}

export async function clearSegmentAudioField(
  id: string,
  field: "naturalAudioId" | "learningAudioId",
): Promise<void> {
  await db.segments
    .where("id")
    .equals(id)
    .modify((s) => {
      delete s[field];
    });
}

export async function getAudioAsset(id: string): Promise<AudioAsset | undefined> {
  return db.audioAssets.get(id);
}

// ---------- Recordings ----------

export async function saveRecording(
  input: Omit<Recording, "id" | "createdAt">,
): Promise<Recording> {
  const rec: Recording = { ...input, id: createId("rec"), createdAt: nowIso() };
  await db.transaction("rw", db.recordings, db.segments, async () => {
    const seg = await db.segments.get(input.segmentId);
    if (seg?.recordingId) await db.recordings.delete(seg.recordingId);
    await db.recordings.add(rec);
    await db.segments.update(input.segmentId, { recordingId: rec.id });
  });
  return rec;
}

export async function getRecording(id: string): Promise<Recording | undefined> {
  return db.recordings.get(id);
}

export async function deleteRecordingForSegment(segmentId: string): Promise<void> {
  await db.transaction("rw", db.recordings, db.segments, async () => {
    const seg = await db.segments.get(segmentId);
    if (seg?.recordingId) {
      await db.recordings.delete(seg.recordingId);
      await db.segments.update(segmentId, { recordingId: undefined });
    }
  });
}

// ---------- Logs / Usage ----------

export async function addPracticeLog(input: Omit<PracticeLog, "id" | "createdAt">): Promise<void> {
  await db.practiceLogs.add({ ...input, id: createId("log"), createdAt: nowIso() });
}

export async function addUsageRecord(input: Omit<UsageRecord, "id" | "createdAt">): Promise<void> {
  await db.usage.add({ ...input, id: createId("use"), createdAt: nowIso() });
}

export async function listUsage(): Promise<UsageRecord[]> {
  return db.usage.orderBy("createdAt").toArray();
}

// ---------- Stats ----------

export interface StorageStats {
  lessonCount: number;
  segmentCount: number;
  audioCount: number;
  audioBytes: number;
  recordingCount: number;
  recordingBytes: number;
  quotaUsage?: number;
  quota?: number;
}

export async function getStorageStats(): Promise<StorageStats> {
  const [lessonCount, segmentCount, audio, recordings] = await Promise.all([
    db.lessons.count(),
    db.segments.count(),
    db.audioAssets.toArray(),
    db.recordings.toArray(),
  ]);
  let quotaUsage: number | undefined;
  let quota: number | undefined;
  if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
    try {
      const est = await navigator.storage.estimate();
      quotaUsage = est.usage;
      quota = est.quota;
    } catch {
      // 非対応環境では無視
    }
  }
  return {
    lessonCount,
    segmentCount,
    audioCount: audio.length,
    audioBytes: audio.reduce((n, a) => n + a.blob.size, 0),
    recordingCount: recordings.length,
    recordingBytes: recordings.reduce((n, r) => n + r.blob.size, 0),
    quotaUsage,
    quota,
  };
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
