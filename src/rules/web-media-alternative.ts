import { staticAttributeValue } from "../rule-utils.js";
import type { JsxElement, RuleContext, RuleDefinition } from "../types.js";

export const mediaAlternativeRule: RuleDefinition = {
  id: "CDOM015",
  title: "Media is missing an obvious text alternative",
  severity: "warning",
  confidence: "medium",
  category: "structure",
  wcag: ["1.2.1", "1.2.2", "1.2.3", "1.2.5"],
  standards: [
    { version: "wcag20", criterion: "1.2.1", level: "a", title: "Audio-only and Video-only" },
    { version: "wcag20", criterion: "1.2.2", level: "a", title: "Captions" },
    { version: "wcag20", criterion: "1.2.3", level: "a", title: "Audio Description or Media Alternative" },
    { version: "wcag20", criterion: "1.2.5", level: "aa", title: "Audio Description" },
    { version: "wcag21", criterion: "1.2.1", level: "a", title: "Audio-only and Video-only" },
    { version: "wcag21", criterion: "1.2.2", level: "a", title: "Captions" },
    { version: "wcag21", criterion: "1.2.3", level: "a", title: "Audio Description or Media Alternative" },
    { version: "wcag21", criterion: "1.2.5", level: "aa", title: "Audio Description" },
    { version: "wcag22", criterion: "1.2.1", level: "a", title: "Audio-only and Video-only" },
    { version: "wcag22", criterion: "1.2.2", level: "a", title: "Captions" },
    { version: "wcag22", criterion: "1.2.3", level: "a", title: "Audio Description or Media Alternative" },
    { version: "wcag22", criterion: "1.2.5", level: "aa", title: "Audio Description" },
    { version: "wcag30", criterion: "media-alternatives", title: "Media has alternatives" }
  ],
  platforms: ["web"],
  fixable: false,
  summary: "Audio and video need captions, transcripts, or descriptions that are visible to assistive technology users.",
  guidance: "Provide caption/subtitle/description tracks for video, and link audio-only content to a transcript with aria-describedby or visible transcript text.",
  examples: [
    { label: "Captioned video", code: '<video controls><track kind="captions" src="/captions.vtt" /></video>' },
    { label: "Audio transcript", code: '<p id="podcast-transcript">Transcript available below</p><audio controls aria-describedby="podcast-transcript" />' }
  ],
  check(context) {
    return context.elements
      .filter((element) => element.tagName.toLowerCase() === "audio" || element.tagName.toLowerCase() === "video")
      .filter((element) => !hasObviousAlternative(element, context))
      .map((element) => context.createFinding(this, element, "Add captions, a transcript, audio description, or an aria-describedby reference to the media alternative."));
  }
};

function hasObviousAlternative(element: JsxElement, context: RuleContext): boolean {
  if (staticAttributeValue(element, context, "aria-describedby")?.trim()) return true;
  if (context.elementText(element).toLowerCase().includes("transcript")) return true;

  return element.childIds
    .map((id) => context.elements[id])
    .filter((child): child is JsxElement => Boolean(child))
    .some((child) => {
      if (child.tagName.toLowerCase() !== "track") return false;
      const kind = staticAttributeValue(child, context, "kind")?.toLowerCase() ?? "subtitles";
      return ["captions", "subtitles", "descriptions"].includes(kind);
    });
}
