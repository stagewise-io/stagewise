import type { ErrorRequestHandler } from 'express';

export const errorHandler: ErrorRequestHandler = (_err, _req, res, _next) => {
  res.status(500).json({
    success: false,
    error: 'Internal server error',
  });
};
