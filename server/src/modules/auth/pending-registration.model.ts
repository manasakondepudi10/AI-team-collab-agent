import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const pendingRegistrationSchema = new Schema(
  {
    state: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    githubUsername: { type: String, required: true, lowercase: true, trim: true },
    emailOtpHash: { type: String, required: true },
    emailOtpExpiresAt: { type: Date, required: true },
    emailVerifiedAt: Date,
    skills: [
      {
        name: { type: String, required: true, trim: true },
        level: { type: Number, min: 1, max: 5, default: 3 }
      }
    ],
    expiresAt: { type: Date, required: true, index: { expires: 0 } }
  },
  { timestamps: true }
);

export type PendingRegistration = InferSchemaType<typeof pendingRegistrationSchema>;
export const PendingRegistrationModel = mongoose.model('PendingRegistration', pendingRegistrationSchema);
