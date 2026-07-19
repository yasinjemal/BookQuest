import type { Metadata } from "next";
import ReadingEditionReader from "@/components/ReadingEditionReader";
import type { ReadingEditionMetadata, ReadingUnit } from "@/lib/reading-types";
import { publicMetadata } from "@/lib/seo";

export const metadata: Metadata = publicMetadata({
  title: "Full-book Reading Room Demo",
  description: "Try BookQuest's zero-AI full-book Reading Edition with an automatically matched atmosphere, focused typography, search, and saved progress.",
  path: "/demo/reading-room",
});

const passages = [
  {
    title: "Chapter One · The map that waited",
    text: `Mara found the map in the last drawer of the observatory, beneath a stack of weather records and a brass key that no longer opened any door. It had been folded so many times that the valleys had become pale seams. Along the eastern edge, in ink the colour of tea, someone had written: Begin where the lantern goes out.\n\nOutside, evening gathered slowly over the harbour. The roofs below held the final light, and the sea looked like a sheet of hammered metal. Mara carried the map to the western window and watched a hidden line emerge across the paper. It did not point toward a treasure. It traced a walking path through ordinary streets: the baker's alley, the old fig tree, the footbridge where children tied ribbons in summer.\n\nShe smiled at the modesty of it. Great journeys, her grandfather used to say, often disguise themselves as a familiar road taken with better attention.\n\n# A room made for the book\n\nMara lit the small green lamp on the desk. The page warmed. Margins widened around the words, the noise of the room fell away, and the route became easy to follow. For the first time, the map felt less like an object she had discovered and more like an invitation that had been patiently waiting for her to become still enough to notice it.`,
  },
  {
    title: "Chapter Two · Blue hour",
    text: `At blue hour the town changed its voice. Shop shutters settled, bicycles clicked over the stones, and conversations moved indoors. Mara followed the map without hurrying. The path asked for no special courage; only presence.\n\nAt the baker's alley she found a tiled compass set into the wall. At the old fig tree, a narrow brass plate carried three words: Read the weather. The sky was clear, but the phrase made her look again. High cloud streamed from the south, faint as writing erased from a slate.\n\n- Notice what repeats.\n- Leave room for surprise.\n- Mark your place, then keep going.\n\nThe footbridge waited beyond the market. Ribbons moved in the evening wind, each one tied for a promise, a memory, or a person expected home. Mara rested her hands on the rail. Beneath it, the river held every window upside down and made a second town from light.\n\nShe understood then that the route was changing nothing around her. It was changing the quality of her attention. The ordinary world had not become less ordinary. It had become more available.`,
  },
  {
    title: "Chapter Three · A light carried forward",
    text: `The final mark on the map stood at the end of the breakwater. By the time Mara reached it, the lighthouse had begun its slow turn across the bay. Light crossed the water, touched the town, and returned to darkness before beginning again.\n\nThere was no box beneath the stones and no message sealed in glass. Instead, a shallow niche held a lantern with one clear panel and one panel of amber glass. Mara used the brass key. This, at last, was the door it opened.\n\nInside the lantern was a note in her grandfather's hand. A good book does not ask you to leave your life, it said. It gives you a different light by which to return to it.\n\nMara sat until the wind grew cold. She read the line once more, folded the map along its old pale seams, and placed it inside her coat. On the walk home, every pool of window light seemed to offer a small reading room: a chair, a page, a world held open for as long as someone cared to stay.\n\nWhen she reached the observatory, she did not return the lantern to the drawer. She set it beside the green lamp, where its amber pane made the desk glow like late afternoon. Then she opened a blank notebook and began a new map with the simplest direction she knew: Start here.`,
  },
] as const;

const counts = passages.map((passage) => passage.text.match(/\S+/g)?.length ?? 0);
const totalWords = counts.reduce((sum, count) => sum + count, 0);

const units: ReadingUnit[] = passages.map((passage, index) => ({
  index,
  title: passage.title,
  text: passage.text,
  wordCount: counts[index],
  previousTitle: passages[index - 1]?.title ?? null,
  nextTitle: passages[index + 1]?.title ?? null,
}));

const book: ReadingEditionMetadata = {
  id: 7001,
  title: "The Cartographer's Lantern",
  sourceFilename: "the-cartographers-lantern.md",
  sourceChapterCount: passages.length,
  wordCount: totalWords,
  estimatedMinutes: Math.max(1, Math.ceil(totalWords / 230)),
  unitKind: "chapter",
  vibeId: "story-path",
  coverHash: null,
  createdAt: "2026-07-19T00:00:00.000Z",
  progress: null,
  outline: passages.map((passage, index) => ({ index, title: passage.title, wordCount: counts[index] })),
  profile: {
    version: "reading-vibe-v1",
    vibeId: "story-path",
    matchedBy: "source-signal",
    wordCount: totalWords,
    estimatedMinutes: Math.max(1, Math.ceil(totalWords / 230)),
    unitCount: passages.length,
    unitKind: "chapter",
  },
};

export default function ReadingRoomDemoPage() {
  return <ReadingEditionReader bookId={-7001} preview={{ book, units, backHref: "/demo", backLabel: "Demo gallery" }} />;
}
