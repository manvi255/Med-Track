import { z } from "zod";

const dateSchema = z.union([
  z.iso.date(),
  z.iso.datetime({ offset: true })
]).transform((value) => new Date(value));

const medicineFields = {
  name: z.string().trim().min(1, "Name is required").max(200, "Name is too long"),
  category: z.enum(["medication", "vitamin", "supplement", "other"]),
  dosage: z.string().trim().min(1, "Dosage is required").max(200, "Dosage is too long"),
  form: z.enum(["tablet", "capsule", "liquid", "injection", "powder", "other"]).optional(),
  frequency: z.string().trim().min(1, "Frequency is required").max(200, "Frequency is too long"),
  instructions: z.string().trim().max(2000, "Instructions are too long").optional(),
  startDate: dateSchema,
  endDate: dateSchema.optional(),
  isActive: z.boolean()
};

function validateDateOrder(medicine) {
  return !medicine.startDate || !medicine.endDate
    || medicine.endDate >= medicine.startDate;
}

export const createMedicineSchema = z.object({
  ...medicineFields,
  isActive: medicineFields.isActive.optional()
}).strict().refine(validateDateOrder, {
  message: "endDate must not precede startDate",
  path: ["endDate"]
});

export const updateMedicineSchema = z.object(medicineFields)
  .partial()
  .strict()
  .refine((medicine) => Object.keys(medicine).length > 0, {
    message: "At least one medicine field must be provided"
  })
  .refine(validateDateOrder, {
    message: "endDate must not precede startDate",
    path: ["endDate"]
  });
