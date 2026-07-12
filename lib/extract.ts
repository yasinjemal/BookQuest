export interface Chapter {
  title: string;
  text: string;
}

export interface Extracted {
  chapters: Chapter[];
}

const MAX_CHAPTER_CHARS = 24000; // ~6k tokens per chapter chunk

/**
 * Extract text straight from the uploaded bytes — no filesystem. Vercel's
 * serverless filesystem is read-only, and the original file is never needed
 * again once its chapters are extracted (retries reuse the stored chapters).
 */
export async function extractDocument(
  buffer: Buffer,
  filename: string
): Promise<Extracted> {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  let markdown: string;

  if (ext === "pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    markdown = text;
  } else if (ext === "docx") {
    const mammoth = await import("mammoth");
    // convertToMarkdown accepts a buffer at runtime but is missing from the types
    const convert = (
      mammoth as unknown as {
        convertToMarkdown: (input: { buffer: Buffer }) => Promise<{ value: string }>;
      }
    ).convertToMarkdown;
    const result = await convert({ buffer });
    markdown = result.value;
  } else if (ext === "pptx") {
    const { strFromU8, unzipSync } = await import("fflate");
    let selectedBytes = 0;
    const files = unzipSync(new Uint8Array(buffer), {
      filter(file) {
        const selected = /^ppt\/slides\/slide\d+\.xml$/i.test(file.name);
        if (!selected) return false;
        selectedBytes += file.originalSize;
        if (file.originalSize > 5 * 1024 * 1024 || selectedBytes > 25 * 1024 * 1024) {
          throw new Error("PowerPoint slide text is too large to process safely.");
        }
        return true;
      },
    });
    const decodeXml = (value: string) =>
      value
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
    const slides = Object.entries(files)
      .map(([name, bytes]) => ({
        name,
        number: Number(name.match(/slide(\d+)\.xml$/i)?.[1] ?? 0),
        xml: strFromU8(bytes),
      }))
      .sort((a, b) => a.number - b.number)
      .map((slide) => {
        const text = [...slide.xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/gi)]
          .map((match) => decodeXml(match[1]).trim())
          .filter(Boolean)
          .join("\n");
        return text ? `# Slide ${slide.number}\n\n${text}` : "";
      })
      .filter(Boolean);
    if (slides.length === 0) {
      throw new Error("No readable slide text was found in this PowerPoint file.");
    }
    markdown = slides.join("\n\n");
  } else {
    // md / txt / anything text-like
    markdown = buffer.toString("utf-8");
  }

  markdown = markdown.replace(/\r\n/g, "\n").trim();
  if (!markdown) throw new Error("No text could be extracted from this file.");

  return { chapters: splitIntoChapters(markdown, ext === "pptx" ? 0 : 200) };
}

/** Split by markdown headings or chapter-like lines; fall back to size chunks. */
export function splitIntoChapters(text: string, minimumChapterChars = 200): Chapter[] {
  const lines = text.split("\n");
  const headingRe =
    /^(#{1,3}\s+.+|(?:CHAPTER|Chapter|PART|Part|SECTION|Section)\s+([0-9IVXLC]+|[A-Za-z]+)\b.*)$/;

  const chapters: Chapter[] = [];
  let currentTitle = "Introduction";
  let currentLines: string[] = [];

  const flush = () => {
    const body = currentLines.join("\n").trim();
    if (body.length > minimumChapterChars) {
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
