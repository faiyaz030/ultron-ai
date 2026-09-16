import type { RequestHandler } from "express";

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;

export const aiRateLimit: RequestHandler = (req, res, next) => {
  const now = Date.now();

  const forwardedFor = req.headers["x-forwarded-for"];
  const key =
    req.ip ||
    (typeof forwardedFor === "string"
      ? forwardedFor.split(",")[0].trim()
      : "unknown");

  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, {
      count: 1,
      resetAt: now + WINDOW_MS,
    });

    res.setHeader("RateLimit-Limit", MAX_REQUESTS);
    res.setHeader("RateLimit-Remaining", MAX_REQUESTS - 1);
    res.setHeader("RateLimit-Reset", Math.ceil(WINDOW_MS / 1000));

    next();
    return;
  }

  current.count += 1;

  const remaining = Math.max(
    0,
    MAX_REQUESTS - current.count
  );

  res.setHeader("RateLimit-Limit", MAX_REQUESTS);
  res.setHeader("RateLimit-Remaining", remaining);
  res.setHeader(
    "RateLimit-Reset",
    Math.ceil((current.resetAt - now) / 1000)
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
};  current.count += 1;

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
