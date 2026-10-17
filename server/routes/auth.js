
import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

const COOKIE_NAME = "taskflow_token";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  };
}

function setAuthCookie(res, userId) {
  const token = jwt.sign(
    { sub: String(userId) },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.cookie(COOKIE_NAME, token, cookieOptions());
}

function clearAuthCookie(res) {
  const { maxAge, ...options } = cookieOptions();
  res.clearCookie(COOKIE_NAME, options);
}

// REGISTER
router.post("/register", async (req, res) => {
  const { full_name, email, password } = req.body ?? {};

  if (
    typeof full_name !== "string" ||
    full_name.trim().length === 0 ||
    full_name.trim().length > 100
  ) {
    return res.status(400).json({
      message: "Name must contain between 1 and 100 characters.",
    });
  }

  if (
    typeof email !== "string" ||
    email.trim().length > 255 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  ) {
    return res.status(400).json({
      message: "Enter a valid email address of at most 255 characters.",
    });
  }

  if (
    typeof password !== "string" ||
    password.length < 8 ||
    Buffer.byteLength(password, "utf8") > 72
  ) {
    return res.status(400).json({
      message: "Password must be at least 8 characters and no more than 72 bytes.",
    });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (full_name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, full_name, email, created_at`,
      [full_name.trim(), email.trim().toLowerCase(), passwordHash]
    );

    const user = result.rows[0];

    setAuthCookie(res, user.id);

    return res.status(201).json({ user });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        message: "An account with this email already exists.",
      });
    }

    console.error("Registration failed:", error);

    return res.status(500).json({
      message: "Unable to register.",
    });
  }
});

// LOGIN
router.post("/login", async (req, res) => {
  const { email, password } = req.body ?? {};

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    !email.trim() ||
    !password
  ) {
    return res.status(400).json({
      message: "Email and password are required.",
    });
  }

  try {
    const result = await pool.query(
      `SELECT id, full_name, email, password_hash, created_at
       FROM users
       WHERE email = $1`,
      [email.trim().toLowerCase()]
    );

    const userRecord = result.rows[0];

    const passwordMatches = userRecord
      ? await bcrypt.compare(password, userRecord.password_hash)
      : false;

    if (!userRecord || !passwordMatches) {
      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }

    const { password_hash, ...user } = userRecord;

    setAuthCookie(res, user.id);

    return res.json({ user });
  } catch (error) {
    console.error("Login failed:", error);

    return res.status(500).json({
      message: "Unable to log in.",
    });
  }
});

// CURRENT USER
router.get("/me", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, full_name, email, created_at
       FROM users
       WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      clearAuthCookie(res);

      return res.status(401).json({
        message: "Account not found.",
      });
    }

    return res.json({ user: result.rows[0] });
  } catch (error) {
    console.error("Fetching current user failed:", error);

    return res.status(500).json({
      message: "Unable to retrieve account.",
    });
  }
});

// LOGOUT
router.post("/logout", (req, res) => {
  clearAuthCookie(res);

  return res.json({
    message: "Logged out successfully.",
  });
});

export default router;
