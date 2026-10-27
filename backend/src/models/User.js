import bcrypt from "bcryptjs";
import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    validate: {
      validator: (name) => name.length > 0,
      message: "Name is required"
    }
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    unique: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Email must be valid"]
  },
  password: {
    type: String,
    required: true,
    minlength: 8,
    select: false
  }
}, {
  timestamps: true,
  toJSON: {
    transform(_document, returned) {
      delete returned.password;
      delete returned.__v;
      return returned;
    }
  },
  toObject: {
    transform(_document, returned) {
      delete returned.password;
      delete returned.__v;
      return returned;
    }
  }
});

userSchema.pre("save", async function hashPassword() {
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 12);
  }
});

export const User = mongoose.models.User ?? mongoose.model("User", userSchema);
