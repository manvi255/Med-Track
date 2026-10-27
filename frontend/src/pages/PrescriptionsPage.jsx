import { useCallback, useState } from "react";
import {
  confirmPrescription,
  deletePrescription,
  getPrescription,
  listPrescriptions,
  uploadPrescription
} from "../api/resources.js";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { Feedback } from "../components/Feedback.jsx";
import { FormField } from "../components/FormField.jsx";
import { LoadState } from "../components/LoadState.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { useRemoteData } from "../hooks/useRemoteData.js";

const todayDate = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

function emptyDraft(suggestion = {}) {
  return {
    name: suggestion.name ?? "",
    category: suggestion.category ?? "medication",
    dosage: suggestion.dosage ?? "",
    form: suggestion.form ?? "",
    frequency: suggestion.frequency ?? "",
    instructions: suggestion.instructions ?? "",
    startDate: todayDate(),
    endDate: "",
    isActive: true,
    reviewStatus: suggestion.reviewStatus ?? (suggestion.name ? "yes" : "no"),
    isEditing: suggestion.isEditing ?? !suggestion.name
  };
}

function draftFromExtractedLine(line) {
  const value = String(line ?? "").replace(/\s+/g, " ").trim();
  if (!value) return null;
  const normalized = value.replace(/^\s*[-•*]\s*/, "");
  const split = normalized.split(/\s*-\s*/);
  const name = split[0]?.trim() || normalized;
  const dosage = split.length > 1 ? split.slice(1).join(" - ").trim() : "";

  return emptyDraft({
    name,
    dosage,
    reviewStatus: "no",
    isEditing: true
  });
}

function buildDraftsFromText(text, fallbackSuggestions = []) {
  if (!text) return fallbackSuggestions.map((suggestion) => emptyDraft(suggestion));

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(draftFromExtractedLine)
    .filter(Boolean);

  if (lines.length) return lines;
  return fallbackSuggestions.map((suggestion) => emptyDraft(suggestion));
}

function draftPayload(draft) {
  return {
    name: draft.name,
    category: draft.category,
    dosage: draft.dosage,
    ...(draft.form ? { form: draft.form } : {}),
    frequency: draft.frequency,
    ...(draft.instructions ? { instructions: draft.instructions } : {}),
    startDate: draft.startDate,
    ...(draft.endDate ? { endDate: draft.endDate } : {}),
    isActive: draft.isActive
  };
}

export function PrescriptionsPage() {
  const loadPrescriptions = useCallback(() => listPrescriptions(), []);
  const { data: prescriptions, isLoading, error, refresh } = useRemoteData(loadPrescriptions, [loadPrescriptions]);
  const [selected, setSelected] = useState(null);
  const [drafts, setDrafts] = useState([]);
  const [imagePreview, setImagePreview] = useState("");
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState("");

  async function openPrescription(prescription) {
    setPageError("");
    setImagePreview("");
    setSelectedLoading(true);
    try {
      const detail = await getPrescription(prescription.id);
      setSelected(detail);
      const parsedDrafts = buildDraftsFromText(detail.extractedText, detail.medicines ?? []);
      setDrafts(parsedDrafts);
    } catch (requestError) {
      setPageError(requestError.message);
    } finally {
      setSelectedLoading(false);
    }
  }

  async function handleUpload(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const file = formElement.elements.namedItem("prescriptionFile")?.files?.[0];
    if (!file) return;
    setPageError("");
    setNotice("");
    if (file.size > 5 * 1024 * 1024) {
      setPageError("Choose an image smaller than 5 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);

    setUploading(true);
    try {
      const prescription = await uploadPrescription(file);
      setSelected(prescription);
      setDrafts(buildDraftsFromText(prescription.extractedText, prescription.medicines ?? []));
      setNotice("Image uploaded. Review the extracted text; any medicines must be explicitly entered and confirmed.");
      formElement.reset();
      await refresh();
    } catch (requestError) {
      setPageError(requestError.message);
    } finally {
      setUploading(false);
    }
  }

  function updateDraft(index, key, value) {
    setDrafts((current) => current.map((draft, itemIndex) => itemIndex === index
      ? { ...draft, [key]: value }
      : draft));
  }

  async function saveConfirmedMedicines(event) {
    event.preventDefault();
    if (!selected || !drafts.length) return;

    const hasUnreviewedDrafts = drafts.some((draft) => !["yes", "no"].includes(draft.reviewStatus));
    const reviewedDrafts = drafts.filter((draft) => draft.reviewStatus === "yes");

    if (hasUnreviewedDrafts) {
      setPageError("Please mark each medicine as Yes or No before confirming.");
      return;
    }
    if (!reviewedDrafts.length) {
      setPageError("Please select at least one medicine as Yes to add it.");
      return;
    }

    setPageError("");
    setNotice("");
    setConfirming(true);
    try {
      const result = await confirmPrescription(selected.id, reviewedDrafts.map(draftPayload));
      setSelected(result.prescription);
      setNotice(`${result.medicines.length} reviewed medicine${result.medicines.length === 1 ? "" : "s"} added to your medicine list.`);
      await refresh();
    } catch (requestError) {
      setPageError(requestError.message);
    } finally {
      setConfirming(false);
    }
  }

  async function removePrescription(prescription) {
    if (!window.confirm(`Delete ${prescription.originalFilename}? This also removes the stored image.`)) return;
    setPageError("");
    setNotice("");
    try {
      await deletePrescription(prescription.id);
      if (selected?.id === prescription.id) {
        setSelected(null);
        setDrafts([]);
      }
      setNotice("Prescription image deleted.");
      await refresh();
    } catch (requestError) {
      setPageError(requestError.message);
    }
  }

  return (
    <>
      <PageHeader eyebrow="DOCUMENTS" title="Prescriptions" description="Upload an image for text extraction, then review the result. OCR text is not automatically added to your medicine list.">
        <form className="upload-control" onSubmit={handleUpload}>
          <label className="file-picker">
            <span>Choose image</span>
            <input name="prescriptionFile" type="file" accept="image/jpeg,image/png,image/webp" required />
          </label>
          <Button type="submit" disabled={uploading}>{uploading ? "Uploading…" : "Upload image"}</Button>
        </form>
      </PageHeader>
      {notice && <Feedback>{notice}</Feedback>}
      {pageError && <Feedback variant="error">{pageError}</Feedback>}
      {selectedLoading && <Feedback>Loading prescription review…</Feedback>}

      <LoadState isLoading={isLoading} error={error} onRetry={refresh}>
        {!prescriptions?.length ? (
          <Card className="empty-state"><span className="empty-icon">P</span><h2>No prescriptions uploaded</h2><p>Choose a JPEG, PNG, or WebP image up to 5 MB to begin a private review.</p></Card>
        ) : (
          <div className="entity-list">
            {prescriptions.map((prescription) => (
              <Card className={`entity-card${selected?.id === prescription.id ? " entity-card--selected" : ""}`} key={prescription.id}>
                <div className="entity-mark entity-mark--prescription">P</div>
                <button className="entity-select" type="button" onClick={() => openPrescription(prescription)}>
                  <span className="entity-title-row"><strong>{prescription.originalFilename}</strong><span className={`status-pill status-pill--${prescription.status}`}>{prescription.status.replace("_", " ")}</span></span>
                  <span className="entity-meta">Uploaded {new Date(prescription.createdAt).toLocaleString()}</span>
                </button>
                <div className="entity-actions"><Button variant="danger" onClick={() => removePrescription(prescription)}>Delete</Button></div>
              </Card>
            ))}
          </div>
        )}
      </LoadState>

      {selected && (
        <Card className="review-card">
          <div className="editor-heading">
            <div><p className="eyebrow">PRIVATE REVIEW</p><h2>{selected.originalFilename}</h2></div>
            <span className={`status-pill status-pill--${selected.status}`}>{selected.status.replace("_", " ")}</span>
          </div>
          {selected.errorMessage && <Feedback variant="error">{selected.errorMessage}</Feedback>}
          {imagePreview && (
            <div className="prescription-image-wrap">
              <h3>Prescription image</h3>
              <img className="prescription-preview" src={imagePreview} alt={selected.originalFilename} />
            </div>
          )}
          {selected.extractedText ? (
            <div className="ocr-text-wrap">
              <h3>Extracted text</h3>
              <pre className="ocr-text">{selected.extractedText}</pre>
            </div>
          ) : (
            <Feedback>No text was extracted. You can still add medicine details below after checking the original prescription image.</Feedback>
          )}
          {selected.status === "review_required" && (
            <form className="draft-form" onSubmit={saveConfirmedMedicines}>
              <div className="draft-heading"><div><h3>Medicine details to add</h3><p>Enter and check each medicine yourself. Nothing is saved until you confirm.</p></div><Button variant="secondary" onClick={() => setDrafts([...drafts, emptyDraft()])}>Add medicine</Button></div>
              {!drafts.length && <div className="empty-inline">No medicine details have been entered yet.</div>}
              {drafts.map((draft, index) => (
                <section className="draft-medicine" key={index} aria-label={`Medicine ${index + 1}`}>
                  <div className="draft-title">
                    <strong>Medicine {index + 1}</strong>
                    <div className="draft-actions">
                      <div className="option-toggle" role="group" aria-label={`Review medicine ${index + 1}`}>
                        <button type="button" className={`toggle-button ${draft.reviewStatus === "yes" ? "toggle-button--active" : ""}`} onClick={() => updateDraft(index, "reviewStatus", "yes")}>Yes</button>
                        <button type="button" className={`toggle-button ${draft.reviewStatus === "no" ? "toggle-button--active" : ""}`} onClick={() => updateDraft(index, "reviewStatus", "no")}>No</button>
                      </div>
                      <Button type="button" variant="secondary" onClick={() => updateDraft(index, "isEditing", !draft.isEditing)}>{draft.isEditing ? "Hide" : "Edit"}</Button>
                      <Button type="button" variant="secondary" onClick={() => setDrafts(drafts.filter((_, itemIndex) => itemIndex !== index))}>Remove</Button>
                    </div>
                  </div>
                  {draft.reviewStatus === "no" && !draft.isEditing && <p className="review-hint">This medicine needs review before it can be added.</p>}
                  {draft.isEditing && (
                    <div className="data-form">
                      <FormField id={`draft-name-${index}`} label="Name" value={draft.name} onChange={(event) => updateDraft(index, "name", event.target.value)} maxLength={200} required />
                      <label className="form-field"><span>Category</span><select value={draft.category} onChange={(event) => updateDraft(index, "category", event.target.value)}><option value="medication">Medication</option><option value="vitamin">Vitamin</option><option value="supplement">Supplement</option><option value="other">Other</option></select></label>
                      <FormField id={`draft-dosage-${index}`} label="Dosage" value={draft.dosage} onChange={(event) => updateDraft(index, "dosage", event.target.value)} maxLength={200} required />
                      <label className="form-field"><span>Form (optional)</span><select value={draft.form} onChange={(event) => updateDraft(index, "form", event.target.value)}><option value="">Not specified</option>{["tablet", "capsule", "liquid", "injection", "powder", "other"].map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                      <FormField id={`draft-frequency-${index}`} label="Frequency" value={draft.frequency} onChange={(event) => updateDraft(index, "frequency", event.target.value)} maxLength={200} required />
                      <FormField id={`draft-start-${index}`} type="date" label="Start date" value={draft.startDate} onChange={(event) => updateDraft(index, "startDate", event.target.value)} required />
                      <FormField id={`draft-end-${index}`} type="date" label="End date (optional)" value={draft.endDate} onChange={(event) => updateDraft(index, "endDate", event.target.value)} />
                      <label className="form-field form-field--wide"><span>Instructions (optional)</span><textarea rows="2" maxLength={2000} value={draft.instructions} onChange={(event) => updateDraft(index, "instructions", event.target.value)} /></label>
                    </div>
                  )}
                </section>
              ))}
              <div className="form-actions"><Button type="submit" disabled={confirming || !drafts.length || drafts.some((draft) => !["yes", "no"].includes(draft.reviewStatus)) || !drafts.some((draft) => draft.reviewStatus === "yes")}>{confirming ? "Confirming…" : "Confirm and add medicines"}</Button></div>
            </form>
          )}
          {selected.status === "confirmed" && <Feedback>These medicine details were confirmed and added to your medicine list.</Feedback>}
          {selected.status === "failed" && <Feedback>Review the image manually. This upload could not be processed.</Feedback>}
        </Card>
      )}
    </>
  );
}
