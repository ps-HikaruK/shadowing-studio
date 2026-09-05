import Dexie, { type EntityTable } from "dexie";
import type { AudioAsset, Lesson, PracticeLog, Recording, Segment, UsageRecord } from "@/types";

export class ShadowingDatabase extends Dexie {
  lessons!: EntityTable<Lesson, "id">;
  segments!: EntityTable<Segment, "id">;
  audioAssets!: EntityTable<AudioAsset, "id">;
  recordings!: EntityTable<Recording, "id">;
  practiceLogs!: EntityTable<PracticeLog, "id">;
  usage!: EntityTable<UsageRecord, "id">;

  constructor(name = "shadowing-studio") {
    super(name);
    this.version(1).stores({
      lessons: "id, updatedAt, createdAt, lastPracticedAt",
      segments: "id, lessonId, [lessonId+order]",
      audioAssets: "id, &cacheKey, voice, variant, createdAt",
      recordings: "id, lessonId, segmentId, createdAt",
      practiceLogs: "id, lessonId, createdAt",
      usage: "id, createdAt",
    });
  }
}

export const db = new ShadowingDatabase();
