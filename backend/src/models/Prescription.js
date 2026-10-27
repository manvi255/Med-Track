import mongoose from "mongoose";

const medicineSuggestionSchema = new mongoose.Schema({
  name: { type: String, trim: true, maxlength: 200 },
  dosage: { type: String, trim: true, maxlength: 200 },
  frequency: { type: String, trim: true, maxlength: 200 },
  duration: { type: String, trim: true, maxlength: 200 },
  instructions: { type: String, trim: true, maxlength: 2000 },
  reviewNotes: { type: String, trim: true, maxlength: 1000 }
}, { _id: false });

const prescriptionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  originalFilename: {
    type: String,
    required: true,
    trim: true,
    maxlength: 255
  },
  mimeType: {
    type: String,
    required: true,
    enum: ["image/jpeg", "image/png", "image/webp"]
  },
  storageKey: {
    type: String,
    required: true,
    select: false,
    match: [
      /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}\.(jpg|png|webp)$/i,
      "storageKey must be a server-generated image key"
    ]
  },
  status: {
    type: String,
    enum: ["uploaded", "processing", "review_required", "confirmed", "failed"],
    default: "uploaded",
    required: true
  },
  extractedText: {
    type: String,
    default: "",
    maxlength: 100000
  },
  medicines: {
    type: [medicineSuggestionSchema],
    default: []
  },
  errorMessage: {
    type: String,
    maxlength: 500
  },
  confirmedMedicineIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Medicine",
    select: false
  }],
  confirmationHash: {
    type: String,
    select: false
  }
}, {
  timestamps: true
});

prescriptionSchema.index({ user: 1, createdAt: -1 });

export const Prescription = mongoose.models.Prescription
  ?? mongoose.model("Prescription", prescriptionSchema);
