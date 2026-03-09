# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run setup        # Install deps + generate Prisma client + run migrations
npm run dev          # Start dev server (localhost:3000)
npm run build        # Production build
npm run test         # Run all tests (Vitest)
npx vitest run src/components/chat/__tests__/ChatInterface.test.tsx  # Run single test file
npm run db:reset     # Reset SQLite database (destructive)
npx prisma studio    # Open Prisma GUI
```

**Environment:** Copy `.env` and set `ANTHROPIC_API_KEY`. Without it, a `MockLanguageModel` returns static example components — the app is fully functional for dev without an API key.

## Architecture

UIGen is an AI-powered React component generator. Claude AI writes files into an in-memory virtual file system; a live preview compiles and renders the result via Babel in the browser.

### Request Flow

```
User chat input
  → ChatContext (useChat hook, Vercel AI SDK)
  → POST /api/chat  (messages + serialized VirtualFileSystem + projectId)
  → streamText() with claude-haiku-4-5 + two tools
  → Tool calls stream back to client
  → FileSystemContext.handleToolCall() mutates in-memory VFS
  → CodeEditor + PreviewFrame re-render
  → onFinish: saves messages + VFS JSON to Prisma (if authenticated)
```

### Virtual File System

`src/lib/file-system.ts` — `VirtualFileSystem` class. Entirely in-memory; nothing touches disk. Claude manipulates it via two tools:

- **`str_replace_editor`** — create file, replace string, insert at line
- **`file_manager`** — rename, delete

`FileSystemContext` (`src/lib/contexts/file-system-context.tsx`) wraps the VFS in React state and exposes `handleToolCall()` which the chat hook calls as tool results arrive.

### AI Integration

- `src/lib/provider.ts` — Factory: returns `anthropic('claude-haiku-4-5')` when `ANTHROPIC_API_KEY` is set, otherwise returns `MockLanguageModel` (returns static Counter/ContactForm/Card demo components with `maxSteps: 4`).
- `src/app/api/chat/route.ts` — Reconstructs VFS from request, prepends system prompt with Anthropic prompt caching (`providerOptions`), streams with `maxSteps: 40`.
- `src/lib/prompts/generation.tsx` — System prompt that instructs Claude to use the two file tools.
- `src/lib/tools/` — Tool definitions: `str-replace.ts` (create/view/str_replace/insert) and `file-manager.ts` (rename/delete), both Zod-validated.

### Authentication

JWT-based (`jose` + `bcrypt`). `src/lib/auth.ts` issues 7-day HTTP-only cookies signed with `JWT_SECRET`. `src/middleware.ts` guards `/api/projects` and `/api/filesystem`. Server actions in `src/actions/index.ts` handle sign-up/sign-in/sign-out; `src/actions/create-project.ts`, `get-project.ts`, `get-projects.ts` handle project CRUD. Users can interact anonymously — `userId` is optional on the `Project` model.

### Database

SQLite via Prisma. Two models:

- **`User`** — `id`, `email`, `password` (bcrypt), timestamps
- **`Project`** — `id`, `name`, `userId?`, `messages` (JSON string), `data` (serialized VFS JSON), timestamps

Schema at `prisma/schema.prisma`. Generated client outputs to `src/generated/prisma`.

### State Management

Two React contexts under `src/lib/contexts/`:

- **`ChatContext`** — chat messages, submission, tool call dispatch, anonymous session tracking
- **`FileSystemContext`** — VFS instance, selected file, refresh trigger, tool result handling

### Node Compatibility Shim

`node-compat.cjs` deletes `globalThis.localStorage` / `globalThis.sessionStorage` at startup. Node 25+ exposes these globals but they're non-functional without `--localstorage-file`, which breaks SSR guards in dependencies that check `typeof localStorage`. All `npm run` scripts load it via `NODE_OPTIONS="--require ./node-compat.cjs"`.

### JSX Preview Pipeline

- `src/lib/transform/jsx-transformer.ts` — `transformJSX()` compiles JSX via `@babel/standalone` (React 19 automatic runtime). `createImportMap()` maps bare imports to CDN URLs (esm.sh) + local blob URLs. `createPreviewHTML()` builds the full iframe HTML.
- `src/components/preview/PreviewFrame.tsx` — Sandboxed iframe (`allow-scripts allow-same-origin`). Prioritizes `App.jsx` as entry point. Displays error states for compile errors and missing files.

### UI Layout

`src/app/main-content.tsx` — Three-pane `ResizablePanelGroup`: Chat (35%) | Preview or Code editor (65%). Code view toggles between `FileTree` + `CodeEditor` (Monaco).
