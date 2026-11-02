import { extractText, getDocumentProxy } from "unpdf";

export const SUPPORTED_EXTENSIONS = [".pdf", ".txt", ".md", ".markdown", ".csv", ".html", ".htm", ".json", ".tex", ".rtf"];

export class UnsupportedFileError extends Error {}

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)>/gi, "\n")
    .replace(/<h([1-6])[^>]*>/gi, (_, n) => "\n" + "#".repeat(Math.min(3, Number(n))) + " ")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Extract plain text from an uploaded course file. */
export async function extractFileText(name: string, data: Buffer): Promise<string> {
  const ext = name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "";
  if (ext === ".pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(data));
    const { text } = await extractText(pdf, { mergePages: false });
    const pages = (Array.isArray(text) ? text : [text]).map((t, i) => `[Page ${i + 1}]\n${t.trim()}`);
    return pages.join("\n\n");
  }
  if (ext === ".html" || ext === ".htm") return htmlToText(data.toString("utf8"));
  if (SUPPORTED_EXTENSIONS.includes(ext)) return data.toString("utf8");
  throw new UnsupportedFileError(
    `"${name}" isn't a supported file type. Use PDF, text, Markdown or HTML (or paste the text directly).`,
  );
}
