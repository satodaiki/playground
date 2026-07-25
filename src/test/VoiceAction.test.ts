import { describe, expect, it } from "vitest";

import {
  conversationForPrompt,
  hasForeignScript,
  isSimilarSuggestion,
  suggestionHistoryForPrompt,
} from "@/components/pages/VoiceAction";

describe("conversationForPrompt", () => {
  it("keeps only the latest eight utterances without timestamps", () => {
    const utterances = Array.from({ length: 10 }, (_, index) => ({
      id: String(index),
      text: `発言${index}`,
      at: index,
    }));
    const text = conversationForPrompt(utterances);

    expect(text.split("\n")).toEqual(
      utterances.slice(-8).map(({ text }) => text),
    );
    expect(text).not.toContain(":");
  });
});

describe("suggestionHistoryForPrompt", () => {
  it("keeps the latest five suggestions for duplicate prevention", () => {
    const suggestions = Array.from(
      { length: 7 },
      (_, index) => `話題${index}`,
    );

    expect(suggestionHistoryForPrompt(suggestions).split("\n")).toEqual(
      suggestions.slice(-5).map((text) => `- ${text}`),
    );
  });
});

describe("isSimilarSuggestion", () => {
  const previous = ["最近見た映画で面白かったものはありますか？"];

  it("detects an identical suggestion", () => {
    expect(isSimilarSuggestion(previous[0], previous)).toBe(true);
  });

  it("detects a paraphrase of a recent suggestion", () => {
    expect(
      isSimilarSuggestion("最近見た映画で面白かったものは何ですか？", previous),
    ).toBe(true);
  });

  it("accepts a different topic", () => {
    expect(
      isSimilarSuggestion("週末はどこかに出かける予定はありますか？", previous),
    ).toBe(false);
  });

  it("accepts anything when there is no history", () => {
    expect(isSimilarSuggestion(previous[0], [])).toBe(false);
  });
});

describe("hasForeignScript", () => {
  it("detects an accented latin word leaking into japanese", () => {
    expect(hasForeignScript("最近の、新しい régime は？")).toBe(true);
  });

  it("detects cyrillic", () => {
    expect(hasForeignScript("最近の привет は？")).toBe(true);
  });

  it("accepts plain japanese", () => {
    expect(hasForeignScript("週末はどこかに出かける予定はありますか？")).toBe(
      false,
    );
  });

  it("accepts japanese mixed with plain ascii", () => {
    expect(hasForeignScript("最近はPCやWi-Fiの調子はどうですか？")).toBe(false);
  });
});
