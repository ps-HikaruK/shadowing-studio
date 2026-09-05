import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderStatus = "idle" | "requesting" | "recording" | "unsupported";

const CANDIDATE_TYPES = [
  "audio/mp4",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
];

export function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return CANDIDATE_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
}

export interface RecordingResult {
  blob: Blob;
  mimeType: string;
  durationSec: number;
}

/**
 * MediaRecorder を使った録音フック。
 * iOS Safari は audio/mp4 のみ対応のため、対応形式を順に探す。
 */
export function useRecorder() {
  const [status, setStatus] = useState<RecorderStatus>(() =>
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof MediaRecorder !== "undefined"
      ? "idle"
      : "unsupported",
  );
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback(async () => {
    if (status === "unsupported" || status === "recording") return;
    setError(null);
    setStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      const mimeType = pickRecorderMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.addEventListener("dataavailable", (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      });
      recorderRef.current = recorder;
      streamRef.current = stream;
      recorder.start(250);
      startedAtRef.current = Date.now();
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((Date.now() - startedAtRef.current) / 1000), 200);
      setStatus("recording");
    } catch (err) {
      cleanupStream();
      setStatus("idle");
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "マイクの使用が許可されていません。設定から許可してください"
          : "マイクを開始できませんでした",
      );
    }
  }, [status, cleanupStream]);

  const stop = useCallback((): Promise<RecordingResult | null> => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      cleanupStream();
      setStatus("idle");
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      recorder.addEventListener(
        "stop",
        () => {
          const mimeType = recorder.mimeType || pickRecorderMimeType() || "audio/webm";
          const blob = new Blob(chunksRef.current, { type: mimeType });
          const durationSec = (Date.now() - startedAtRef.current) / 1000;
          cleanupStream();
          recorderRef.current = null;
          setStatus("idle");
          resolve(blob.size > 0 ? { blob, mimeType, durationSec } : null);
        },
        { once: true },
      );
      recorder.stop();
    });
  }, [cleanupStream]);

  const cancel = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.addEventListener("stop", () => cleanupStream(), { once: true });
      recorder.stop();
    } else {
      cleanupStream();
    }
    recorderRef.current = null;
    chunksRef.current = [];
    setStatus("idle");
  }, [cleanupStream]);

  useEffect(() => () => cancel(), [cancel]);

  return { status, error, elapsed, start, stop, cancel };
}
