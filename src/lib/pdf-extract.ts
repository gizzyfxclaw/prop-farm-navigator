/**
 * Client-side PDF -> plain text extraction. Runs entirely in the browser —
 * the file never leaves the device except as extracted text, so no server
 * upload endpoint or blob storage is needed for the knowledge-base flow.
 *
 * Wrapped in createClientOnlyFn so pdfjs-dist (and its worker asset) never
 * enter the server/Worker bundle — the compiler swaps this whole function
 * for a no-op on the server build.
 */
import { createClientOnlyFn } from "@tanstack/react-start";

export const extractPdfText = createClientOnlyFn(async (file: File): Promise<string> => {
  const [pdfjsLib, { default: pdfWorkerUrl }] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((it) => ("str" in it ? it.str : "")).join(" ");
    pages.push(text);
  }
  return pages.join("\n\n").replace(/[ \t]+/g, " ").trim();
});
