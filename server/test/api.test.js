
import "dotenv/config";

import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";

import app from "../app.js";
import { pool } from "../db.js";

// Never run this suite against the development database.
if (process.env.DB_NAME !== "taskflow_test_db") {
  throw new Error(
    "Refusing to run tests. Set DB_NAME=taskflow_test_db first."
  );
}

const ORIGIN =
  process.env.CLIENT_ORIGIN || "http://localhost:5173";

const suffix = randomUUID();
const ownerEmail = `owner-${suffix}@example.com`;
const otherEmail = `other-${suffix}@example.com`;
const password = "TaskFlowTest123!";

// Clean up only the uniquely named test accounts.
// ON DELETE CASCADE also removes their tasks.
after(async () => {
  try {
    await pool.query(
      "DELETE FROM users WHERE email = ANY($1::varchar[])",
      [[ownerEmail, otherEmail]]
    );
  } finally {
    await pool.end();
  }
});

test("TaskFlow API integration", async (t) => {
  const owner = request.agent(app);
  const otherUser = request.agent(app);
  const loginAgent = request.agent(app);

  let taskId;

  await t.test(
    "rejects task requests without authentication",
    async () => {
      const response = await request(app).get("/api/tasks");

      assert.equal(response.status, 401);
    }
  );

  await t.test(
    "rejects missing or untrusted Origin headers",
    async () => {
      const missingOrigin = await request(app)
        .post("/api/auth/logout");

      assert.equal(missingOrigin.status, 403);

      const untrustedOrigin = await request(app)
        .post("/api/auth/logout")
        .set("Origin", "https://evil.example");

      assert.equal(untrustedOrigin.status, 403);
    }
  );

  await t.test("registers an account securely", async () => {
    const response = await owner
      .post("/api/auth/register")
      .set("Origin", ORIGIN)
      .send({
        full_name: "TaskFlow Test Owner",
        email: ownerEmail,
        password,
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.user.email, ownerEmail);
    assert.equal(
      Object.hasOwn(response.body.user, "password_hash"),
      false
    );

    const cookies = response.headers["set-cookie"] ?? [];

    assert.ok(
      cookies.some(
        (cookie) =>
          cookie.startsWith("taskflow_token=") &&
          /httponly/i.test(cookie)
      ),
      "Expected an HTTP-only authentication cookie"
    );
  });

  await t.test("rejects duplicate email addresses", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .set("Origin", ORIGIN)
      .send({
        full_name: "Duplicate Account",
        email: ownerEmail,
        password,
      });

    assert.equal(response.status, 409);
  });

  await t.test("recognizes the authenticated user", async () => {
    const response = await owner.get("/api/auth/me");

    assert.equal(response.status, 200);
    assert.equal(response.body.user.email, ownerEmail);
  });

  await t.test(
    "rejects descriptions longer than 2000 characters",
    async () => {
      const response = await owner
        .post("/api/tasks")
        .set("Origin", ORIGIN)
        .send({
          title: "Validation test",
          description: "x".repeat(2001),
          priority: "medium",
        });

      assert.equal(response.status, 400);
    }
  );

  await t.test("creates a task", async () => {
    const response = await owner
      .post("/api/tasks")
      .set("Origin", ORIGIN)
      .send({
        title: "Automated testing task",
        description: "Created by Supertest",
        due_date: null,
        priority: "medium",
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.title, "Automated testing task");
    assert.equal(response.body.status, "pending");

    taskId = response.body.id;
    assert.ok(Number.isInteger(taskId));
  });

  await t.test("retrieves the owner's tasks", async () => {
    const response = await owner.get("/api/tasks");

    assert.equal(response.status, 200);
    assert.ok(
      response.body.tasks.some((task) => task.id === taskId)
    );
  });

  await t.test(
    "prevents another user from accessing the task",
    async () => {
      const registration = await otherUser
        .post("/api/auth/register")
        .set("Origin", ORIGIN)
        .send({
          full_name: "TaskFlow Other User",
          email: otherEmail,
          password,
        });

      assert.equal(registration.status, 201);

      const list = await otherUser.get("/api/tasks");

      assert.equal(list.status, 200);
      assert.equal(list.body.tasks.length, 0);

      const update = await otherUser
        .put(`/api/tasks/${taskId}`)
        .set("Origin", ORIGIN)
        .send({
          title: "Unauthorized update",
          description: null,
          due_date: null,
          priority: "medium",
          status: "pending",
        });

      assert.equal(update.status, 404);

      const deletion = await otherUser
        .delete(`/api/tasks/${taskId}`)
        .set("Origin", ORIGIN);

      assert.equal(deletion.status, 404);
    }
  );

  await t.test("updates the owner's task", async () => {
    const response = await owner
      .put(`/api/tasks/${taskId}`)
      .set("Origin", ORIGIN)
      .send({
        title: "Updated automated task",
        description: "Update test passed",
        due_date: null,
        priority: "high",
        status: "completed",
      });

    assert.equal(response.status, 200);
    assert.equal(response.body.title, "Updated automated task");
    assert.equal(response.body.priority, "high");
    assert.equal(response.body.status, "completed");
  });

  await t.test("logs in with valid credentials", async () => {
    const response = await loginAgent
      .post("/api/auth/login")
      .set("Origin", ORIGIN)
      .send({
        email: ownerEmail,
        password,
      });

    assert.equal(response.status, 200);
    assert.equal(response.body.user.email, ownerEmail);

    const me = await loginAgent.get("/api/auth/me");

    assert.equal(me.status, 200);
    assert.equal(me.body.user.email, ownerEmail);
  });

  await t.test("deletes the owner's task", async () => {
    const response = await owner
      .delete(`/api/tasks/${taskId}`)
      .set("Origin", ORIGIN);

    assert.equal(response.status, 200);

    const list = await owner.get("/api/tasks");

    assert.equal(list.status, 200);
    assert.equal(
      list.body.tasks.some((task) => task.id === taskId),
      false
    );
  });

  await t.test("logout removes access to protected routes", async () => {
    const logout = await owner
      .post("/api/auth/logout")
      .set("Origin", ORIGIN);

    assert.equal(logout.status, 200);

    const tasks = await owner.get("/api/tasks");

    assert.equal(tasks.status, 401);
  });
});
