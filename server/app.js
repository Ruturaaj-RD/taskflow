import path from "node:path";
import { fileURLToPath } from "node:url";

import "dotenv/config";

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";

import { pool } from "./db.js";
import authRouter from "./routes/auth.js";
import tasksRouter from "./routes/tasks.js";

const app = express();

const currentDirectory = path.dirname(
  fileURLToPath(import.meta.url)
);

const clientDistPath = path.resolve(
  currentDirectory,
  "../client/dist"
);

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is missing from server/.env");
}

const allowedOrigin =
  process.env.CLIENT_ORIGIN || "http://localhost:5173";

// Configure CORS and request parsing.
app.use(
  cors({
    origin: allowedOrigin,
    credentials: true,
  })
);

app.use(cookieParser());
app.use(express.json({ limit: "10kb" }));

// Require our trusted frontend origin for state-changing requests.
const stateChangingMethods = new Set([
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);

app.use((req, res, next) => {
  if (!stateChangingMethods.has(req.method)) {
    return next();
  }

  if (req.get("origin") !== allowedOrigin) {
    return res.status(403).json({
      message: "Request origin is not allowed.",
    });
  }

  next();
});

// Limit repeated authentication requests.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    message: "Too many login attempts. Try again in 15 minutes.",
  },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    message: "Too many registration attempts. Try again in an hour.",
  },
});

// Health-check endpoint.
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "TaskFlow API is running",
  });
});

// Database connectivity check.
app.get("/api/db-check", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT current_database() AS database, NOW() AS server_time"
    );

    res.json({
      status: "ok",
      message: "PostgreSQL connection successful",
      ...result.rows[0],
    });
  } catch (error) {
    console.error("Database check failed:", error);

    res.status(500).json({
      message: "Database connection failed.",
    });
  }
});

// Register authentication routes.
app.use("/api/auth/login", loginLimiter);
app.use("/api/auth/register", registerLimiter);
app.use("/api/auth", authRouter);

// Register protected task routes.
app.use("/api/tasks", tasksRouter);

// Return JSON for unknown API routes.
app.use("/api", (req, res) => {
  res.status(404).json({
    message: "API route not found.",
  });
});

// Serve React only in production.
if (process.env.NODE_ENV === "production") {
  app.use(express.static(clientDistPath));

  // Support direct visits to React application routes.
  app.use((req, res, next) => {
    if (req.method !== "GET") {
      return next();
    }

    res.sendFile(
      path.join(clientDistPath, "index.html"),
      (error) => {
        if (error) next(error);
      }
    );
  });
}

export default app;
