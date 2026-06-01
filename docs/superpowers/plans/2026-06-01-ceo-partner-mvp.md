# CEO Partner MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a JavaScript backend service that fetches Meta data, generates daily AI recommendations, stores context in Neon, sends reports to LINE, and answers LINE chatbot messages.

**Architecture:** Use small ES modules under `src/`. Keep external integrations behind client functions so tests can cover prompt generation, signature verification, config, storage, and request shaping without network calls. Persist reports and LINE user IDs in Neon through `@neondatabase/serverless`.

**Tech Stack:** Node.js 25+, Express, node-cron, dotenv, @neondatabase/serverless, built-in `fetch`, built-in `node:test`, Meta Graph API, Google Generative Language API, LINE Messaging API, Neon Postgres Free plan.

---

## File Structure

- `package.json`: scripts, dependencies, ESM setup.
- `.env.example`: required environment variables without secrets.
- `README.md`: setup and local webhook guide.
- `sql/schema.sql`: Neon schema.
- `src/config.js`: environment loading and validation.
- `src/dates.js`: Asia/Bangkok previous-day helpers.
- `src/metaClient.js`: Meta Graph and Marketing API request construction and calls.
- `src/aiClient.js`: Google AI request construction and calls.
- `src/analysis.js`: daily report and LINE chat prompt construction.
- `src/lineClient.js`: LINE signature verification, reply, push, source extraction.
- `src/storage.js`: Neon persistence helpers.
- `src/dailyReport.js`: orchestration for the daily report.
- `src/server.js`: Express health and LINE webhook endpoints.
- `src/scheduler.js`: daily cron registration.
- `src/index.js`: process entrypoint.
- `test/*.test.js`: unit tests using `node:test`.

## Tasks

### Task 1: Tests and Project Skeleton

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `sql/schema.sql`
- Create: `test/config-dates.test.js`

- [ ] Write tests for config validation and Bangkok previous-day calculation.
- [ ] Run `npm.cmd test -- --test-name-pattern "config|dates"` and verify tests fail because modules are missing.
- [ ] Create package metadata, scripts, env template, and schema.

### Task 2: Config and Dates

**Files:**
- Create: `src/config.js`
- Create: `src/dates.js`

- [ ] Implement `.env` loading and required config validation.
- [ ] Implement yesterday range for Asia/Bangkok.
- [ ] Run `npm.cmd test -- --test-name-pattern "config|dates"` and verify pass.

### Task 3: LINE Client

**Files:**
- Create: `test/line-client.test.js`
- Create: `src/lineClient.js`

- [ ] Write tests for LINE signature verification, sender extraction, reply payload, and push target fallback.
- [ ] Run `npm.cmd test -- --test-name-pattern "LINE"` and verify tests fail because the module is missing.
- [ ] Implement LINE helper functions.
- [ ] Run the LINE tests and verify pass.

### Task 4: Meta and AI Prompt Layer

**Files:**
- Create: `test/meta-analysis.test.js`
- Create: `src/metaClient.js`
- Create: `src/analysis.js`
- Create: `src/aiClient.js`

- [ ] Write tests for Meta insight URL construction and daily/chat prompt content.
- [ ] Run `npm.cmd test -- --test-name-pattern "Meta|prompt|AI"` and verify fail.
- [ ] Implement clients and prompt builders.
- [ ] Run tests and verify pass.

### Task 5: Neon Storage and Daily Orchestration

**Files:**
- Create: `test/storage-daily-report.test.js`
- Create: `src/storage.js`
- Create: `src/dailyReport.js`

- [ ] Write tests for SQL calls through injected query functions and daily report orchestration.
- [ ] Run `npm.cmd test -- --test-name-pattern "storage|daily"` and verify fail.
- [ ] Implement storage and orchestration.
- [ ] Run tests and verify pass.

### Task 6: Server, Scheduler, Docs

**Files:**
- Create: `test/server.test.js`
- Create: `src/server.js`
- Create: `src/scheduler.js`
- Create: `src/index.js`
- Create: `README.md`

- [ ] Write tests for health endpoint and webhook signature rejection.
- [ ] Run server tests and verify fail.
- [ ] Implement Express app, scheduler, and entrypoint.
- [ ] Document Neon, Meta, Google AI, LINE setup.
- [ ] Run `npm.cmd test`.
- [ ] Run `node --check` for all `src/*.js` files.

## Self-Review

The plan covers the approved MVP: JS backend, Neon persistence, daily Meta analysis, LINE push, LINE chatbot, no dashboard, and no committed secrets. It keeps Meta write actions out of the MVP while allowing broad AI reasoning over the fetched business context.
