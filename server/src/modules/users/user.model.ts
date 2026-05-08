import bcrypt from 'bcryptjs';
import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const skillSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    level: { type: Number, min: 1, max: 5, default: 3 }
  },
  { _id: false }
);

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    avatarUrl: String,
    role: { type: String, enum: ['student', 'mentor', 'admin'], default: 'student' },
    skills: { type: [skillSchema], default: [] },
    github: {
      username: { type: String, lowercase: true, trim: true },
      email: { type: String, lowercase: true, trim: true },
      emailVerifiedAt: Date,
      accessToken: { type: String, select: false },
      connectedAt: Date
    }
  },
  { timestamps: true }
);

userSchema.index({ 'github.username': 1 }, { unique: true, sparse: true });

userSchema.methods.comparePassword = function comparePassword(password: string) {
  return bcrypt.compare(password, this.passwordHash);
};

export type User = InferSchemaType<typeof userSchema> & {
  comparePassword(password: string): Promise<boolean>;
};

export const UserModel = mongoose.model('User', userSchema);
