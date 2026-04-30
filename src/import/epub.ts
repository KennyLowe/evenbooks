/**
 * EPUB parser.
 *
 * Per contracts/import-pipeline.md and Phase 0 R1: unpack the ZIP via JSZip,
 * read META-INF/container.xml to find the OPF, parse the OPF for metadata
 * + spine, walk each spine item's XHTML and extract body text. Pure
 * function (apart from JSZip's internal IO over the ArrayBuffer).
 *
 * Skips: `<img>`, `<svg>`, `<script>`, `<style>`, `<head>`, `<nav>`, audio,
 * video, iframe (FR-009 — text-only by intent).
 */

import JSZip from "jszip";
import { detectsDrm, type ZipFileMap } from "./drm";

export type ParsedBook = {
  format: "epub";
  title: string;
  author: string;
  text: string;
};

export type EpubFailure =
  | { kind: "drm-protected" }
  | { kind: "malformed"; detail?: string }
  | { kind: "empty" };

const SKIP_TAGS = new Set([
  "script",
  "style",
  "head",
  "nav",
  "img",
  "svg",
  "audio",
  "video",
  "iframe",
]);

const PARAGRAPH_TAGS = new Set([
  "p",
  "div",
  "section",
  "article",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "blockquote",
  "br",
]);

export async function epubParse(
  buffer: ArrayBuffer,
  filename: string,
): Promise<ParsedBook | EpubFailure> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (e) {
    return { kind: "malformed", detail: `zip load failed: ${String(e)}` };
  }

  const fileMap: ZipFileMap = {
    has: (path) => zip.file(path) !== null,
    getString: async (path) => {
      const file = zip.file(path);
      if (!file) return null;
      try {
        return await file.async("string");
      } catch {
        return null;
      }
    },
  };

  if (await detectsDrm(fileMap)) {
    return { kind: "drm-protected" };
  }

  // Locate the OPF via container.xml.
  const containerXml = await fileMap.getString("META-INF/container.xml");
  if (!containerXml) {
    return { kind: "malformed", detail: "missing container.xml" };
  }

  const opfPath = extractOpfPath(containerXml);
  if (!opfPath) {
    return { kind: "malformed", detail: "no rootfile in container.xml" };
  }

  const opfXml = await fileMap.getString(opfPath);
  if (!opfXml) {
    return { kind: "malformed", detail: `missing OPF at ${opfPath}` };
  }

  const parsedOpf = parseOpf(opfXml);
  if (parsedOpf === null) {
    return { kind: "malformed", detail: "OPF parse failed" };
  }

  const opfDir = opfPath.includes("/")
    ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1)
    : "";

  // Resolve spine items to XHTML files.
  const spinePaths: string[] = [];
  for (const idref of parsedOpf.spine) {
    const item = parsedOpf.manifest.get(idref);
    if (!item) continue; // skip silently per spec
    spinePaths.push(opfDir + item);
  }

  if (spinePaths.length === 0) {
    return { kind: "malformed", detail: "empty spine" };
  }

  // Walk each spine item and concatenate its body text.
  const blocks: string[] = [];
  for (const path of spinePaths) {
    const xhtml = await fileMap.getString(path);
    if (!xhtml) continue;
    const text = extractBodyText(xhtml);
    if (text.length > 0) {
      blocks.push(text);
    }
  }

  const fullText = blocks.join("\n\n").trim();
  if (fullText.length === 0) {
    return { kind: "empty" };
  }

  // Title fallback: filename minus .epub extension.
  const title =
    parsedOpf.title.trim().length > 0
      ? parsedOpf.title.trim()
      : filename.replace(/\.epub$/i, "");

  // Author: join multiple creators with ", ".
  const author =
    parsedOpf.authors.length > 0 ? parsedOpf.authors.join(", ") : "Unknown";

  return {
    format: "epub",
    title,
    author,
    text: fullText,
  };
}

function extractOpfPath(containerXml: string): string | null {
  const dom = parseXml(containerXml);
  if (!dom) return null;
  const rootfile = dom.querySelector(
    'rootfile[media-type="application/oebps-package+xml"]',
  );
  if (!rootfile) {
    const any = dom.querySelector("rootfile");
    if (any) return any.getAttribute("full-path");
    return null;
  }
  return rootfile.getAttribute("full-path");
}

interface ParsedOpf {
  title: string;
  authors: string[];
  manifest: Map<string, string>; // id → href
  spine: string[]; // ordered idrefs
}

function parseOpf(opfXml: string): ParsedOpf | null {
  const dom = parseXml(opfXml);
  if (!dom) return null;

  const titleEl = dom.querySelector("metadata > title, metadata > *|title");
  const title = (
    titleEl?.textContent ??
    findElementByLocalName(dom, "title")?.textContent ??
    ""
  ).trim();

  const creators = Array.from(queryByLocalName(dom, "creator"))
    .map((el) => el.textContent?.trim() ?? "")
    .filter((s) => s.length > 0);

  const manifest = new Map<string, string>();
  const manifestItems = Array.from(queryByLocalName(dom, "item"));
  for (const item of manifestItems) {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    const mediaType = item.getAttribute("media-type") ?? "";
    if (id && href && mediaType.includes("xhtml")) {
      manifest.set(id, href);
    }
  }

  const spine: string[] = [];
  const itemrefs = Array.from(queryByLocalName(dom, "itemref"));
  for (const ref of itemrefs) {
    const idref = ref.getAttribute("idref");
    if (idref) spine.push(idref);
  }

  return {
    title,
    authors: creators,
    manifest,
    spine,
  };
}

function extractBodyText(xhtml: string): string {
  const dom = parseHtml(xhtml);
  if (!dom) return "";

  const body = dom.querySelector("body") ?? dom.documentElement;
  if (!body) return "";

  const blocks: string[] = [];
  walkForText(body, blocks, "");
  return blocks
    .map((b) => b.replace(/\s+/g, " ").trim())
    .filter((b) => b.length > 0)
    .join("\n\n");
}

function walkForText(
  node: Element | Node,
  blocks: string[],
  current: string,
  state = { current },
): void {
  if (node.nodeType === 3) {
    // Text node
    state.current += node.textContent ?? "";
    return;
  }
  if (node.nodeType !== 1) return;
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  if (SKIP_TAGS.has(tag)) return;

  const isParagraph = PARAGRAPH_TAGS.has(tag);

  if (isParagraph) {
    flushIntoBlocks(state, blocks);
  }

  for (const child of Array.from(el.childNodes)) {
    walkForText(child, blocks, "", state);
  }

  if (isParagraph) {
    flushIntoBlocks(state, blocks);
  }
}

function flushIntoBlocks(state: { current: string }, blocks: string[]): void {
  const trimmed = state.current.trim();
  if (trimmed.length > 0) {
    blocks.push(trimmed);
  }
  state.current = "";
}

function parseXml(xml: string): Document | null {
  try {
    const dom = new DOMParser().parseFromString(xml, "application/xml");
    if (dom.querySelector("parsererror")) return null;
    return dom;
  } catch {
    return null;
  }
}

function parseHtml(html: string): Document | null {
  try {
    return new DOMParser().parseFromString(html, "text/html");
  } catch {
    return null;
  }
}

function findElementByLocalName(
  doc: Document,
  localName: string,
): Element | null {
  const all = doc.getElementsByTagName("*");
  for (let i = 0; i < all.length; i++) {
    if (all[i].localName === localName) return all[i];
  }
  return null;
}

function queryByLocalName(
  doc: Document | Element,
  localName: string,
): Element[] {
  const out: Element[] = [];
  const root = "querySelectorAll" in doc ? doc : (doc as Document);
  const all = (root as Element | Document).getElementsByTagName("*");
  for (let i = 0; i < all.length; i++) {
    if (all[i].localName === localName) out.push(all[i]);
  }
  return out;
}
