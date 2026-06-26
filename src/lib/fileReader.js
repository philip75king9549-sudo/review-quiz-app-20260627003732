const TEXT_EXTENSIONS = new Set(["txt", "md", "markdown", "csv"]);

export const ACCEPTED_FILE_TYPES = ".txt,.md,.markdown,.docx,.pdf";

function extensionOf(filename = "") {
  return filename.split(".").pop()?.toLowerCase() || "";
}

async function readPdf(file) {
  const [pdfjsLib, workerModule] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default;
  const data = new Uint8Array(await file.arrayBuffer());
  const document = await pdfjsLib.getDocument({ data }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    let lastY = null;
    let line = "";
    const lines = [];

    content.items.forEach((item) => {
      const y = Math.round(item.transform?.[5] || 0);
      if (lastY !== null && Math.abs(y - lastY) > 3) {
        if (line.trim()) lines.push(line.trim());
        line = "";
      }
      line += `${line ? " " : ""}${item.str}`;
      lastY = y;
    });

    if (line.trim()) lines.push(line.trim());
    pages.push(lines.join("\n"));
  }

  return pages.join("\n\n");
}

async function readDocx(file) {
  const { default: mammoth } = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  const { value } = await mammoth.extractRawText({ arrayBuffer });
  return value;
}

export async function extractTextFromFile(file) {
  const extension = extensionOf(file.name);

  if (TEXT_EXTENSIONS.has(extension)) {
    return file.text();
  }

  if (extension === "docx") {
    return readDocx(file);
  }

  if (extension === "pdf") {
    return readPdf(file);
  }

  throw new Error("暂不支持这个文件格式，请上传 TXT、Markdown、DOCX 或 PDF。");
}
