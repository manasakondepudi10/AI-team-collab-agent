import type { NextFunction, Request, Response } from 'express';
import type { AnyZodObject } from 'zod';
import { AppError } from './errors.js';

export function validate(schema: AnyZodObject) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse({
      body: req.body,
      params: req.params,
      query: req.query
    });

    if (!result.success) {
      return next(new AppError('Validation failed', 422, result.error.flatten()));
    }

    req.body = result.data.body ?? req.body;
    req.params = result.data.params ?? req.params;
    req.query = result.data.query ?? req.query;
    return next();
  };
}
