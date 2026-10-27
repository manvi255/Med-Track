import { z } from "zod";
import { createMedicineSchema } from "./medicine.validators.js";

export const confirmPrescriptionSchema = z.object({
  medicines: z.array(createMedicineSchema).min(1).max(50)
}).strict();
