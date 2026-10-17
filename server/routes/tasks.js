import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

const priorities = ["low", "medium", "high"];
const statuses = ["pending", "in_progress", "completed"];

function isValidDate(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

router.use(requireAuth);

// READ: Get tasks owned by the development test user.
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, title, description, due_date,
              priority, status, created_at, updated_at
       FROM tasks
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json({ tasks: result.rows });
  } catch (error) {
    console.error("Failed to retrieve tasks:", error);

    res.status(500).json({
      message: "Unable to retrieve tasks.",
    });
  }
});

// CREATE: Add a task for the development test user.
router.post("/", async (req, res) => {
  const {
    title,
    description = null,
    due_date = null,
    priority = "medium",
  } = req.body ?? {};

  if (
    typeof title !== "string" ||
    title.trim().length === 0 ||
    title.trim().length > 120
  ) {
    return res.status(400).json({
      message: "Title must contain between 1 and 120 characters.",
    });
  }

  if (
    description !== null &&
    (
      typeof description !== "string" ||
      description.length > 2000
    )
  ) {
    return res.status(400).json({
      message: "Description must be text up to 2000 characters, or null.",
    });
  }

  if (due_date !== null && !isValidDate(due_date)) {
    return res.status(400).json({
      message: "Due date must be a valid date in YYYY-MM-DD format.",
    });
  }

  if (!priorities.includes(priority)) {
    return res.status(400).json({
      message: "Priority must be low, medium, or high.",
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO tasks
         (user_id, title, description, due_date, priority)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, title, description, due_date,
                 priority, status, created_at, updated_at`,
      [
        req.user.id,
        title.trim(),
        description,
        due_date,
        priority,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Failed to create task:", error);

    res.status(500).json({
      message: "Unable to create task.",
    });
  }
});


router.put("/:id", async (req, res) => {
  const taskId = Number(req.params.id);

  if (!Number.isSafeInteger(taskId) || taskId < 1) {
    return res.status(400).json({
      message: "Invalid task ID.",
    });
  }

  const {
    title,
    description,
    due_date,
    priority,
    status,
  } = req.body ?? {};

  // PUT requires all editable fields.
  if (
    typeof title !== "string" ||
    title.trim().length === 0 ||
    title.trim().length > 120
  ) {
    return res.status(400).json({
      message: "Title must contain between 1 and 120 characters.",
    });
  }

  if (
    description !== null &&
    (
      typeof description !== "string" ||
      description.length > 2000
    )
  ) {
    return res.status(400).json({
      message: "Description must be text up to 2000 characters, or null.",
    });
  }

  if (due_date !== null && !isValidDate(due_date)) {
    return res.status(400).json({
      message: "Due date must be a valid YYYY-MM-DD date or null.",
    });
  }

  if (!priorities.includes(priority)) {
    return res.status(400).json({
      message: "Priority must be low, medium, or high.",
    });
  }

  if (!statuses.includes(status)) {
    return res.status(400).json({
      message: "Invalid task status.",
    });
  }

  try {
    const result = await pool.query(
      `UPDATE tasks
       SET title = $1,
           description = $2,
           due_date = $3,
           priority = $4,
           status = $5,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6 AND user_id = $7
       RETURNING id, title, description, due_date,
                 priority, status, created_at, updated_at`,
      [
        title.trim(),
        description,
        due_date,
        priority,
        status,
        taskId,
        req.user.id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Task not found.",
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Failed to update task:", error);

    res.status(500).json({
      message: "Unable to update task.",
    });
  }
});


router.delete("/:id", async (req, res) => {
  const taskId = Number(req.params.id);

  if (!Number.isSafeInteger(taskId) || taskId < 1) {
    return res.status(400).json({
      message: "Invalid task ID.",
    });
  }

  try {
    const result = await pool.query(
      `DELETE FROM tasks
       WHERE id = $1 AND user_id = $2
       RETURNING id, title`,
      [taskId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Task not found.",
      });
    }

    res.json({
      message: "Task deleted successfully.",
      task: result.rows[0],
    });
  } catch (error) {
    console.error("Failed to delete task:", error);

    res.status(500).json({
      message: "Unable to delete task.",
    });
  }
});


export default router;
