import crypto from "crypto";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { XMLParser } from "fast-xml-parser";
import { getCourseStudio, importCourseBlocks } from "./studio";

const MAX_PACKAGE_BYTES = 5 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 20 * 1024 * 1024;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 200;
const MAX_ITEMS = 100;
const QTI_NAMESPACE = "http://www.imsglobal.org/xsd/imsqtiasi_v3p0";
const MANIFEST_NAMESPACE = "http://www.imsglobal.org/xsd/qti/qtiv3p0/imscp_v1p1";

export class QtiPackageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QtiPackageError";
  }
}

type ImportedQtiBlock = {
  blockType: "multiple_choice" | "true_false" | "fill_in";
  content: Record<string, unknown>;
  sourceIdentifier: string;
  title: string;
};

const asArray = <T>(value: T | T[] | undefined): T[] => value === undefined
  ? [] : Array.isArray(value) ? value : [value];

function safePath(value: string) {
  const normalized = value.replaceAll("\\", "/");
  const directory = normalized.endsWith("/");
  const parts = normalized.split("/");
  if (directory) parts.pop();
  if (!parts.length || normalized.startsWith("/") || normalized.includes("\0")
      || parts.some((part) => part === ".." || part === "")) {
    throw new QtiPackageError("QTI package contains an unsafe path");
  }
  return `${parts.join("/")}${directory ? "/" : ""}`;
}

function inspectZip(bytes: Uint8Array) {
  if (bytes.length > MAX_PACKAGE_BYTES) throw new QtiPackageError("QTI package exceeds 5 MB");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65_557); index -= 1) {
    if (view.getUint32(index, true) === 0x06054b50) { eocd = index; break; }
  }
  if (eocd < 0) throw new QtiPackageError("Invalid QTI zip package");
  const entries = view.getUint16(eocd + 10, true);
  const directorySize = view.getUint32(eocd + 12, true);
  const directoryOffset = view.getUint32(eocd + 16, true);
  if (!entries || entries > MAX_FILES || directoryOffset + directorySize > bytes.length) {
    throw new QtiPackageError("QTI package file count or directory is invalid");
  }
  let offset = directoryOffset;
  let total = 0;
  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) {
      throw new QtiPackageError("Invalid QTI zip directory");
    }
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    if ((flags & 1) !== 0 || ![0, 8].includes(method) || size > MAX_FILE_BYTES) {
      throw new QtiPackageError("Encrypted, unsupported or oversized QTI package entry");
    }
    if (offset + 46 + nameLength + extraLength + commentLength > bytes.length) {
      throw new QtiPackageError("Invalid QTI package entry");
    }
    safePath(strFromU8(bytes.subarray(offset + 46, offset + 46 + nameLength)));
    total += size;
    if (total > MAX_UNCOMPRESSED_BYTES) {
      throw new QtiPackageError("QTI package expands beyond 20 MB");
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
}

function rejectDangerousXml(value: string) {
  if (/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(value)) {
    throw new QtiPackageError("QTI XML contains a prohibited declaration");
  }
}

function defaultNamespace(value: string, rootName: string) {
  const withoutDeclaration = value.replace(/^\uFEFF?\s*<\?xml[^>]*\?>\s*/i, "");
  const escapedRoot = rootName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const root = withoutDeclaration.match(new RegExp(`^<${escapedRoot}\\b([^>]*)>`, "i"));
  if (!root) return "";
  return root[1].match(/\bxmlns\s*=\s*["']([^"']+)["']/i)?.[1]?.trim() ?? "";
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
  allowBooleanAttributes: false,
});

function text(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(" ");
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  return Object.entries(record)
    .filter(([key]) => !key.startsWith("@_") && key !== "qti-simple-choice"
      && key !== "qti-choice-interaction" && key !== "qti-text-entry-interaction")
    .map(([, child]) => text(child)).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function attribute(record: Record<string, unknown>, name: string) {
  const value = record[`@_${name}`];
  return typeof value === "string" ? value.trim() : "";
}

function correctValue(root: Record<string, unknown>) {
  const declarations = asArray(root["qti-response-declaration"] as Record<string, unknown> | Record<string, unknown>[] | undefined);
  const declaration = declarations.find((entry) => attribute(entry, "identifier") === "RESPONSE");
  if (!declaration || attribute(declaration, "cardinality") !== "single") {
    throw new QtiPackageError("QTI item requires one single RESPONSE declaration");
  }
  const correct = declaration["qti-correct-response"] as Record<string, unknown> | undefined;
  const values = asArray(correct?.["qti-value"] as string | undefined).map(text).filter(Boolean);
  if (values.length !== 1) throw new QtiPackageError("QTI item requires one correct response");
  return { value: values[0], baseType: attribute(declaration, "base-type") };
}

function parseItem(xml: string): ImportedQtiBlock {
  rejectDangerousXml(xml);
  let parsed: Record<string, unknown>;
  try { parsed = xmlParser.parse(xml) as Record<string, unknown>; }
  catch { throw new QtiPackageError("QTI item XML is malformed"); }
  const root = parsed["qti-assessment-item"] as Record<string, unknown> | undefined;
  if (!root || defaultNamespace(xml, "qti-assessment-item") !== QTI_NAMESPACE) {
    throw new QtiPackageError("QTI item namespace or root is unsupported");
  }
  const identifier = attribute(root, "identifier");
  const title = attribute(root, "title") || identifier;
  if (!identifier || identifier.length > 200 || title.length > 300) {
    throw new QtiPackageError("QTI item identifier or title is invalid");
  }
  const body = root["qti-item-body"] as Record<string, unknown> | undefined;
  if (!body) throw new QtiPackageError("QTI item body is missing");
  const correct = correctValue(root);
  const feedback = text(root["qti-modal-feedback"])
    || "Imported from QTI 3.0. Review answer feedback before publishing.";
  const choice = body["qti-choice-interaction"] as Record<string, unknown> | undefined;
  const entry = body["qti-text-entry-interaction"] as Record<string, unknown> | undefined;
  if (Boolean(choice) === Boolean(entry)) {
    throw new QtiPackageError("QTI item must contain exactly one supported interaction");
  }
  if (choice) {
    if (correct.baseType !== "identifier" || attribute(choice, "response-identifier") !== "RESPONSE"
        || attribute(choice, "max-choices") !== "1") {
      throw new QtiPackageError("Only single-response QTI choice interactions are supported");
    }
    const choices = asArray(choice["qti-simple-choice"] as Record<string, unknown> | Record<string, unknown>[] | undefined);
    if (choices.length < 2 || choices.length > 10) throw new QtiPackageError("QTI choice item must have 2 to 10 choices");
    const identifiers = choices.map((item) => attribute(item, "identifier"));
    const options = choices.map((item) => text(item));
    if (identifiers.some((value) => !value) || options.some((value) => !value)
        || new Set(identifiers).size !== identifiers.length || !identifiers.includes(correct.value)) {
      throw new QtiPackageError("QTI choice identifiers or correct response are invalid");
    }
    const prompt = text(choice["qti-prompt"]);
    if (!prompt) throw new QtiPackageError("QTI choice prompt is missing");
    const correctIndex = identifiers.indexOf(correct.value);
    const normalized = options.map((option) => option.toLowerCase());
    if (options.length === 2 && normalized.includes("true") && normalized.includes("false")) {
      return {
        blockType: "true_false",
        sourceIdentifier: identifier,
        title,
        content: {
          type: "true_false", statement: prompt,
          answer: normalized[correctIndex] === "true", explanation: feedback,
        },
      };
    }
    return {
      blockType: "multiple_choice",
      sourceIdentifier: identifier,
      title,
      content: { type: "multiple_choice", question: prompt, options, correctIndex, explanation: feedback },
    };
  }
  if (correct.baseType !== "string" || attribute(entry!, "response-identifier") !== "RESPONSE") {
    throw new QtiPackageError("Only single string QTI text-entry interactions are supported");
  }
  const prompt = text(body);
  if (!prompt || !correct.value) throw new QtiPackageError("QTI text-entry prompt or answer is missing");
  return {
    blockType: "fill_in",
    sourceIdentifier: identifier,
    title,
    content: { type: "fill_in", prompt, answer: correct.value, acceptedAnswers: [], explanation: feedback },
  };
}

export function parseQti3ItemBank(bytes: Uint8Array) {
  inspectZip(bytes);
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(bytes); }
  catch { throw new QtiPackageError("QTI package could not be decompressed"); }
  const normalized = new Map<string, Uint8Array>();
  for (const [name, contents] of Object.entries(files)) {
    const path = safePath(name);
    if (normalized.has(path)) throw new QtiPackageError("QTI package contains duplicate paths");
    normalized.set(path, contents);
  }
  const manifestBytes = normalized.get("imsmanifest.xml");
  if (!manifestBytes) throw new QtiPackageError("QTI package requires top-level imsmanifest.xml");
  const manifestXml = strFromU8(manifestBytes);
  rejectDangerousXml(manifestXml);
  let manifest: Record<string, unknown>;
  try { manifest = xmlParser.parse(manifestXml) as Record<string, unknown>; }
  catch { throw new QtiPackageError("QTI manifest XML is malformed"); }
  const root = manifest.manifest as Record<string, unknown> | undefined;
  if (!root || defaultNamespace(manifestXml, "manifest") !== MANIFEST_NAMESPACE) {
    throw new QtiPackageError("QTI manifest namespace is unsupported");
  }
  const metadata = root.metadata as Record<string, unknown> | undefined;
  if (text(metadata?.schema) !== "QTI Item Bank" || text(metadata?.schemaversion) !== "3.0.0") {
    throw new QtiPackageError("Only QTI 3.0.0 Item Bank packages are supported");
  }
  const resources = (root.resources as Record<string, unknown> | undefined)?.resource;
  const itemResources = asArray(resources as Record<string, unknown> | Record<string, unknown>[] | undefined)
    .filter((resource) => attribute(resource, "type") === "imsqti_item_xmlv3p0");
  if (!itemResources.length || itemResources.length > MAX_ITEMS) {
    throw new QtiPackageError("QTI package must contain 1 to 100 item resources");
  }
  const hrefs = itemResources.map((resource) => safePath(attribute(resource, "href")));
  if (new Set(hrefs).size !== hrefs.length) throw new QtiPackageError("QTI manifest contains duplicate item resources");
  const items = hrefs.map((href) => {
    const value = normalized.get(href);
    if (!value || value.length > MAX_FILE_BYTES) throw new QtiPackageError("QTI item resource is missing or oversized");
    return parseItem(strFromU8(value));
  });
  if (new Set(items.map((item) => item.sourceIdentifier)).size !== items.length) {
    throw new QtiPackageError("QTI item identifiers must be unique");
  }
  return {
    profile: "bookquest-qti-3.0-item-bank-v1" as const,
    packageHash: crypto.createHash("sha256").update(bytes).digest("hex"),
    items,
  };
}

export async function importQti3ItemBank(userId: number, courseId: number, bytes: Uint8Array) {
  const parsed = parseQti3ItemBank(bytes);
  const stamp = parsed.packageHash.slice(0, 12);
  const blocks = await importCourseBlocks(userId, courseId, {
    moduleKey: `module:qti-${stamp}`,
    moduleTitle: "Imported assessment bank",
    lessonKey: `lesson:qti-${stamp}`,
    lessonTitle: "Imported QTI 3.0 items",
    blocks: parsed.items.map((item) => ({
      blockType: item.blockType,
      content: item.content,
      sourceIdentifier: item.sourceIdentifier,
    })),
    provenance: { format: "QTI 3.0", packageHash: parsed.packageHash },
  });
  return { profile: parsed.profile, packageHash: parsed.packageHash, itemCount: parsed.items.length, blocks };
}

function xml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
  })[character]!);
}

function qtiItem(identifier: string, title: string, blockType: string, content: Record<string, unknown>) {
  const feedback = xml(content.explanation || "Review this answer with the course author.");
  let baseType = "identifier";
  let correct = "";
  let body = "";
  if (blockType === "multiple_choice") {
    const options = (content.options as string[]) ?? [];
    const correctIndex = Number(content.correctIndex ?? 0);
    correct = `CHOICE_${correctIndex + 1}`;
    body = `<qti-choice-interaction response-identifier="RESPONSE" max-choices="1"><qti-prompt>${xml(content.question)}</qti-prompt>${options.map((option, index) => `<qti-simple-choice identifier="CHOICE_${index + 1}">${xml(option)}</qti-simple-choice>`).join("")}</qti-choice-interaction>`;
  } else if (blockType === "true_false") {
    correct = content.answer === true ? "TRUE" : "FALSE";
    body = `<qti-choice-interaction response-identifier="RESPONSE" max-choices="1"><qti-prompt>${xml(content.statement)}</qti-prompt><qti-simple-choice identifier="TRUE">True</qti-simple-choice><qti-simple-choice identifier="FALSE">False</qti-simple-choice></qti-choice-interaction>`;
  } else {
    baseType = "string";
    correct = String(content.answer ?? "");
    body = `<qti-p>${xml(content.prompt)}</qti-p><qti-text-entry-interaction response-identifier="RESPONSE" expected-length="${Math.max(1, correct.length)}"/>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<qti-assessment-item xmlns="${QTI_NAMESPACE}" identifier="${xml(identifier)}" title="${xml(title)}" adaptive="false" time-dependent="false"><qti-response-declaration identifier="RESPONSE" cardinality="single" base-type="${baseType}"><qti-correct-response><qti-value>${xml(correct)}</qti-value></qti-correct-response></qti-response-declaration><qti-outcome-declaration identifier="SCORE" cardinality="single" base-type="float"/><qti-item-body>${body}</qti-item-body><qti-response-processing template="https://purl.imsglobal.org/spec/qti/v3p0/rptemplates/match_correct"/><qti-modal-feedback outcome-identifier="FEEDBACK" identifier="GENERAL" show-hide="show">${feedback}</qti-modal-feedback></qti-assessment-item>`;
}

export async function exportQti3ItemBank(userId: number, courseId: number) {
  const studio = await getCourseStudio(userId, courseId);
  const supported = studio.blocks.filter((block) =>
    ["multiple_choice", "true_false", "fill_in"].includes(block.blockType));
  if (!supported.length) throw new QtiPackageError("Course has no QTI-compatible assessment blocks");
  if (supported.length > MAX_ITEMS) throw new QtiPackageError("Export is limited to 100 assessment items");
  const files: Record<string, Uint8Array> = {};
  const resources: string[] = [];
  for (const [index, block] of supported.entries()) {
    const identifier = `BQ_${block.lineageId.replace(/[^A-Za-z0-9_-]/g, "_")}`;
    const href = `items/item-${String(index + 1).padStart(3, "0")}.xml`;
    const content = block.content as Record<string, unknown>;
    files[href] = strToU8(qtiItem(identifier, block.lessonTitle, block.blockType, content));
    resources.push(`<resource identifier="RES_${identifier}" type="imsqti_item_xmlv3p0" href="${href}"><file href="${href}"/></resource>`);
  }
  const manifest = `<?xml version="1.0" encoding="UTF-8"?>\n<manifest xmlns="${MANIFEST_NAMESPACE}" identifier="MANIFEST_BOOKQUEST_${courseId}"><metadata><schema>QTI Item Bank</schema><schemaversion>3.0.0</schemaversion></metadata><organizations/><resources>${resources.join("")}</resources></manifest>`;
  files["imsmanifest.xml"] = strToU8(manifest);
  const bytes = zipSync(files, { level: 6 });
  return { profile: "bookquest-qti-3.0-item-bank-v1" as const, itemCount: supported.length, bytes };
}
