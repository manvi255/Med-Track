import { createWorker } from "tesseract.js";

export function removePersonalIdentifiers(text) {
  return text
    .replace(
      /^\s*(?:patient\s+name|name\s+of\s+patient|patient\s+id|medical\s+record\s*(?:number|no\.?)|mrn|date\s+of\s+birth|dob|phone|mobile|address)\s*[:#-]\s*.*$/gim,
      ""
    )
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED]")
    .replace(/(?<!\w)\+?\d[\d ().-]{7,}\d(?!\w)/g, (candidate) => {
      const digitCount = candidate.replace(/\D/g, "").length;
      return digitCount >= 10 && digitCount <= 15 ? "[REDACTED]" : candidate;
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractPrescriptionText(filePath) {
  const worker = await createWorker("eng");
  try {
    const result = await worker.recognize(filePath);
    return removePersonalIdentifiers(result.data.text);
  } finally {
    await worker.terminate();
  }
}
