"use client";

import {
  createContext,
  useContext,
  ReactNode,
  useEffect,
  useState,
  useMemo,
  useRef,
} from "react";
import { useChat as useAIChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import { useFileSystem } from "./file-system-context";
import { setHasAnonWork } from "@/lib/anon-work-tracker";

interface ChatContextProps {
  projectId?: string;
  initialMessages?: UIMessage[];
}

interface ChatContextType {
  messages: UIMessage[];
  input: string;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  status: string;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({
  children,
  projectId,
  initialMessages = [],
}: ChatContextProps & { children: ReactNode }) {
  const { fileSystem, handleToolCall } = useFileSystem();
  const [input, setInput] = useState("");

  // Use refs so the transport body closure always reads the latest values
  const fileSystemRef = useRef(fileSystem);
  fileSystemRef.current = fileSystem;
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({
          files: fileSystemRef.current.serialize(),
          projectId: projectIdRef.current,
        }),
      }),
    [] // created once; body() reads refs at call time
  );

  const { messages, sendMessage, status } = useAIChat({
    transport,
    messages: initialMessages,
    onToolCall: ({ toolCall }) => {
      const tc = toolCall as any;
      handleToolCall({
        toolName: tc.toolName,
        args: tc.input,
      });
    },
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage({ text: input });
    setInput("");
  };

  // Track anonymous work
  useEffect(() => {
    if (!projectId && messages.length > 0) {
      setHasAnonWork(messages, fileSystem.serialize());
    }
  }, [messages, fileSystem, projectId]);

  return (
    <ChatContext.Provider
      value={{
        messages,
        input,
        handleInputChange,
        handleSubmit,
        status,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
}
