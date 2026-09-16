import type { RequestHandler } from "express";

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;

function clientKey(req: {
  ip?: string;
  headers: Record<string, unknown>;
}): string {
  return req.ip ?? String(req.headers["x-forwarded-for"] ?? "unknown");
}

export const aiRateLimit: RequestHandler = (req, res, next) => {
  const now = Date.now();
  const key = clientKey(req);
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, {
      count: 1,
      resetAt: now + WINDOW_MS,
    });

    res.setHeader("RateLimit-Limit", MAX_REQUESTS);
    res.setHeader("RateLimit-Remaining", MAX_REQUESTS - 1);

    return next();
  }

  current.count += 1;

  const remaining = Math.max(
    0,
    MAX_REQUESTS - current.count,
  );

  res.setHeader("RateLimit-Limit", MAX_REQUESTS);
  res.setHeader("RateLimit-Remaining", remaining);
  res.setHeader(
    "RateLimit-Reset",
    Math.ceil((current.resetAt - now) / 1000),
  );

  if (current.count > MAX_REQUESTS) {
    res.status(429).json({
      error: {
        code: "rate_limited",
        message: "Too many requests. Try again later.",
      },
    });

    return;
  }

  next();
};
