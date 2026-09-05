import { db } from "@/db/db";
import { base64ToBlob, blobToBase64 } from "@/services/tts/wav";
import type { AudioAsset, Lesson, Recording, Segment, UsageRecord } from "@/types";

export const BACKUP_VERSION = 1;

type SerializedBlobRecord<T> = Omit<T, "blob"> & { blobBase64: string };

export interface BackupFile {
  app: "shadowing-studio";
  version: number;
  exportedAt: string;
  lessons: Lesson[];
  segments: Segment[];
  audioAssets: SerializedBlobRecord<AudioAsset>[];
  recordings: SerializedBlobRecord<Recording>[];
  usage: UsageRecord[];
}

export interface ExportOptions {
  includeAudio: boolean;
  includeRecordings: boolean;
}

export async function exportBackup(options: ExportOptions): Promise<BackupFile> {
  const [lessons, segments, audioAssets, recordings, usage] = await Promise.all([
    db.lessons.toArray(),
    db.segments.toArray(),
    options.includeAudio ? db.audioAssets.toArray() : Promise.resolve([] as AudioAsset[]),
    options.includeRecordings ? db.recordings.toArray() : Promise.resolve([] as Recording[]),
    db.usage.toArray(),
  ]);
  return {
    app: "shadowing-studio",
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    lessons,
    segments: options.includeRecordings ? segments : segments.map((s) => ({ ...s, recordingId: undefined })),
    audioAssets: await Promise.all(audioAssets.map(serializeBlobRecord)),
    recordings: await Promise.all(recordings.map(serializeBlobRecord)),
    usage,
  };
}

export interface ImportSummary {
  lessons: number;
  segments: number;
  audioAssets: number;
  recordings: number;
}

/**
 * バックアップを取り込む。同じ id のレコードは上書きし、無いものは追加する(マージ)。
 * 音声を含まないバックアップから復元した場合、参照先が無いセグメントの音声参照は外す。
 */
export async function importBackup(data: unknown): Promise<ImportSummary> {
  const file = validateBackup(data);
  const audioAssets = file.audioAssets.map((a) => deserializeBlobRecord<AudioAsset>(a));
  const recordings = file.recordings.map((r) => deserializeBlobRecord<Recording>(r));

  await db.transaction(
    "rw",
    db.lessons,
    db.segments,
    db.audioAssets,
    db.recordings,
    db.usage,
    async () => {
      // cacheKey は unique なので、同じキーの既存音声があれば id を既存に寄せる
      const existingByKey = new Map<string, string>();
      await db.audioAssets.each((a) => existingByKey.set(a.cacheKey, a.id));
      const idRemap = new Map<string, string>();
      const toPut: AudioAsset[] = [];
      for (const a of audioAssets) {
        const existingId = existingByKey.get(a.cacheKey);
        if (existingId && existingId !== a.id) idRemap.set(a.id, existingId);
        else toPut.push(a);
      }
      if (toPut.length) await db.audioAssets.bulkPut(toPut);

      const knownAudio = new Set<string>([
        ...(await db.audioAssets.toCollection().primaryKeys()).map(String),
      ]);
      const knownRec = new Set<string>(recordings.map((r) => r.id));
      await db.recordings.each((r) => knownRec.add(r.id));

      const segments = file.segments.map((s) => {
        const nat = s.naturalAudioId ? (idRemap.get(s.naturalAudioId) ?? s.naturalAudioId) : undefined;
        const lea = s.learningAudioId ? (idRemap.get(s.learningAudioId) ?? s.learningAudioId) : undefined;
        return {
          ...s,
          naturalAudioId: nat && knownAudio.has(nat) ? nat : undefined,
          learningAudioId: lea && knownAudio.has(lea) ? lea : undefined,
          recordingId: s.recordingId && knownRec.has(s.recordingId) ? s.recordingId : undefined,
          difficult: !!s.difficult,
        };
      });

      if (recordings.length) await db.recordings.bulkPut(recordings);
      await db.segments.bulkPut(segments);
      await db.lessons.bulkPut(file.lessons);
      if (file.usage?.length) await db.usage.bulkPut(file.usage);
    },
  );

  return {
    lessons: file.lessons.length,
    segments: file.segments.length,
    audioAssets: audioAssets.length,
    recordings: recordings.length,
  };
}

export function validateBackup(data: unknown): BackupFile {
  if (!data || typeof data !== "object") throw new Error("JSON の形式が正しくありません");
  const f = data as Partial<BackupFile>;
  if (f.app !== "shadowing-studio") throw new Error("Shadowing Studio のバックアップではありません");
  if (typeof f.version !== "number" || f.version > BACKUP_VERSION)
    throw new Error("このバックアップは新しいバージョンのアプリで作成されています");
  if (!Array.isArray(f.lessons) || !Array.isArray(f.segments))
    throw new Error("教材データが含まれていません");
  return {
    app: "shadowing-studio",
    version: f.version,
    exportedAt: f.exportedAt ?? "",
    lessons: f.lessons,
    segments: f.segments,
    audioAssets: Array.isArray(f.audioAssets) ? f.audioAssets : [],
    recordings: Array.isArray(f.recordings) ? f.recordings : [],
    usage: Array.isArray(f.usage) ? f.usage : [],
  };
}

export function backupFileName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `shadowing-studio-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
}

export function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function serializeBlobRecord<T extends { blob: Blob }>(record: T): Promise<SerializedBlobRecord<T>> {
  const { blob, ...rest } = record;
  return { ...rest, blobBase64: await blobToBase64(blob) } as SerializedBlobRecord<T>;
}

function deserializeBlobRecord<T extends { blob: Blob; mimeType: string }>(
  record: SerializedBlobRecord<T>,
): T {
  const { blobBase64, ...rest } = record;
  const mimeType = (rest as { mimeType?: string }).mimeType ?? "application/octet-stream";
  return { ...rest, blob: base64ToBlob(blobBase64, mimeType) } as unknown as T;
}
