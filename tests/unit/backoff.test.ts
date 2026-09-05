import { describe, expect, it } from "vitest";
import {
  BACKOFF_MAX_MS,
  BACKOFF_MIN_MS,
  computeBackoffMs,
  maxAttemptsFor,
  parseRetryAfterMs,
} from "@/services/tts/backoff";

describe("parseRetryAfterMs", () => {
  it("reads the GAS summary format", () => {
    expect(parseRetryAfterMs("Gemini 429: limit=10 model=x / quota=PerMinute / retry=47s")).toBe(47_000);
  });
  it("reads Gemini's raw message", () => {
    expect(parseRetryAfterMs("You exceeded your quota. Please retry in 46.457504798s.")).toBe(46_458);
  });
  it("reads the app-side wrapped message", () => {
    expect(parseRetryAfterMs("レート制限に達しました [Gemini 429: retry=12s]")).toBe(12_000);
  });
  it("returns undefined when absent", () => {
    expect(parseRetryAfterMs("Gemini 429: prepayment credits are depleted")).toBeUndefined();
    expect(parseRetryAfterMs(undefined)).toBeUndefined();
    expect(parseRetryAfterMs("")).toBeUndefined();
  });
});

describe("computeBackoffMs", () => {
  it("follows the server hint with a small margin", () => {
    expect(computeBackoffMs(1, 12_000)).toBe(12_500);
  });
  it("clamps server hints", () => {
    expect(computeBackoffMs(1, 500)).toBe(BACKOFF_MIN_MS);
    expect(computeBackoffMs(1, 10 * 60_000)).toBe(BACKOFF_MAX_MS);
  });
  it("falls back to exponential backoff", () => {
    expect(computeBackoffMs(1)).toBe(4_000);
    expect(computeBackoffMs(2)).toBe(8_000);
    expect(computeBackoffMs(3)).toBe(16_000);
    expect(computeBackoffMs(10)).toBe(BACKOFF_MAX_MS);
  });
});

describe("maxAttemptsFor", () => {
  it("retries rate limits more than server errors, and never retries rejections", () => {
    expect(maxAttemptsFor("rate_limit")).toBe(5);
    expect(maxAttemptsFor("server")).toBe(3);
    expect(maxAttemptsFor("network")).toBe(3);
    expect(maxAttemptsFor("rejected")).toBe(1);
    expect(maxAttemptsFor(undefined)).toBe(1);
  });
});
