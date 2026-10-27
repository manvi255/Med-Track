import { useCallback, useState } from "react";
import { createMedicine, deleteMedicine, listMedicines, updateMedicine } from "../api/resources.js";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { Feedback } from "../components/Feedback.jsx";
import { FormField } from "../components/FormField.jsx";
import { LoadState } from "../components/LoadState.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { useRemoteData } from "../hooks/useRemoteData.js";

const categories = ["medication", "vitamin", "supplement", "other"];
const forms = ["tablet", "capsule", "liquid", "injection", "powder", "other"];
const emptyForm = {
  name: "",
  category: "medication",
  dosage: "",
  form: "",
  frequency: "",
  instructions: "",
  startDate: new Date().toISOString().slice(0, 10),
  endDate: "",
  isActive: true
};

function medicineForm(medicine) {
  return {
    name: medicine.name,
    category: medicine.category,
    dosage: medicine.dosage,
    form: medicine.form ?? "",
    frequency: medicine.frequency,
    instructions: medicine.instructions ?? "",
    startDate: new Date(medicine.startDate).toISOString().slice(0, 10),
    endDate: medicine.endDate ? new Date(medicine.endDate).toISOString().slice(0, 10) : "",
    isActive: medicine.isActive
  };
}

function medicinePayload(form) {
  return {
    name: form.name,
    category: form.category,
    dosage: form.dosage,
    ...(form.form ? { form: form.form } : {}),
    frequency: form.frequency,
    ...(form.instructions ? { instructions: form.instructions } : {}),
    startDate: form.startDate,
    ...(form.endDate ? { endDate: form.endDate } : {}),
    isActive: form.isActive
  };
}

export function MedicinesPage() {
  const loadMedicines = useCallback(() => listMedicines(), []);
  const { data: medicines, isLoading, error, refresh } = useRemoteData(loadMedicines, [loadMedicines]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");

  function startCreate() {
    setForm({ ...emptyForm, startDate: new Date().toISOString().slice(0, 10) });
    setEditingId(null);
    setActionError("");
    setShowForm(true);
  }

  function startEdit(medicine) {
    setForm(medicineForm(medicine));
    setEditingId(medicine.id);
    setActionError("");
    setShowForm(true);
  }

  async function submitMedicine(event) {
    event.preventDefault();
    setActionError("");
    setNotice("");
    setIsSaving(true);
    try {
      if (editingId) {
        await updateMedicine(editingId, medicinePayload(form));
        setNotice("Medicine updated.");
      } else {
        await createMedicine(medicinePayload(form));
        setNotice("Medicine added.");
      }
      setShowForm(false);
      setEditingId(null);
      await refresh();
    } catch (requestError) {
      setActionError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function removeMedicine(medicine) {
    if (!window.confirm(`Delete ${medicine.name}? This cannot be undone.`)) return;
    setActionError("");
    setNotice("");
    try {
      await deleteMedicine(medicine.id);
      setNotice("Medicine deleted.");
      await refresh();
    } catch (requestError) {
      setActionError(requestError.message);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="YOUR MEDICINES"
        title="Medicine list"
        description="Manage the medicine details you entered. MediTrack stores your information and does not recommend doses."
      >
        <Button onClick={startCreate}>Add medicine</Button>
      </PageHeader>
      {notice && <Feedback>{notice}</Feedback>}
      {actionError && <Feedback variant="error">{actionError}</Feedback>}

      {showForm && (
        <Card className="editor-card">
          <div className="editor-heading">
            <div>
              <p className="eyebrow">{editingId ? "UPDATE DETAILS" : "NEW ENTRY"}</p>
              <h2>{editingId ? "Edit medicine" : "Add a medicine"}</h2>
            </div>
            <Button variant="secondary" onClick={() => setShowForm(false)}>Close</Button>
          </div>
          <form className="data-form" onSubmit={submitMedicine}>
            <FormField id="name" label="Medicine name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required maxLength={200} />
            <label className="form-field">
              <span>Category</span>
              <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                {categories.map((category) => <option key={category} value={category}>{category.replace("_", " ")}</option>)}
              </select>
            </label>
            <FormField id="dosage" label="Dosage" placeholder="e.g. 500 mg" value={form.dosage} onChange={(event) => setForm({ ...form, dosage: event.target.value })} required maxLength={200} />
            <label className="form-field">
              <span>Form (optional)</span>
              <select value={form.form} onChange={(event) => setForm({ ...form, form: event.target.value })}>
                <option value="">Not specified</option>
                {forms.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <FormField id="frequency" label="Frequency" placeholder="e.g. As directed by my care team" value={form.frequency} onChange={(event) => setForm({ ...form, frequency: event.target.value })} required maxLength={200} />
            <FormField id="startDate" type="date" label="Start date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} required />
            <FormField id="endDate" type="date" label="End date (optional)" value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} />
            <label className="form-field form-field--wide">
              <span>Instructions (optional)</span>
              <textarea rows="3" maxLength={2000} value={form.instructions} onChange={(event) => setForm({ ...form, instructions: event.target.value })} />
            </label>
            {editingId && (
              <label className="check-field form-field--wide">
                <input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />
                <span>Medicine is active</span>
              </label>
            )}
            {actionError && <Feedback variant="error">{actionError}</Feedback>}
            <div className="form-actions form-field--wide">
              <Button type="submit" disabled={isSaving}>{isSaving ? "Saving…" : editingId ? "Save changes" : "Add medicine"}</Button>
              <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      <LoadState isLoading={isLoading} error={error} onRetry={refresh}>
        {!medicines?.length ? (
          <Card className="empty-state">
            <span className="empty-icon" aria-hidden="true">M</span>
            <h2>No medicines yet</h2>
            <p>Add the details you want to keep organized. Your list will stay empty until you add an entry.</p>
            <Button onClick={startCreate}>Add your first medicine</Button>
          </Card>
        ) : (
          <div className="entity-list">
            {medicines.map((medicine) => (
              <Card className="entity-card medicine-card" key={medicine.id}>
                <div className="entity-mark" aria-hidden="true">M</div>
                <div className="entity-main">
                  <div className="entity-title-row">
                    <h2>{medicine.name}</h2>
                    <span className={`status-pill ${medicine.isActive ? "status-pill--good" : "status-pill--muted"}`}>
                      {medicine.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <p>{medicine.dosage}{medicine.form ? ` · ${medicine.form}` : ""} · {medicine.frequency}</p>
                  <span className="entity-meta">{medicine.category} · from {new Date(medicine.startDate).toLocaleDateString()}</span>
                  {medicine.instructions && <span className="entity-meta">{medicine.instructions}</span>}
                </div>
                <div className="entity-actions">
                  <Button variant="secondary" onClick={() => startEdit(medicine)}>Edit</Button>
                  <Button variant="danger" onClick={() => removeMedicine(medicine)}>Delete</Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </LoadState>
    </>
  );
}
