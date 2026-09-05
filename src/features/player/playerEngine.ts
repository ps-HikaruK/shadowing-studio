import { getAudioAsset, getRecording } from "@/db/repositories";
import { usePlayerStore, type PlayerPhase } from "@/stores/playerStore";
import type { GapMode, PlaybackSpeed, Segment } from "@/types";
import { resolveGapMs, resolvePlayback } from "./playbackPolicy";

export interface PlayerEngineOptions {
  speed: PlaybackSpeed;
  loop: boolean;
  gapMode: GapMode;
  onSegmentStart?: (index: number) => void;
  /**
   * この教材の音声生成が進行中なら true を返す。
   * 生成中に未生成の文へ到達した場合、エラーにせず音声が出来るまで待つ(段階的再生)。
   */
  isGenerating?: () => boolean;
}

/** 生成待ちのポーリング間隔 */
const WAIT_POLL_MS = 500;

/**
 * HTMLAudioElement を 1 つだけ使う再生エンジン。
 * iOS Safari ではユーザー操作で一度 play() した要素のみ以降のプログラム再生が許可されるため、
 * お手本・録音・比較再生をすべて同じ要素で行う。
 * React コンポーネントから独立させ、状態は playerStore に反映する。
 */
export class PlayerEngine {
  private audio: HTMLAudioElement;
  private segments: Segment[] = [];
  private urlCache = new Map<string, string>();
  private opts: PlayerEngineOptions;
  private token = 0;
  private gapTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPlaybackSec = 0;
  private disposed = false;

  constructor(opts: PlayerEngineOptions) {
    this.opts = { ...opts };
    this.audio = new Audio();
    this.audio.preload = "auto";
    this.audio.setAttribute("playsinline", "true");
    this.audio.addEventListener("timeupdate", this.handleTimeUpdate);
    this.audio.addEventListener("loadedmetadata", this.handleTimeUpdate);
    this.audio.addEventListener("error", this.handleError);
  }

  // ---------- 設定 ----------

  setSegments(segments: Segment[]) {
    this.segments = segments;
    const { index } = usePlayerStore.getState();
    if (index >= segments.length) this.store.set({ index: Math.max(0, segments.length - 1) });
  }

  getSegments() {
    return this.segments;
  }

  updateOptions(patch: Partial<PlayerEngineOptions>) {
    const speedChanged = patch.speed !== undefined && patch.speed !== this.opts.speed;
    this.opts = { ...this.opts, ...patch };
    if (speedChanged && this.store.phase === "model" && this.store.playing) {
      // 再生中の速度変更: variant が変わる場合は同じ位置から差し替える
      const seg = this.segments[this.store.index];
      const resolved = seg ? resolvePlayback(seg, this.opts.speed) : null;
      if (resolved && resolved.variant !== this.store.variant) {
        const ratio = this.audio.duration ? this.audio.currentTime / this.audio.duration : 0;
        void this.playSegment(this.store.index, { seekRatio: ratio });
      } else if (resolved) {
        this.audio.playbackRate = resolved.rate;
      }
    }
  }

  /** iOS の自動再生制限を解除するため、ユーザー操作の直後に呼ぶ */
  unlock() {
    if (this.audio.src) return;
    // 無音の極小 WAV を読み込んでおくと、以降の src 差し替え再生が許可される
    this.audio.src = SILENT_WAV;
    this.audio.play().catch(() => undefined);
    this.audio.pause();
  }

  // ---------- 操作 ----------

  async playSegment(index: number, options: { seekRatio?: number } = {}) {
    if (this.disposed) return;
    const seg = this.segments[index];
    if (!seg) return;
    let resolved = resolvePlayback(seg, this.opts.speed);
    this.clearGap();
    const myToken = ++this.token;
    this.store.set({ index, error: null });

    if (!resolved && this.opts.isGenerating?.()) {
      // 段階的再生: 生成中なら音声が出来るまで待つ(setSegments で最新の状態が入ってくる)
      this.audio.pause();
      this.store.set({ playing: true, phase: "waiting", variant: null, duration: 0, currentTime: 0 });
      resolved = await this.waitForAudio(index, myToken);
      if (myToken !== this.token || this.disposed) return;
    }

    if (!resolved) {
      this.store.set({ playing: false, phase: "idle", variant: null, duration: 0, currentTime: 0 });
      this.store.set({ error: "この文の音声はまだ生成されていません" });
      return;
    }

    const url = await this.urlFor(resolved.audioId, "audio");
    if (myToken !== this.token || this.disposed) return;
    if (!url) {
      this.store.set({ playing: false, phase: "idle", error: "音声データが見つかりません" });
      return;
    }

    this.store.set({ phase: "model", variant: resolved.variant, playing: true });
    this.opts.onSegmentStart?.(index);
    try {
      await this.playUrl(url, resolved.rate, myToken, options.seekRatio);
    } catch {
      return;
    }
    if (myToken !== this.token || this.disposed) return;

    this.lastPlaybackSec = (this.audio.duration || 0) / resolved.rate;
    await this.afterModelEnded(index, myToken);
  }

  /** 指定した文の音声が生成されるまで待つ。生成が終わっても無ければ null */
  private async waitForAudio(index: number, myToken: number) {
    for (;;) {
      await sleep(WAIT_POLL_MS);
      if (myToken !== this.token || this.disposed) return null;
      const seg = this.segments[index];
      if (!seg) return null;
      const resolved = resolvePlayback(seg, this.opts.speed);
      if (resolved) return resolved;
      if (!this.opts.isGenerating?.()) return null;
    }
  }

  private async afterModelEnded(index: number, myToken: number) {
    if (this.opts.loop) {
      await this.gap(myToken);
      if (myToken !== this.token) return;
      return this.playSegment(index);
    }
    const autoAdvance = this.store.autoAdvance;
    if (autoAdvance && index < this.segments.length - 1) {
      await this.gap(myToken);
      if (myToken !== this.token) return;
      return this.playSegment(index + 1);
    }
    this.store.set({ playing: false, phase: "idle" });
  }

  private async gap(myToken: number) {
    const ms = resolveGapMs(this.opts.gapMode, this.lastPlaybackSec);
    if (ms <= 0) return;
    this.store.set({ phase: "gap" });
    await new Promise<void>((resolve) => {
      this.gapTimer = setTimeout(() => {
        this.gapTimer = null;
        resolve();
      }, ms);
    });
    void myToken;
  }

  play() {
    if (this.store.phase === "model" && !this.store.playing && this.audio.src && this.audio.src !== SILENT_WAV) {
      // 一時停止からの再開
      const myToken = ++this.token;
      this.store.set({ playing: true });
      this.audio
        .play()
        .then(() => this.waitEnded(myToken))
        .then(() => {
          if (myToken !== this.token) return;
          const rate = this.audio.playbackRate || 1;
          this.lastPlaybackSec = (this.audio.duration || 0) / rate;
          return this.afterModelEnded(this.store.index, myToken);
        })
        .catch(() => this.store.set({ playing: false }));
      return;
    }
    void this.playSegment(this.store.index);
  }

  pause() {
    this.token++;
    this.clearGap();
    this.audio.pause();
    // waiting 中の一時停止は待機を取り消して idle に戻す
    this.store.set({ playing: false, phase: this.store.phase === "model" ? "model" : "idle" });
  }

  toggle() {
    if (this.store.playing) this.pause();
    else this.play();
  }

  stop() {
    this.token++;
    this.clearGap();
    this.audio.pause();
    this.audio.currentTime = 0;
    this.store.set({ playing: false, phase: "idle", currentTime: 0 });
  }

  next() {
    const i = Math.min(this.segments.length - 1, this.store.index + 1);
    void this.playSegment(i);
  }

  prev() {
    const i = Math.max(0, this.store.index - 1);
    void this.playSegment(i);
  }

  seekTo(index: number) {
    const wasPlaying = this.store.playing;
    if (wasPlaying) {
      void this.playSegment(index);
    } else {
      this.token++;
      this.clearGap();
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.audio.load();
      this.store.set({ index, phase: "idle", currentTime: 0, duration: 0, variant: null });
    }
  }

  rewind(seconds = 3) {
    if (this.store.phase !== "model" || !this.audio.src) {
      void this.playSegment(this.store.index);
      return;
    }
    this.audio.currentTime = Math.max(0, this.audio.currentTime - seconds);
    if (!this.store.playing) this.play();
  }

  /** 録音を単体再生 */
  async playRecording(recordingId: string) {
    const myToken = ++this.token;
    this.clearGap();
    const url = await this.urlFor(recordingId, "recording");
    if (myToken !== this.token || !url) return;
    this.store.set({ phase: "recording", playing: true });
    try {
      await this.playUrl(url, 1, myToken);
    } catch {
      return;
    }
    if (myToken !== this.token) return;
    this.store.set({ playing: false, phase: "idle" });
  }

  /** お手本 → 自分 → お手本 の比較再生 */
  async compare(index: number) {
    const seg = this.segments[index];
    if (!seg?.recordingId) return;
    const resolved = resolvePlayback(seg, this.opts.speed);
    if (!resolved) return;
    const myToken = ++this.token;
    this.clearGap();
    this.store.set({ index, error: null });
    const [modelUrl, recUrl] = await Promise.all([
      this.urlFor(resolved.audioId, "audio"),
      this.urlFor(seg.recordingId, "recording"),
    ]);
    if (myToken !== this.token || !modelUrl || !recUrl) return;

    const steps: Array<[PlayerPhase, string, number]> = [
      ["compare-model-before", modelUrl, resolved.rate],
      ["compare-self", recUrl, 1],
      ["compare-model-after", modelUrl, resolved.rate],
    ];
    for (const [phase, url, rate] of steps) {
      this.store.set({ phase, playing: true, variant: resolved.variant });
      try {
        await this.playUrl(url, rate, myToken);
      } catch {
        return;
      }
      if (myToken !== this.token) return;
      await sleep(350);
      if (myToken !== this.token) return;
    }
    this.store.set({ playing: false, phase: "idle" });
  }

  dispose() {
    this.disposed = true;
    this.token++;
    this.clearGap();
    this.audio.pause();
    this.audio.removeEventListener("timeupdate", this.handleTimeUpdate);
    this.audio.removeEventListener("loadedmetadata", this.handleTimeUpdate);
    this.audio.removeEventListener("error", this.handleError);
    this.audio.removeAttribute("src");
    for (const url of this.urlCache.values()) URL.revokeObjectURL(url);
    this.urlCache.clear();
    this.store.set({ playing: false, phase: "idle", currentTime: 0, duration: 0 });
  }

  /** 生成し直しのあと、古い blob URL をすべて捨てる */
  clearAudioCache() {
    for (const [key, url] of [...this.urlCache]) {
      if (!key.startsWith("audio:")) continue;
      URL.revokeObjectURL(url);
      this.urlCache.delete(key);
    }
  }

  /** 録音を差し替えた時などに URL キャッシュを破棄する */
  invalidate(id: string) {
    for (const key of [`audio:${id}`, `recording:${id}`]) {
      const url = this.urlCache.get(key);
      if (url) {
        URL.revokeObjectURL(url);
        this.urlCache.delete(key);
      }
    }
  }

  // ---------- 内部 ----------

  private get store() {
    return usePlayerStore.getState();
  }

  private async urlFor(id: string, kind: "audio" | "recording"): Promise<string | null> {
    const key = `${kind}:${id}`;
    const hit = this.urlCache.get(key);
    if (hit) return hit;
    const record = kind === "audio" ? await getAudioAsset(id) : await getRecording(id);
    if (!record) return null;
    const url = URL.createObjectURL(record.blob);
    this.urlCache.set(key, url);
    return url;
  }

  private async playUrl(url: string, rate: number, myToken: number, seekRatio?: number): Promise<void> {
    const audio = this.audio;
    if (audio.src !== url) {
      audio.src = url;
      audio.load();
    } else {
      audio.currentTime = 0;
    }
    audio.playbackRate = rate;
    audio.defaultPlaybackRate = rate;
    if (seekRatio && seekRatio > 0) {
      await this.waitMetadata();
      audio.currentTime = (audio.duration || 0) * seekRatio;
    }
    try {
      await audio.play();
      // Safari は play() 後に playbackRate がリセットされることがある
      audio.playbackRate = rate;
    } catch (err) {
      if (myToken !== this.token) return;
      this.store.set({
        playing: false,
        phase: "idle",
        error: err instanceof Error && err.name === "NotAllowedError"
          ? "再生ボタンをもう一度タップしてください"
          : "音声を再生できませんでした",
      });
      throw err;
    }
    await this.waitEnded(myToken);
  }

  private waitMetadata(): Promise<void> {
    if (this.audio.readyState >= 1) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        this.audio.removeEventListener("loadedmetadata", done);
        resolve();
      };
      this.audio.addEventListener("loadedmetadata", done);
    });
  }

  private waitEnded(myToken: number): Promise<void> {
    return new Promise((resolve) => {
      const audio = this.audio;
      const cleanup = () => {
        audio.removeEventListener("ended", onEnded);
        audio.removeEventListener("pause", onPause);
        audio.removeEventListener("error", onEnded);
      };
      const onEnded = () => {
        cleanup();
        resolve();
      };
      const onPause = () => {
        // pause() で止めた場合・別再生に切り替わった場合はこの待機を終了する
        if (myToken !== this.token) {
          cleanup();
          resolve();
        }
      };
      audio.addEventListener("ended", onEnded);
      audio.addEventListener("pause", onPause);
      audio.addEventListener("error", onEnded);
      const check = () => {
        if (myToken !== this.token) {
          cleanup();
          resolve();
          return;
        }
        if (!audio.ended) setTimeout(check, 250);
      };
      setTimeout(check, 250);
    });
  }

  private clearGap() {
    if (this.gapTimer) {
      clearTimeout(this.gapTimer);
      this.gapTimer = null;
    }
  }

  private handleTimeUpdate = () => {
    if (this.store.phase === "idle") return;
    this.store.set({
      currentTime: this.audio.currentTime || 0,
      duration: Number.isFinite(this.audio.duration) ? this.audio.duration : 0,
    });
  };

  private handleError = () => {
    if (!this.audio.src || this.audio.src === SILENT_WAV) return;
    this.store.set({ playing: false, phase: "idle", error: "音声の読み込みに失敗しました" });
  };
}

const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
