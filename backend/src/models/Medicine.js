import mongoose from "mongoose";

const medicineSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    enum: ["medication", "vitamin", "supplement", "other"],
    required: true
  },
  dosage: {
    type: String,
    required: true,
    trim: true
  },
  form: {
    type: String,
    enum: ["tablet", "capsule", "liquid", "injection", "powder", "other"]
  },
  frequency: {
    type: String,
    required: true,
    trim: true
  },
  instructions: {
    type: String,
    trim: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    validate: {
      validator(endDate) {
        return !endDate || !this.startDate || endDate >= this.startDate;
      },
      message: "endDate must not precede startDate"
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  sourcePrescription: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Prescription",
    select: false
  },
  sourceSuggestionIndex: {
    type: Number,
    min: 0,
    select: false
  }
}, {
  timestamps: true
});

medicineSchema.index({ user: 1, createdAt: -1 });
medicineSchema.index(
  { sourcePrescription: 1, sourceSuggestionIndex: 1 },
  {
    unique: true,
    partialFilterExpression: {
      sourcePrescription: { $exists: true },
      sourceSuggestionIndex: { $exists: true }
    }
  }
);

export const Medicine = mongoose.models.Medicine
  ?? mongoose.model("Medicine", medicineSchema);
