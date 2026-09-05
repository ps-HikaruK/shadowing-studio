import { describe, expect, it } from "vitest";
import {
  cleanLine,
  extractEnglishLines,
  segmentScript,
  splitLongSentence,
  splitSentences,
  suggestTitle,
} from "@/utils/segmenter";

describe("cleanLine", () => {
  it("removes markdown emphasis, list markers and speaker labels", () => {
    expect(cleanLine("- **You:** Hey, how's it going?")).toBe("Hey, how's it going?");
    expect(cleanLine("1. A: I've been swamped lately.")).toBe("I've been swamped lately.");
    expect(cleanLine("> ChatGPT: That sounds rough.")).toBe("That sounds rough.");
    expect(cleanLine("あなた： Could you say that again?")).toBe("Could you say that again?");
  });

  it("removes Japanese parenthetical notes and surrounding quotes", () => {
    expect(cleanLine("I'm all ears.（聞いてるよ）")).toBe("I'm all ears.");
    expect(cleanLine('"Let me think about it."')).toBe("Let me think about it.");
  });

  it("keeps time expressions and URLs intact", () => {
    expect(cleanLine("10:30 works for me.")).toBe("10:30 works for me.");
  });

  it("drops separators", () => {
    expect(cleanLine("---")).toBe("");
    expect(cleanLine("***")).toBe("");
  });
});

describe("extractEnglishLines", () => {
  it("filters out Japanese translation lines", () => {
    const src = `A: Hey, how's it going?
（やあ、調子はどう？）
B: Not bad. I've been swamped with work lately, though.
最近仕事が立て込んでいてね。

## 修正ポイント
- "swamped" は「忙殺されている」の意味。`;
    expect(extractEnglishLines(src)).toEqual([
      "Hey, how's it going?",
      "Not bad. I've been swamped with work lately, though.",
    ]);
  });
});

describe("splitSentences", () => {
  it("splits on terminal punctuation followed by a capital", () => {
    expect(splitSentences("Not bad. I've been swamped with work lately, though. You?")).toEqual([
      "Not bad.",
      "I've been swamped with work lately, though.",
      "You?",
    ]);
  });

  it("does not split abbreviations, decimals, or ellipses", () => {
    expect(splitSentences("I met Dr. Smith at 3.5 p.m. yesterday... It was fine.")).toEqual([
      "I met Dr. Smith at 3.5 p.m. yesterday...",
      "It was fine.",
    ]);
  });

  it("handles quotes after punctuation", () => {
    expect(splitSentences('He said, "Let\'s go." Then we left.')).toEqual([
      'He said, "Let\'s go."',
      "Then we left.",
    ]);
  });

  it("keeps short conversational answers as segments", () => {
    expect(splitSentences("No. I don't think so. Yeah!")).toEqual(["No.", "I don't think so.", "Yeah!"]);
  });
});

describe("splitLongSentence", () => {
  it("splits long sentences at clause boundaries near the middle", () => {
    const long =
      "I was going to call you yesterday about the meeting, but my phone died halfway through the afternoon and I could not find a charger anywhere in the office.";
    const parts = splitLongSentence(long, 80);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join(" ").replace(/\s+/g, " ")).toBe(long);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(110);
  });

  it("returns as-is when short enough", () => {
    expect(splitLongSentence("Short one.", 80)).toEqual(["Short one."]);
  });
});

describe("segmentScript", () => {
  const script = `**Corrected script**

A: Hey, sorry I'm late. The train was packed this morning.
B: No worries. Wanna grab a coffee before we start?
A: Sure, I could use one.

---
日本語訳:
A: 遅れてごめん。今朝は電車が混んでてね。`;

  it("produces sentence-level segments by default", () => {
    expect(segmentScript(script)).toEqual([
      "Corrected script",
      "Hey, sorry I'm late.",
      "The train was packed this morning.",
      "No worries.",
      "Wanna grab a coffee before we start?",
      "Sure, I could use one.",
    ]);
  });

  it("supports line mode", () => {
    expect(segmentScript(script, { mode: "line" })).toEqual([
      "Corrected script",
      "Hey, sorry I'm late. The train was packed this morning.",
      "No worries. Wanna grab a coffee before we start?",
      "Sure, I could use one.",
    ]);
  });
});

describe("suggestTitle", () => {
  it("uses the first segment without trailing punctuation", () => {
    expect(suggestTitle(["Hey, sorry I'm late.", "x"])).toBe("Hey, sorry I'm late");
  });
  it("truncates on a word boundary", () => {
    const t = suggestTitle(["This is a considerably longer opening sentence for the lesson title."], 30);
    expect(t.endsWith("…")).toBe(true);
    expect(t.length).toBeLessThanOrEqual(31);
  });
});
