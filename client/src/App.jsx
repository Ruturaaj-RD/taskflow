
import { useEffect, useState } from "react";
import { apiRequest } from "./lib/api";

const EMPTY_AUTH_FORM = {
  full_name: "",
  email: "",
  password: "",
};

const EMPTY_TASK_FORM = {
  title: "",
  description: "",
  due_date: "",
  priority: "medium",
  status: "pending",
};

const STATUS_LABELS = {
  pending: "Pending",
  in_progress: "In progress",
  completed: "Completed",
};

function formatDate(value) {
  if (!value) return "No due date";

  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function App() {
  // Authentication state
  const [mode, setMode] = useState("login");
  const [authForm, setAuthForm] = useState(EMPTY_AUTH_FORM);
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [authError, setAuthError] = useState("");

  // Task state
  const [tasks, setTasks] = useState([]);
  const [taskForm, setTaskForm] = useState(EMPTY_TASK_FORM);
  const [editingTask, setEditingTask] = useState(null);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [taskError, setTaskError] = useState("");
  const [taskMessage, setTaskMessage] = useState("");

  // Search and filtering state
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Restore an existing login session after refresh.
  useEffect(() => {
    let active = true;

    apiRequest("/api/auth/me")
      .then(({ user: currentUser }) => {
        if (active) setUser(currentUser);
      })
      .catch((error) => {
        if (active && error.status !== 401) {
          setAuthError(error.message);
        }
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // Load the current user's tasks whenever the user changes.
  const userId = user?.id;

  useEffect(() => {
    if (!userId) {
      setTasks([]);
      setLoadingTasks(false);
      return;
    }

    let active = true;

    async function loadTasks() {
      setLoadingTasks(true);
      setTaskError("");

      try {
        const data = await apiRequest("/api/tasks");

        if (active) setTasks(data.tasks);
      } catch (error) {
        if (!active) return;

        if (error.status === 401) {
          setAuthError("Your session has expired. Please log in again.");
          setUser(null);
        } else {
          setTaskError(error.message);
        }
      } finally {
        if (active) setLoadingTasks(false);
      }
    }

    loadTasks();

    return () => {
      active = false;
    };
  }, [userId]);

  function handleAuthChange(event) {
    const { name, value } = event.target;

    setAuthForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setAuthError("");

    try {
      const endpoint =
        mode === "register" ? "register" : "login";

      const payload =
        mode === "register"
          ? authForm
          : {
              email: authForm.email,
              password: authForm.password,
            };

      const data = await apiRequest(`/api/auth/${endpoint}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setUser(data.user);
      setAuthForm(EMPTY_AUTH_FORM);
    } catch (error) {
      setAuthError(error.message);
    }
  }

  async function handleLogout() {
    setAuthError("");

    try {
      await apiRequest("/api/auth/logout", {
        method: "POST",
      });

      setUser(null);
      setAuthForm(EMPTY_AUTH_FORM);
      setTaskForm(EMPTY_TASK_FORM);
      setEditingTask(null);
      setSearch("");
      setStatusFilter("all");
      setMode("login");
    } catch (error) {
      setAuthError(error.message);
    }
  }

  function handleTaskChange(event) {
    const { name, value } = event.target;

    setTaskForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function resetTaskForm() {
    setTaskForm(EMPTY_TASK_FORM);
    setEditingTask(null);
    setTaskError("");
    setTaskMessage("");
  }

  async function handleTaskSubmit(event) {
    event.preventDefault();
    setTaskError("");
    setTaskMessage("");
    setSavingTask(true);

    const payload = {
      title: taskForm.title.trim(),
      description: taskForm.description.trim() || null,
      due_date: taskForm.due_date || null,
      priority: taskForm.priority,
      status: taskForm.status,
    };

    try {
      const isEditing = Boolean(editingTask);

      const savedTask = await apiRequest(
        isEditing
          ? `/api/tasks/${editingTask.id}`
          : "/api/tasks",
        {
          method: isEditing ? "PUT" : "POST",
          body: JSON.stringify(payload),
        }
      );

      setTasks((current) =>
        isEditing
          ? current.map((task) =>
              task.id === savedTask.id ? savedTask : task
            )
          : [savedTask, ...current]
      );

      resetTaskForm();

      setTaskMessage(
        isEditing
          ? "Task updated successfully."
          : "Task created successfully."
      );
    } catch (error) {
      setTaskError(error.message);
    } finally {
      setSavingTask(false);
    }
  }

  function handleEdit(task) {
    setEditingTask(task);

    setTaskForm({
      title: task.title,
      description: task.description ?? "",
      due_date: task.due_date
        ? String(task.due_date).slice(0, 10)
        : "",
      priority: task.priority,
      status: task.status,
    });

    setTaskError("");
    setTaskMessage("");
  }

  async function handleDelete(task) {
    const confirmed = window.confirm(
      `Delete "${task.title}" permanently?`
    );

    if (!confirmed) return;

    setTaskError("");
    setTaskMessage("");

    try {
      await apiRequest(`/api/tasks/${task.id}`, {
        method: "DELETE",
      });

      setTasks((current) =>
        current.filter((item) => item.id !== task.id)
      );

      if (editingTask?.id === task.id) {
        resetTaskForm();
      }

      setTaskMessage("Task deleted successfully.");
    } catch (error) {
      setTaskError(error.message);
    }
  }

  // Derived values: calculate these from tasks instead of
  // maintaining separate counters that could become inconsistent.
  const totalTasks = tasks.length;

  const completedTasks = tasks.filter(
    (task) => task.status === "completed"
  ).length;

  const pendingTasks = tasks.filter(
    (task) => task.status === "pending"
  ).length;

  const inProgressTasks = tasks.filter(
    (task) => task.status === "in_progress"
  ).length;

  const filteredTasks = tasks.filter((task) => {
    const query = search.trim().toLowerCase();

    const matchesSearch =
      task.title.toLowerCase().includes(query) ||
      (task.description ?? "").toLowerCase().includes(query);

    const matchesStatus =
      statusFilter === "all" ||
      task.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const inputClass =
    "mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20";

  const buttonClass =
    "rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

  if (checkingSession) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-300">
        Checking your session...
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-slate-950 text-white">
        <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-12 px-6 py-12 lg:grid-cols-2 lg:gap-20">
          <section className="space-y-8">
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-2xl bg-cyan-400 font-black text-slate-950">
                TF
              </div>
              <span className="text-xl font-bold">TaskFlow</span>
            </div>

            <div className="space-y-5">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
                Less chaos. More progress.
              </p>

              <h1 className="max-w-xl text-4xl font-bold leading-tight sm:text-6xl">
                Make room for{" "}
                <span className="text-cyan-400">
                  meaningful work.
                </span>
              </h1>

              <p className="max-w-lg leading-7 text-slate-400">
                Organize your tasks, focus on what matters, and
                make steady progress one task at a time.
              </p>
            </div>
          </section>

          <section className="mx-auto w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl sm:p-8">
            <h2 className="text-2xl font-bold">
              {mode === "register"
                ? "Create your account"
                : "Welcome back"}
            </h2>

            <p className="mt-2 text-sm text-slate-400">
              {mode === "register"
                ? "Start organizing your work."
                : "Log in to continue with your tasks."}
            </p>

            <form
              onSubmit={handleAuthSubmit}
              className="mt-7 space-y-5"
            >
              {mode === "register" && (
                <div>
                  <label htmlFor="full_name" className="text-sm">
                    Full name
                  </label>
                  <input
                    id="full_name"
                    name="full_name"
                    value={authForm.full_name}
                    onChange={handleAuthChange}
                    autoComplete="name"
                    required
                    maxLength={100}
                    className={inputClass}
                    placeholder="Your name"
                  />
                </div>
              )}

              <div>
                <label htmlFor="email" className="text-sm">
                  Email address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={authForm.email}
                  onChange={handleAuthChange}
                  autoComplete="email"
                  required
                  className={inputClass}
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="text-sm">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  value={authForm.password}
                  onChange={handleAuthChange}
                  autoComplete={
                    mode === "register"
                      ? "new-password"
                      : "current-password"
                  }
                  minLength={8}
                  required
                  className={inputClass}
                  placeholder="At least 8 characters"
                />
              </div>

              {authError && (
                <p role="alert" className="text-sm text-red-400">
                  {authError}
                </p>
              )}

              <button
                type="submit"
                className={`${buttonClass} w-full bg-cyan-400 text-slate-950 hover:bg-cyan-300`}
              >
                {mode === "register"
                  ? "Create account"
                  : "Log in"}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-400">
              {mode === "register"
                ? "Already have an account?"
                : "New to TaskFlow?"}{" "}
              <button
                type="button"
                onClick={() => {
                  setMode(
                    mode === "register" ? "login" : "register"
                  );
                  setAuthError("");
                }}
                className="font-semibold text-cyan-400 hover:text-cyan-300"
              >
                {mode === "register" ? "Log in" : "Create account"}
              </button>
            </p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      {/* Application header */}
      <header className="border-b border-slate-800">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-cyan-400 font-black text-slate-950">
              TF
            </div>
            <div>
              <p className="text-lg font-bold">TaskFlow</p>
              <p className="text-xs text-slate-400">
                Your personal workspace
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold">
                {user.full_name}
              </p>
              <p className="text-xs text-slate-400">
                {user.email}
              </p>
            </div>

            <button
              onClick={handleLogout}
              className={`${buttonClass} border border-slate-700 hover:bg-slate-800`}
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-8 px-6 py-10">
        {/* Dashboard heading */}
        <section>
          <p className="text-sm font-semibold text-cyan-400">
            YOUR OVERVIEW
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Let's get things done.
          </h1>
          <p className="mt-3 text-slate-400">
            Small steps add up. Choose your next one.
          </p>
        </section>

        {/* Summary cards */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Total tasks", count: totalTasks },
            { label: "Pending", count: pendingTasks },
            { label: "In progress", count: inProgressTasks },
            { label: "Completed", count: completedTasks },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-slate-800 bg-slate-900 p-5"
            >
              <p className="text-sm text-slate-400">
                {stat.label}
              </p>
              <p className="mt-3 text-3xl font-bold">
                {stat.count}
              </p>
            </div>
          ))}
        </section>

        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* Task list */}
          <section className="min-w-0 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">Your tasks</h2>
                <p className="mt-1 text-sm text-slate-400">
                  {filteredTasks.length} shown
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
              <input
                aria-label="Search tasks"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className={inputClass}
                placeholder="Search tasks..."
              />

              <select
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value)
                }
                className={inputClass}
              >
                <option value="all">All statuses</option>
                <option value="pending">Pending</option>
                <option value="in_progress">In progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>

            {taskError && (
              <p
                role="alert"
                className="rounded-xl border border-red-900 bg-red-950/40 p-3 text-sm text-red-300"
              >
                {taskError}
              </p>
            )}

            {taskMessage && (
              <p
                role="status"
                className="rounded-xl border border-emerald-900 bg-emerald-950/40 p-3 text-sm text-emerald-300"
              >
                {taskMessage}
              </p>
            )}

            {loadingTasks ? (
              <p className="py-10 text-center text-slate-400">
                Loading your tasks...
              </p>
            ) : filteredTasks.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-700 px-6 py-12 text-center">
                <p className="text-lg font-semibold">
                  {tasks.length === 0
                    ? "Your task list is empty."
                    : "No matching tasks."}
                </p>
                <p className="mt-2 text-sm text-slate-400">
                  {tasks.length === 0
                    ? "Create your first task to get started."
                    : "Try another search or status filter."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredTasks.map((task) => (
                  <article
                    key={task.id}
                    className="rounded-2xl border border-slate-800 bg-slate-900 p-5 transition hover:border-slate-700"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3
                          className={`break-words text-lg font-semibold ${
                            task.status === "completed"
                              ? "text-slate-400 line-through"
                              : ""
                          }`}
                        >
                          {task.title}
                        </h3>

                        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-400">
                          {task.description || "No description"}
                        </p>
                      </div>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          task.priority === "high"
                            ? "bg-red-950 text-red-300"
                            : task.priority === "low"
                              ? "bg-slate-800 text-slate-300"
                              : "bg-amber-950 text-amber-300"
                        }`}
                      >
                        {task.priority} priority
                      </span>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full bg-slate-800 px-3 py-1.5 text-slate-300">
                        {STATUS_LABELS[task.status] ?? task.status}
                      </span>

                      <span className="text-slate-400">
                        Due: {formatDate(task.due_date)}
                      </span>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-800 pt-4">
                      <button
                        onClick={() => handleEdit(task)}
                        className={`${buttonClass} border border-slate-700 hover:bg-slate-800`}
                      >
                        Edit
                      </button>

                      <button
                        onClick={() => handleDelete(task)}
                        className={`${buttonClass} border border-red-900 text-red-300 hover:bg-red-950/50`}
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* Create / edit form */}
          <aside className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
            <h2 className="text-xl font-bold">
              {editingTask ? "Edit task" : "Create a task"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              {editingTask
                ? "Update your task details below."
                : "Capture what needs to get done."}
            </p>

            <form
              onSubmit={handleTaskSubmit}
              className="mt-6 space-y-5"
            >
              <div>
                <label htmlFor="title" className="text-sm font-medium">
                  Title
                </label>
                <input
                  id="title"
                  name="title"
                  value={taskForm.title}
                  onChange={handleTaskChange}
                  required
                  maxLength={120}
                  className={inputClass}
                  placeholder="e.g. Finish React practice"
                />
              </div>

              <div>
                <label
                  htmlFor="description"
                  className="text-sm font-medium"
                >
                  Description
                </label>
                <textarea
                  id="description"
                  name="description"
                  value={taskForm.description}
                  onChange={handleTaskChange}
                  rows={3}
                  className={inputClass}
                  placeholder="Add a few details..."
                />
              </div>

              <div>
                <label htmlFor="due_date" className="text-sm font-medium">
                  Due date
                </label>
                <input
                  id="due_date"
                  name="due_date"
                  type="date"
                  value={taskForm.due_date}
                  onChange={handleTaskChange}
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="priority" className="text-sm font-medium">
                  Priority
                </label>
                <select
                  id="priority"
                  name="priority"
                  value={taskForm.priority}
                  onChange={handleTaskChange}
                  className={inputClass}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <div>
                <label htmlFor="status" className="text-sm font-medium">
                  Status
                </label>
                <select
                  id="status"
                  name="status"
                  value={taskForm.status}
                  onChange={handleTaskChange}
                  className={inputClass}
                >
                  <option value="pending">Pending</option>
                  <option value="in_progress">In progress</option>
                  <option value="completed">Completed</option>
                </select>
              </div>

              {taskError && (
                <p role="alert" className="text-sm text-red-300">
                  {taskError}
                </p>
              )}

              <button
                type="submit"
                disabled={savingTask}
                className={`${buttonClass} w-full bg-cyan-400 text-slate-950 hover:bg-cyan-300`}
              >
                {savingTask
                  ? "Saving..."
                  : editingTask
                    ? "Save changes"
                    : "Create task"}
              </button>

              {editingTask && (
                <button
                  type="button"
                  onClick={resetTaskForm}
                  className={`${buttonClass} w-full border border-slate-700 hover:bg-slate-800`}
                >
                  Cancel editing
                </button>
              )}
            </form>
          </aside>
        </div>

        <footer className="border-t border-slate-800 py-6 text-center text-xs text-slate-500">
          TaskFlow · Built one step at a time.
        </footer>
      </div>
    </main>
  );
}

export default App;
