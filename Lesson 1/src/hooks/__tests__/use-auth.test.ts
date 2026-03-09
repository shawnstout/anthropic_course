import { test, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import { signIn as signInAction, signUp as signUpAction } from "@/actions";
import { getAnonWorkData, clearAnonWork } from "@/lib/anon-work-tracker";
import { getProjects } from "@/actions/get-projects";
import { createProject } from "@/actions/create-project";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
}));

vi.mock("@/actions", () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("@/lib/anon-work-tracker", () => ({
  getAnonWorkData: vi.fn(),
  clearAnonWork: vi.fn(),
}));

vi.mock("@/actions/get-projects", () => ({
  getProjects: vi.fn(),
}));

vi.mock("@/actions/create-project", () => ({
  createProject: vi.fn(),
}));

const mockPush = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  (useRouter as any).mockReturnValue({ push: mockPush });
  (getAnonWorkData as any).mockReturnValue(null);
});

afterEach(() => {
  cleanup();
});

// ─── Initial state ────────────────────────────────────────────────────────────

test("exposes signIn, signUp, and isLoading", () => {
  const { result } = renderHook(() => useAuth());
  expect(result.current.signIn).toBeTypeOf("function");
  expect(result.current.signUp).toBeTypeOf("function");
  expect(result.current.isLoading).toBe(false);
});

// ─── signIn: happy paths ──────────────────────────────────────────────────────

test("signIn: redirects to most recent project when sign-in succeeds", async () => {
  (signInAction as any).mockResolvedValue({ success: true });
  (getProjects as any).mockResolvedValue([{ id: "proj-1" }, { id: "proj-2" }]);

  const { result } = renderHook(() => useAuth());
  let returnValue: any;

  await act(async () => {
    returnValue = await result.current.signIn("user@test.com", "password123");
  });

  expect(returnValue).toEqual({ success: true });
  expect(mockPush).toHaveBeenCalledWith("/proj-1");
  expect(createProject).not.toHaveBeenCalled();
});

test("signIn: creates new project and redirects when user has no projects", async () => {
  (signInAction as any).mockResolvedValue({ success: true });
  (getProjects as any).mockResolvedValue([]);
  (createProject as any).mockResolvedValue({ id: "new-proj" });

  const { result } = renderHook(() => useAuth());

  await act(async () => {
    await result.current.signIn("user@test.com", "password123");
  });

  expect(createProject).toHaveBeenCalledWith(
    expect.objectContaining({ messages: [], data: {} })
  );
  expect(mockPush).toHaveBeenCalledWith("/new-proj");
});

test("signIn: migrates anon work into a new project on success", async () => {
  const anonMessages = [{ role: "user", content: "build me a form" }];
  const anonData = { "/App.jsx": "export default () => <form />" };
  (signInAction as any).mockResolvedValue({ success: true });
  (getAnonWorkData as any).mockReturnValue({ messages: anonMessages, fileSystemData: anonData });
  (createProject as any).mockResolvedValue({ id: "anon-proj" });

  const { result } = renderHook(() => useAuth());

  await act(async () => {
    await result.current.signIn("user@test.com", "password123");
  });

  expect(createProject).toHaveBeenCalledWith(
    expect.objectContaining({ messages: anonMessages, data: anonData })
  );
  expect(clearAnonWork).toHaveBeenCalled();
  expect(mockPush).toHaveBeenCalledWith("/anon-proj");
  expect(getProjects).not.toHaveBeenCalled();
});

test("signIn: new project name starts with 'Design from' when migrating anon work", async () => {
  (signInAction as any).mockResolvedValue({ success: true });
  (getAnonWorkData as any).mockReturnValue({ messages: [{ role: "user" }], fileSystemData: {} });
  (createProject as any).mockResolvedValue({ id: "proj" });

  const { result } = renderHook(() => useAuth());

  await act(async () => {
    await result.current.signIn("user@test.com", "password123");
  });

  const nameArg = (createProject as any).mock.calls[0][0].name;
  expect(nameArg).toMatch(/^Design from .+/);
});

test("signIn: new project name contains a number when created for user with no projects", async () => {
  (signInAction as any).mockResolvedValue({ success: true });
  (getProjects as any).mockResolvedValue([]);
  (createProject as any).mockResolvedValue({ id: "proj" });

  const { result } = renderHook(() => useAuth());

  await act(async () => {
    await result.current.signIn("user@test.com", "password123");
  });

  const nameArg = (createProject as any).mock.calls[0][0].name;
  expect(nameArg).toMatch(/^New Design #\d+$/);
});

// ─── signIn: edge cases ───────────────────────────────────────────────────────

test("signIn: anon work with empty messages falls through to getProjects", async () => {
  (signInAction as any).mockResolvedValue({ success: true });
  (getAnonWorkData as any).mockReturnValue({ messages: [], fileSystemData: {} });
  (getProjects as any).mockResolvedValue([{ id: "proj-1" }]);

  const { result } = renderHook(() => useAuth());

  await act(async () => {
    await result.current.signIn("user@test.com", "password123");
  });

  expect(createProject).not.toHaveBeenCalled();
  expect(clearAnonWork).not.toHaveBeenCalled();
  expect(mockPush).toHaveBeenCalledWith("/proj-1");
});

// ─── signIn: error states ─────────────────────────────────────────────────────

test("signIn: returns failure result and does not redirect on bad credentials", async () => {
  (signInAction as any).mockResolvedValue({ success: false, error: "Invalid credentials" });

  const { result } = renderHook(() => useAuth());
  let returnValue: any;

  await act(async () => {
    returnValue = await result.current.signIn("user@test.com", "wrongpass");
  });

  expect(returnValue).toEqual({ success: false, error: "Invalid credentials" });
  expect(mockPush).not.toHaveBeenCalled();
  expect(getProjects).not.toHaveBeenCalled();
});

test("signIn: isLoading is true during async call and false after success", async () => {
  let resolveSignIn!: (value: any) => void;
  const pendingSignIn = new Promise((resolve) => {
    resolveSignIn = resolve;
  });
  (signInAction as any).mockReturnValue(pendingSignIn);
  (getProjects as any).mockResolvedValue([{ id: "proj-1" }]);

  const { result } = renderHook(() => useAuth());

  let signInPromise: Promise<any>;
  act(() => {
    signInPromise = result.current.signIn("user@test.com", "password123");
  });

  expect(result.current.isLoading).toBe(true);

  await act(async () => {
    resolveSignIn({ success: true });
    await signInPromise!;
  });

  expect(result.current.isLoading).toBe(false);
});

test("signIn: isLoading resets to false after failed sign-in", async () => {
  (signInAction as any).mockResolvedValue({ success: false, error: "Invalid credentials" });

  const { result } = renderHook(() => useAuth());

  await act(async () => {
    await result.current.signIn("user@test.com", "password123");
  });

  expect(result.current.isLoading).toBe(false);
});

test("signIn: isLoading resets to false even when action throws", async () => {
  (signInAction as any).mockRejectedValue(new Error("Network error"));

  const { result } = renderHook(() => useAuth());

  await act(async () => {
    await result.current.signIn("user@test.com", "password123").catch(() => {});
  });

  expect(result.current.isLoading).toBe(false);
});

// ─── signUp: happy paths ──────────────────────────────────────────────────────

test("signUp: redirects to most recent project when sign-up succeeds", async () => {
  (signUpAction as any).mockResolvedValue({ success: true });
  (getProjects as any).mockResolvedValue([{ id: "proj-abc" }]);

  const { result } = renderHook(() => useAuth());
  let returnValue: any;

  await act(async () => {
    returnValue = await result.current.signUp("newuser@test.com", "password123");
  });

  expect(returnValue).toEqual({ success: true });
  expect(mockPush).toHaveBeenCalledWith("/proj-abc");
});

test("signUp: creates new project and redirects when user has no projects", async () => {
  (signUpAction as any).mockResolvedValue({ success: true });
  (getProjects as any).mockResolvedValue([]);
  (createProject as any).mockResolvedValue({ id: "fresh-proj" });

  const { result } = renderHook(() => useAuth());

  await act(async () => {
    await result.current.signUp("newuser@test.com", "password123");
  });

  expect(createProject).toHaveBeenCalled();
  expect(mockPush).toHaveBeenCalledWith("/fresh-proj");
});

test("signUp: migrates anon work into a new project on success", async () => {
  const anonMessages = [{ role: "user", content: "build me a button" }];
  const anonData = { "/App.jsx": "export default () => <button>Click</button>" };
  (signUpAction as any).mockResolvedValue({ success: true });
  (getAnonWorkData as any).mockReturnValue({ messages: anonMessages, fileSystemData: anonData });
  (createProject as any).mockResolvedValue({ id: "migrated-proj" });

  const { result } = renderHook(() => useAuth());

  await act(async () => {
    await result.current.signUp("newuser@test.com", "password123");
  });

  expect(createProject).toHaveBeenCalledWith(
    expect.objectContaining({ messages: anonMessages, data: anonData })
  );
  expect(clearAnonWork).toHaveBeenCalled();
  expect(mockPush).toHaveBeenCalledWith("/migrated-proj");
});

// ─── signUp: error states ─────────────────────────────────────────────────────

test("signUp: returns failure result and does not redirect on duplicate email", async () => {
  (signUpAction as any).mockResolvedValue({ success: false, error: "Email already registered" });

  const { result } = renderHook(() => useAuth());
  let returnValue: any;

  await act(async () => {
    returnValue = await result.current.signUp("taken@test.com", "password123");
  });

  expect(returnValue).toEqual({ success: false, error: "Email already registered" });
  expect(mockPush).not.toHaveBeenCalled();
});

test("signUp: isLoading is true during async call and false after completion", async () => {
  let resolveSignUp!: (value: any) => void;
  const pendingSignUp = new Promise((resolve) => {
    resolveSignUp = resolve;
  });
  (signUpAction as any).mockReturnValue(pendingSignUp);
  (getProjects as any).mockResolvedValue([{ id: "proj-1" }]);

  const { result } = renderHook(() => useAuth());

  let signUpPromise: Promise<any>;
  act(() => {
    signUpPromise = result.current.signUp("user@test.com", "password123");
  });

  expect(result.current.isLoading).toBe(true);

  await act(async () => {
    resolveSignUp({ success: true });
    await signUpPromise!;
  });

  expect(result.current.isLoading).toBe(false);
});

test("signUp: isLoading resets to false after failed sign-up", async () => {
  (signUpAction as any).mockResolvedValue({ success: false, error: "Email already registered" });

  const { result } = renderHook(() => useAuth());

  await act(async () => {
    await result.current.signUp("taken@test.com", "password123");
  });

  expect(result.current.isLoading).toBe(false);
});

test("signUp: isLoading resets to false even when action throws", async () => {
  (signUpAction as any).mockRejectedValue(new Error("Server error"));

  const { result } = renderHook(() => useAuth());

  await act(async () => {
    await result.current.signUp("user@test.com", "password123").catch(() => {});
  });

  expect(result.current.isLoading).toBe(false);
});
