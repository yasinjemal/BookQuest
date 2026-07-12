import { describe, expect, it } from "vitest";
import { BLOCK_CHANNELS, validateBlockContent } from "../lib/block-registry";

describe("Course Studio block registry", () => {
  it("validates all supported composable block families", () => {
    const examples: Record<string, unknown> = {
      explanation: { type: "explanation", heading: "Idea", body: "A clear explanation." },
      image: { type: "image", url: "/image.png", altText: "A chart", decorative: false },
      audio_video: { type: "audio_video", url: "/clip.mp4", title: "Clip", transcript: "Text" },
      story: { type: "story", title: "A story", body: "A useful story." },
      worked_example: { type: "worked_example", title: "Example", problem: "Problem", steps: ["Step"], result: "Result" },
      flashcard: { type: "flashcard", front: "Q", back: "A", frontLabel: "Question", backLabel: "Answer" },
      multiple_choice: { type: "multiple_choice", question: "Q?", options: ["A", "B"], correctIndex: 0, explanation: "A" },
      true_false: { type: "true_false", statement: "True", answer: true, explanation: "Yes" },
      fill_in: { type: "fill_in", prompt: "A ___", answer: "B", acceptedAnswers: [], explanation: "Because" },
      scenario: { type: "scenario", context: "Context", decisionPrompt: "Choose" },
      practical_task: { type: "practical_task", title: "Do", instructions: ["Act"], submissionAlternative: "Describe it" },
      discussion: { type: "discussion", prompt: "Discuss", privateAlternative: "Reflect privately" },
      survey: { type: "survey", title: "Survey", questions: [{ id: "q1", label: "Question", responseType: "text" }] },
      attestation: { type: "attestation", statement: "I agree", consentLabel: "Confirm", required: true },
      recap: { type: "recap", heading: "Recap", points: ["Point"] },
    };
    for (const [type, content] of Object.entries(examples)) {
      expect(validateBlockContent(type, content), type).toEqual({ valid: true, issues: [] });
    }
  });

  it("requires accessible media alternatives", () => {
    expect(
      validateBlockContent("image", {
        type: "image",
        url: "/chart.png",
        altText: "",
        decorative: false,
      })
    ).toMatchObject({ valid: false });
    expect(
      validateBlockContent("audio_video", {
        type: "audio_video",
        url: "/clip.mp4",
        title: "Clip",
      })
    ).toMatchObject({ valid: false });
  });

  it("declares channel support and non-executable fallbacks", () => {
    expect(BLOCK_CHANNELS.image).toEqual({
      offline: true,
      chat: false,
      fallback: "explanation",
    });
    expect(BLOCK_CHANNELS.audio_video).toEqual({
      offline: false,
      chat: false,
      fallback: "explanation",
    });
  });
});
