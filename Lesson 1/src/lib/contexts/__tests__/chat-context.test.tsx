import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { ChatProvider, useChat } from "../chat-context";
import { useFileSystem } from "../file-system-context";
import { useChat as useAIChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import * as anonTracker from "@/lib/anon-work-tracker";

// Mock dependencies
vi.mock("../file-system-context", () => ({
  useFileSystem: vi.fn(),
}));

vi.mock("@ai-sdk/react", () => ({
  useChat: vi.fn(),
}));

vi.mock("ai", () => ({
  DefaultChatTransport: vi.fn().mockImplementation(() => ({})),
}));

vi.mock("@/lib/anon-work-tracker", () => ({
  setHasAnonWork: vi.fn(),
}));

// Helper component to access chat context
function TestComponent() {
  const chat = useChat();
  return (
    <div>
      <div data-testid="messages">{chat.messages.length}</div>
      <textarea
        data-testid="input"
        value={chat.input}
        onChange={chat.handleInputChange}
      />
      <form data-testid="form" onSubmit={chat.handleSubmit}>
        <button type="submit">Submit</button>
      </form>
      <div data-testid="status">{chat.status}</div>
    </div>
  );
}

describe("ChatContext", () => {
  const mockFileSystem = {
    serialize: vi.fn(() => ({ "/test.js": { type: "file", content: "test" } })),
  };

  const mockHandleToolCall = vi.fn();
  const mockSendMessage = vi.fn();

  const mockUseAIChat = {
    messages: [],
    sendMessage: mockSendMessage,
    status: "idle",
  };

  beforeEach(() => {
    vi.clearAllMocks();

    (useFileSystem as any).mockReturnValue({
      fileSystem: mockFileSystem,
      handleToolCall: mockHandleToolCall,
    });

    (useAIChat as any).mockReturnValue(mockUseAIChat);
  });

  afterEach(() => {
    cleanup();
  });

  test("renders with default values", () => {
    render(
      <ChatProvider>
        <TestComponent />
      </ChatProvider>
    );

    expect(screen.getByTestId("messages").textContent).toBe("0");
    expect((screen.getByTestId("input") as HTMLTextAreaElement).value).toBe("");
    expect(screen.getByTestId("status").textContent).toBe("idle");
  });

  test("initializes with project ID and messages", () => {
    const initialMessages = [
      { id: "1", role: "user" as const, parts: [{ type: "text" as const, text: "Hello" }] },
      { id: "2", role: "assistant" as const, parts: [{ type: "text" as const, text: "Hi there!" }] },
    ];

    (useAIChat as any).mockReturnValue({
      ...mockUseAIChat,
      messages: initialMessages,
    });

    render(
      <ChatProvider projectId="test-project" initialMessages={initialMessages}>
        <TestComponent />
      </ChatProvider>
    );

    expect(useAIChat).toHaveBeenCalledWith(
      expect.objectContaining({
        transport: expect.anything(),
        messages: initialMessages,
        onToolCall: expect.any(Function),
      })
    );

    expect(screen.getByTestId("messages").textContent).toBe("2");
  });

  test("tracks anonymous work when no project ID", async () => {
    const mockMessages = [
      { id: "1", role: "user" as const, parts: [{ type: "text" as const, text: "Hello" }] },
    ];

    (useAIChat as any).mockReturnValue({
      ...mockUseAIChat,
      messages: mockMessages,
    });

    render(
      <ChatProvider>
        <TestComponent />
      </ChatProvider>
    );

    await waitFor(() => {
      expect(anonTracker.setHasAnonWork).toHaveBeenCalledWith(
        mockMessages,
        mockFileSystem.serialize()
      );
    });
  });

  test("does not track anonymous work when project ID exists", async () => {
    const mockMessages = [
      { id: "1", role: "user" as const, parts: [{ type: "text" as const, text: "Hello" }] },
    ];

    (useAIChat as any).mockReturnValue({
      ...mockUseAIChat,
      messages: mockMessages,
    });

    render(
      <ChatProvider projectId="test-project">
        <TestComponent />
      </ChatProvider>
    );

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(anonTracker.setHasAnonWork).not.toHaveBeenCalled();
  });

  test("passes through status from AI chat", () => {
    (useAIChat as any).mockReturnValue({
      ...mockUseAIChat,
      status: "streaming",
    });

    render(
      <ChatProvider>
        <TestComponent />
      </ChatProvider>
    );

    expect(screen.getByTestId("status").textContent).toBe("streaming");
  });

  test("handles tool calls by delegating to handleToolCall", () => {
    let onToolCallHandler: any;

    (useAIChat as any).mockImplementation((config: any) => {
      onToolCallHandler = config.onToolCall;
      return mockUseAIChat;
    });

    render(
      <ChatProvider>
        <TestComponent />
      </ChatProvider>
    );

    // The new toolCall format has toolName and input (not args)
    const toolCall = { toolName: "str_replace_editor", input: { command: "create" } };
    onToolCallHandler({ toolCall });

    expect(mockHandleToolCall).toHaveBeenCalledWith({
      toolName: "str_replace_editor",
      args: { command: "create" },
    });
  });

  test("uses DefaultChatTransport with correct API endpoint", () => {
    render(
      <ChatProvider projectId="test-project">
        <TestComponent />
      </ChatProvider>
    );

    expect(DefaultChatTransport).toHaveBeenCalledWith(
      expect.objectContaining({ api: "/api/chat" })
    );
  });
});
