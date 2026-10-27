import { describe, expect, it } from "@jest/globals";
import { removePersonalIdentifiers } from "../src/services/prescriptionOcr.service.js";
import { resolvePrescriptionStoragePath } from "../src/utils/prescriptionFiles.js";

describe("prescription privacy safeguards", () => {
  it("redacts common direct identifiers while preserving prescription details", () => {
    const result = removePersonalIdentifiers(
      "Patient Name: Alex Example\nDOB: 01/01/1980\nEmail: alex@example.com\nTake 500 mg daily"
    );

    expect(result).not.toContain("Alex Example");
    expect(result).not.toContain("01/01/1980");
    expect(result).not.toContain("alex@example.com");
    expect(result).toContain("Take 500 mg daily");
  });

  it("only resolves UUID filenames within the private prescription directory", () => {
    expect(() => resolvePrescriptionStoragePath("..\\..\\.env")).toThrow();
    expect(() => resolvePrescriptionStoragePath("random-name.png")).toThrow();
    expect(resolvePrescriptionStoragePath("12345678-1234-4234-8234-123456789abc.png"))
      .toMatch(/storage[\\/]prescriptions[\\/]12345678-1234-4234-8234-123456789abc\.png$/);
  });
});
