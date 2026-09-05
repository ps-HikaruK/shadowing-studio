/**
 * Gemini TTS は 16bit / 24kHz / mono の raw PCM(audio/L16)を返す。
 * ブラウザで再生するために WAV ヘッダを付ける。
 */

export interface PcmFormat {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
}

export const GEMINI_PCM: PcmFormat = { sampleRate: 24000, channels: 1, bitsPerSample: 16 };

/** "audio/L16;codec=pcm;rate=24000" のような MIME からフォーマットを推定する */
export function parsePcmMimeType(mimeType: string | undefined): PcmFormat | null {
  if (!mimeType) return null;
  const lower = mimeType.toLowerCase();
  if (!lower.includes("l16") && !lower.includes("pcm")) return null;
  const rate = /rate=(\d+)/.exec(lower);
  return {
    sampleRate: rate ? Number(rate[1]) : GEMINI_PCM.sampleRate,
    channels: GEMINI_PCM.channels,
    bitsPerSample: GEMINI_PCM.bitsPerSample,
  };
}

export function pcmToWav(pcm: Uint8Array, format: PcmFormat = GEMINI_PCM): Blob {
  const { sampleRate, channels, bitsPerSample } = format;
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, pcm.byteLength, true);
  return new Blob([header, pcm as BlobPart], { type: "audio/wav" });
}

export function pcmDurationSec(byteLength: number, format: PcmFormat = GEMINI_PCM): number {
  const bytesPerSec = (format.sampleRate * format.channels * format.bitsPerSample) / 8;
  return byteLength / bytesPerSec;
}

export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/\s/g, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBlob(base64: string, mimeType: string): Blob {
  return new Blob([base64ToBytes(base64) as BlobPart], { type: mimeType });
}

/** 単純な正弦波のダミー音声(デモモード・テスト用) */
export function synthesizeToneWav(durationSec: number, frequency = 220): Blob {
  const { sampleRate } = GEMINI_PCM;
  const length = Math.max(1, Math.floor(durationSec * sampleRate));
  const pcm = new Uint8Array(length * 2);
  const view = new DataView(pcm.buffer);
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const envelope = Math.min(1, t * 20, (durationSec - t) * 20);
    const sample = Math.sin(2 * Math.PI * frequency * t) * 0.25 * envelope;
    view.setInt16(i * 2, Math.round(sample * 32767), true);
  }
  return pcmToWav(pcm);
}

function writeAscii(view: DataView, offset: number, text: string) {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}
