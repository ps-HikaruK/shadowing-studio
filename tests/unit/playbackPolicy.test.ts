import { describe, expect, it } from "vitest";
import { resolveGapMs, resolvePlayback } from "@/features/player/playbackPolicy";
import { normalizePlaybackSpeed, PLAYBACK_SPEEDS } from "@/types";

const both = { naturalAudioId: "nat", learningAudioId: "lea" };
const naturalOnly = { naturalAudioId: "nat" };

describe("resolvePlayback", () => {
  it("exposes exactly three speeds", () => {
    expect(PLAYBACK_SPEEDS).toEqual([0.8, 1.0, 1.2]);
  });

  it("prefers learning variant at 0.8 when it exists (compensated rate)", () => {
    expect(resolvePlayback(both, 0.8)).toEqual({ audioId: "lea", variant: "learning", rate: 1.067 });
  });

  it("uses natural variant at 0.8 when learning was not generated (default)", () => {
    expect(resolvePlayback(naturalOnly, 0.8)).toEqual({ audioId: "nat", variant: "natural", rate: 0.8 });
  });

  it("uses natural variant for 1.0 and 1.2", () => {
    expect(resolvePlayback(both, 1.0)).toEqual({ audioId: "nat", variant: "natural", rate: 1 });
    expect(resolvePlayback(both, 1.2)).toEqual({ audioId: "nat", variant: "natural", rate: 1.2 });
    expect(resolvePlayback(naturalOnly, 1.2)).toEqual({ audioId: "nat", variant: "natural", rate: 1.2 });
  });

  it("falls back to whichever variant exists", () => {
    expect(resolvePlayback({ learningAudioId: "lea" }, 1.0)?.audioId).toBe("lea");
    expect(resolvePlayback({}, 1.0)).toBeNull();
  });
});

describe("normalizePlaybackSpeed", () => {
  it("maps legacy 5-step speeds onto the 3-step scale", () => {
    expect(normalizePlaybackSpeed(0.6)).toBe(0.8);
    expect(normalizePlaybackSpeed(0.7)).toBe(0.8);
    expect(normalizePlaybackSpeed(0.8)).toBe(0.8);
    expect(normalizePlaybackSpeed(0.9)).toBe(1.0);
    expect(normalizePlaybackSpeed(1.0)).toBe(1.0);
    expect(normalizePlaybackSpeed(1.2)).toBe(1.2);
  });
  it("defaults to 1.0 for garbage", () => {
    expect(normalizePlaybackSpeed(undefined)).toBe(1.0);
    expect(normalizePlaybackSpeed("x")).toBe(1.0);
  });
});

describe("resolveGapMs", () => {
  it("maps fixed modes", () => {
    expect(resolveGapMs("none", 3)).toBe(0);
    expect(resolveGapMs("0.5s", 3)).toBe(500);
    expect(resolveGapMs("1s", 3)).toBe(1000);
    expect(resolveGapMs("2s", 3)).toBe(2000);
  });
  it("mirrors the sentence length with a floor", () => {
    expect(resolveGapMs("mirror", 2.5)).toBe(2500);
    expect(resolveGapMs("mirror", 0.1)).toBe(400);
  });
});
