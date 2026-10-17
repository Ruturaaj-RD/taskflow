const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ??
  (import.meta.env.DEV ? "http://localhost:5000" : "");

export async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  let data = {};

  try {
    data = await response.json();
  } catch {
    // Some responses may not contain JSON.
  }

  if (!response.ok) {
    const error = new Error(
      data.message || `Request failed with status ${response.status}`
    );

    error.status = response.status;
    throw error;
  }

  return data;
}