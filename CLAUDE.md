# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Structure

This repo is an Anthropic course teaching Claude API integration. Each lesson is a self-contained project in its own subdirectory with its own `package.json`, `CLAUDE.md`, and dependencies.

- `Lesson 1/` — **UIGen**: AI-powered React component generator (Next.js 15, Vercel AI SDK, Prisma/SQLite, Claude Haiku)

Each lesson directory has its own `CLAUDE.md` with build commands, architecture, and dev workflow — read that file when working inside a lesson.

## GitHub Actions (CI)

Two workflows in `.github/workflows/`:

- **`claude.yml`** — PR Assistant: triggers on `@claude` mentions in issues/PR comments/reviews. Uses `anthropics/claude-code-action@v1` with `CLAUDE_CODE_OAUTH_TOKEN`.
- **`claude-code-review.yml`** — Auto code review on every PR open/sync. Uses the `code-review` plugin from `claude-code-plugins`.

Both workflows require the `CLAUDE_CODE_OAUTH_TOKEN` secret to be set in the GitHub repo settings.

## Adding New Lessons

New lessons go in a top-level directory (e.g., `Lesson 2/`). Each must include its own `CLAUDE.md` following the pattern in `Lesson 1/CLAUDE.md`.
