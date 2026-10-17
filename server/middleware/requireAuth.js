import jwt from "jsonwebtoken";
import { pool } from "../db.js";

export async function requireAuth(req, res, next) {
  const token = req.cookies?.taskflow_token;

  if (!token) {
    return res.status(401).json({
      message: "Please log in to continue.",
    });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const userId = Number(payload.sub);

    if (!Number.isSafeInteger(userId) || userId < 1) {
      return res.status(401).json({
        message: "Invalid authentication token.",
      });
    }

    // Confirm that this account still exists.
    const result = await pool.query(
      "SELECT id FROM users WHERE id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        message: "Account not found. Please log in again.",
      });
    }

    req.user = { id: userId };

    return next();
  } catch (error) {
    if (
      error.name === "JsonWebTokenError" ||
      error.name === "TokenExpiredError" ||
      error.name === "NotBeforeError"
    ) {
      return res.status(401).json({
        message: "Your session is invalid or expired. Please log in again.",
      });
    }

    console.error("Authentication check failed:", error);

    return res.status(500).json({
      message: "Unable to verify authentication.",
    });
  }
}
