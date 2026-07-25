import { describe, expect, it } from "vitest";

import { conversationForPrompt } from "@/components/pages/VoiceAction";

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
