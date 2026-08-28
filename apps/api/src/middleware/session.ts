import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";

const SESSION_COOKIE = "session_id";

export function sessionMiddleware(req: Request, res: Response, next: NextFunction) {
  let sessionId = req.cookies?.[SESSION_COOKIE] as string | undefined;

  if (!sessionId) {
    sessionId = randomUUID();
    const isProduction = process.env.NODE_ENV === "production";
    res.cookie(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 365 * 24 * 60 * 60 * 1000,
      path: "/",
    });
  }

  req.sessionId = sessionId;
  next();
}

declare global {
  namespace Express {
    interface Request {
      sessionId: string;
    }
  }
}
