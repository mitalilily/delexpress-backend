import { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../utils/jwt";

export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const auth = req.headers.authorization;

  if (!auth?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing token" });
  }

  try {
    const token = auth.split(" ")[1];
    const decoded = await verifyAccessToken(token); // ✅ await here

    if (!decoded || typeof decoded !== 'object') {
      return res.status(401).json({ error: "Invalid token payload" });
    }

    // Attach decoded token to request
    (req as any).user = decoded;
    // Also expose userId for controllers that expect req.userId (for consistency with requireApiKey)
    (req as any).userId = (decoded as any).sub;

    next();
  } catch (err: any) {
    // Don't log TokenExpiredError as error - it's expected behavior
    if (err?.name === 'TokenExpiredError') {
      // Return 401 so frontend can attempt refresh
      return res.status(401).json({ 
        error: "Token expired",
        code: "TOKEN_EXPIRED" 
      });
    }
    // Log other errors
    if (err?.name !== 'TokenExpiredError') {
      console.error("Token verification error:", err?.name || err?.message || err);
    }
    return res.status(401).json({ 
      error: "Token invalid or expired",
      code: err?.name || "TOKEN_INVALID"
    });
  }
};
