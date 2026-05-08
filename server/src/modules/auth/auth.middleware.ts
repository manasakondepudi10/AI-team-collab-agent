import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/errors.js';
import { TeamModel } from '../teams/team.model.js';

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new AppError('Authentication required', 401);

    const payload = jwt.verify(header.slice(7), env.JWT_SECRET) as { sub: string; role: 'student' | 'mentor' | 'admin' };
    const teams = await TeamModel.find({ 'members.user': payload.sub }).select('_id');
    req.user = { id: payload.sub, role: payload.role, teamIds: teams.map((team) => team._id) };
    next();
  } catch (error) {
    next(error instanceof AppError ? error : new AppError('Invalid or expired token', 401));
  }
}
