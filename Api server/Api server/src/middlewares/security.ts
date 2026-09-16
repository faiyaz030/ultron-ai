import cors from "cors";
import type { Express, RequestHandler } from "express";

function allowedOrigins(): string[] {
  return (process.env["CORS_ORIGIN"] ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  next();
};

export function applySecurityMiddleware(app: Express): void {
  app.disable("x-powered-by");
  app.use(securityHeaders);

  const origins = allowedOrigins();

  app.use(
    cors({
      origin: origins.length > 0 ? origins : false,
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
      maxAge: 600,
    }),
  );
}
