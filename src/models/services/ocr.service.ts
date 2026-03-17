import { createWorker } from "tesseract.js";
import { HttpError } from "../../utils/classes";

import sharp from "sharp";

export const extractText = async (buffer: Buffer): Promise<string> => {
  const worker = await createWorker({
    logger: () => null,
  });

  try {
    // 🧠 Compress the image first using sharp (resize + grayscale + compress)
    const compressed = await sharp(buffer)
      .resize({ width: 1000 }) // Resize for OCR performance
      .grayscale() // Better contrast for OCR
      .jpeg({ quality: 70 }) // Compress
      .toBuffer();

    // 🧠 Load Tesseract languages
    await worker.loadLanguage("eng+hin");
    await worker.initialize("eng+hin");

    const {
      data: { text, confidence },
    } = await worker.recognize(compressed);

    if (confidence < 50) {
      throw new HttpError(
        422,
        "Image too blurry or unclear. Please upload a clearer image."
      );
    }

    const cleaned = text
      .toUpperCase()
      .split("\n")
      .map((line) =>
        line
          .normalize("NFKD")
          .replace(/[^\x00-\x7F]+/g, "") // Remove diacritics
          .replace(/\s{2,}/g, " ")
          .trim()
      )
      .filter(Boolean)
      .join("\n");

    return cleaned;
  } finally {
    await worker.terminate();
  }
};

export const parsePAN = (txt: string) =>
  txt.match(/[A-Z]{5}[0-9]{4}[A-Z]/)?.[0] ?? null;
export const parseIFSC = (txt: string) =>
  txt.match(/[A-Z]{4}0[A-Z0-9]{6}/)?.[0] ?? null;
export const parseAccountNo = (txt: string) =>
  txt.match(/\b\d{9,18}\b/)?.[0] ?? null;

export function parseAadhaarDetails(text: string): {
  aadhaarNumber?: string;
  aadhaarName?: string;
  aadhaarDob?: string;
  gender?: string;
  relativeName?: string;
} {
  const lines = text
    .toUpperCase()
    .split("\n")
    .map((line) =>
      line
        .replace(/[^\x00-\x7F]/g, "") // strip non-ASCII
        .replace(/[^A-Z0-9/:\s.-]/gi, "") // strip weird symbols
        .trim()
    )
    .filter(Boolean);

  let aadhaarNumber: string | undefined;
  let aadhaarName: string | undefined;
  let aadhaarDob: string | undefined;
  let gender: string | undefined;
  let relativeName: string | undefined;

  // ✅ Aadhaar number
  const flatText = lines.join(" ");
  const aadhaarMatch = flatText.match(/\b\d{4}\s?\d{4}\s?\d{4}\b/);
  aadhaarNumber = aadhaarMatch?.[0].replace(/\s/g, "");

  // ✅ DOB (very common variants)
  for (const line of lines) {
    const dobMatch = line.match(
      /(?:DOB|D0B|D08)[\s:.-]*([0-9]{2}\/[0-9]{2}\/[0-9]{4})/
    );
    if (dobMatch) {
      aadhaarDob = dobMatch[1];
      break;
    }
  }

  // ✅ Gender
  for (const line of lines) {
    if (/FEMALE/.test(line)) {
      gender = "FEMALE";
      break;
    }
    if (/MALE/.test(line)) {
      gender = "MALE";
      break;
    }
    if (/TRANSGENDER/.test(line)) {
      gender = "TRANSGENDER";
      break;
    }
  }

  // ✅ Relative Name (D/O, S/O, W/O)
  for (const line of lines) {
    const match = line.match(/\b[DSW]\/\s*([A-Z\s]{3,})/);
    if (match) {
      relativeName = match[1].trim();
      break;
    }
  }

  // ✅ Name logic: First valid line before DOB
  const dobIndex = lines.findIndex((l) => l.includes(aadhaarDob ?? ""));
  if (dobIndex > 0) {
    const possibleName = lines[dobIndex - 1];
    const nameMatch = possibleName.match(/[A-Z\s]{3,50}/);
    if (nameMatch) {
      aadhaarName = nameMatch[0].trim();
    }
  }

  // Fallback: look for "5 ANJALI", etc.
  if (!aadhaarName) {
    for (const line of lines) {
      const match = line.match(/^\d{1,2}\s*[-]?\s*([A-Z\s]{3,})$/);
      if (match) {
        aadhaarName = match[1].trim();
        break;
      }
    }
  }

  return {
    aadhaarNumber,
    aadhaarName,
    aadhaarDob,
    gender,
    relativeName,
  };
}
