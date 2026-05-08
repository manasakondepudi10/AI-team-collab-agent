import type { Types } from 'mongoose';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: 'student' | 'mentor' | 'admin';
        teamIds: Types.ObjectId[];
      };
    }
  }
}

export {};
