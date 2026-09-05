import { describe, expect, it } from "vitest";
import {
  base64ToBlob,
  blobToBase64,
  parsePcmMimeType,
  pcmDurationSec,
  pcmToWav,
  synthesizeToneWav,
} from "@/services/tts/wav";

describe("wav helpers", () => {
  it("wraps PCM with a valid 44-byte RIFF header", async () => {
    const pcm = new Uint8Array(48000); // 1 秒分 (24kHz * 2 bytes)
    const blob = pcmToWav(pcm);
    expect(blob.type).toBe("audio/wav");
    expect(blob.size).toBe(44 + pcm.byteLength);
    const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    expect(String.fromCharCode(...head.subarray(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...head.subarray(8, 12))).toBe("WAVE");
    const view = new DataView(await blob.slice(0, 44).arrayBuffer());
    expect(view.getUint32(24, true)).toBe(24000);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint16(34, true)).toBe(16);
  });

  it("computes duration from byte length", () => {
    expect(pcmDurationSec(48000)).toBe(1);
    expect(pcmDurationSec(24000)).toBe(0.5);
  });

  it("parses Gemini PCM mime types", () => {
    expect(parsePcmMimeType("audio/L16;codec=pcm;rate=24000")).toEqual({
      sampleRate: 24000,
      channels: 1,
      bitsPerSample: 16,
    });
    expect(parsePcmMimeType("audio/wav")).toBeNull();
  });

  it("round-trips base64", async () => {
    const original = synthesizeToneWav(0.2);
    const b64 = await blobToBase64(original);
    const back = base64ToBlob(b64, "audio/wav");
    expect(back.size).toBe(original.size);
    expect(new Uint8Array(await back.arrayBuffer())).toEqual(new Uint8Array(await original.arrayBuffer()));
  });
});
