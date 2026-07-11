import fs from "fs/promises";

export interface Chapter {
  title: string;
  text: string;
}

export interface Extracted {
  chapters: Chapter[];
}

const MAX_CHAPTER_CHARS = 24000; // ~6k tokens per chapter chunk

export async function extractDocument(
  filePath: string,
  filename: string
): Promise<Extracted> {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  let markdown: string;

  if (ext === "pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const buffer = await fs.readFile(filePath);
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    markdown = text;
  } else if (ext === "docx") {
    const mammoth = await import("mammoth");
    // convertToMarkdown exists at runtime but is missing from mammoth's types
    const convert = (
      mammoth as unknown as {
        convertToMarkdown: (input: { path: string }) => Promise<{ value: string }>;
      }
    ).convertToMarkdown;
    const result = await convert({ path: filePath });
    markdown = result.value;
  } else {
    // md / txt / anything text-like
    markdown = await fs.readFile(filePath, "utf-8");
  }

  markdown = markdown.replace(/\r\n/g, "\n").trim();
  if (!markdown) throw new Error("No text could be extracted from this file.");

  return { chapters: splitIntoChapters(markdown) };
}

/** Split by markdown headings or chapter-like lines; fall back to size chunks. */
export function splitIntoChapters(text: string): Chapter[] {
  const lines = text.split("\n");
  const headingRe =
    /^(#{1,3}\s+.+|(?:CHAPTER|Chapter|PART|Part|SECTION|Section)\s+([0-9IVXLC]+|[A-Za-z]+)\b.*)$/;

  const chapters: Chapter[] = [];
  let currentTitle = "Introduction";
  let currentLines: string[] = [];

  const flush = () => {
    const body = currentLines.join("\n").trim();
    if (body.length > 200) {
      chapters.push({ title: currentTitle, text: body });
    } else if (body && chapters.length > 0) {
      // Too small to stand alone — merge into previous chapter
      chapters[chapters.length - 1].text += "\n\n" + body;
    }
    currentLines = [];
  };

  for (const line of lines) {
    if (headingRe.test(line.trim())) {
      flush();
      currentTitle = line.replace(/^#+\s*/, "").trim().slice(0, 100) || "Untitled";
    } else {
      currentLines.push(line);
    }
  }
  flush();

  if (chapters.length === 0) {
    chapters.push({ title: "Full document", text });
  }

  // Enforce max size — split oversized chapters on paragraph boundaries
  const sized: Chapter[] = [];
  for (const ch of chapters) {
    if (ch.text.length <= MAX_CHAPTER_CHARS) {
      sized.push(ch);
      continue;
    }
    const paras = ch.text.split(/\n\n+/);
    let part = 1;
    let buf: string[] = [];
    let len = 0;
    for (const p of paras) {
      if (len + p.length > MAX_CHAPTER_CHARS && buf.length > 0) {
        sized.push({ title: `${ch.title} (part ${part})`, text: buf.join("\n\n") });
        part++;
        buf = [];
        len = 0;
      }
      buf.push(p);
      len += p.length + 2;
    }
    if (buf.length > 0) {
      sized.push({
        title: part > 1 ? `${ch.title} (part ${part})` : ch.title,
        text: buf.join("\n\n"),
      });
    }
  }
  return sized;
}
