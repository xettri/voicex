import rateLimit from 'express-rate-limit';

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 10000000,
  message: { error: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
});
