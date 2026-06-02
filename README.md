# CEO Partner

CEO Partner is a Node.js backend automation service for a business owner. It fetches yesterday's Meta business data, asks AI for business and content recommendations, sends the daily report to LINE at 08:00 Asia/Bangkok, and answers owner questions through a LINE chatbot.

## What It Does

- Fetches Meta Page and ad account data.
- Stores daily snapshots and AI reports in Neon Postgres.
- Sends a daily LINE report on a cron schedule.
- Receives LINE webhook messages and replies with AI using the latest stored business context.
- Fetches fresh Meta data before answering LINE chat messages, then falls back to the latest stored snapshot if Meta is unavailable.
- Enables Gemini Google Search grounding so current web information can support answers and sources can be appended when Gemini returns grounding metadata.
- Enables Gemini Code Execution for daily report calculations when useful.
- Uses Gemini explicit context caching for reusable LINE chat business/Meta reference data without limiting the chatbot's conversation topics.
- Logs the first LINE `userId`, `groupId`, or `roomId` that messages the bot so it can be used as `LINE_TARGET_ID`.

## Setup

Install dependencies:

```powershell
npm.cmd install
```

Create `.env` from `.env.example` and fill in real values:

```env
NEON_DATABASE_URL=
META_ACCESS_TOKEN=
META_PAGE_ACCESS_TOKEN=
META_PAGE_ID=731445173377155
META_AD_ACCOUNT_ID=act_3587793018144053
META_CONTENT_MAX_ITEMS=5000
GOOGLE_AI_API_KEY=
GOOGLE_AI_MODEL=gemini-3.5-flash
GOOGLE_SEARCH_GROUNDING=true
GOOGLE_CODE_EXECUTION=true
GOOGLE_CONTEXT_CACHE=true
GOOGLE_CONTEXT_CACHE_TTL_SECONDS=3600
GOOGLE_CONTEXT_CACHE_MIN_CHARS=4000
LINE_CHANNEL_SECRET=
LINE_CHANNEL_ACCESS_TOKEN=
LINE_TARGET_ID=
```

Do not commit `.env`. Any token pasted into chat or shared screenshots should be rotated before production use.

## Neon Free Plan

Create a Neon project and copy the pooled or normal Postgres connection string into `NEON_DATABASE_URL`.

Run the schema:

```powershell
npm.cmd run db:apply
npm.cmd run db:verify
```

The MVP stores small JSON snapshots and short report text, which is appropriate for a free-plan prototype.

## LINE Webhook and Target ID

Start the server:

```powershell
npm.cmd run dev
```

Expose the local server with a tunnel such as ngrok or cloudflared, then set the LINE webhook URL to:

```text
https://your-tunnel-url/webhook/line
```

In LINE Developers:

- Enable `Use webhook`.
- Disable default auto-replies if you do not want duplicate replies.
- Send a message to the LINE OA.

The server logs a line like:

```text
LINE source seen: user Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Put that ID in `.env`:

```env
LINE_TARGET_ID=Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

For groups, use the logged `group` ID instead.

## Meta Data

The current MVP expects:

```env
META_PAGE_ID=731445173377155
META_AD_ACCOUNT_ID=act_3587793018144053
```

Use a long-lived token or System User token for production automation. A Graph API Explorer token is fine only for quick testing.

`META_CONTENT_MAX_ITEMS` controls the safety cap for paginated Meta content fetches. CEO Partner follows Meta `paging.next` for posts, uploaded photos, videos, and post comments until Meta has no more pages or this cap is reached.

## Run

```powershell
npm.cmd start
```

Health check:

```text
GET http://localhost:3000/health
```

The default daily schedule is:

```env
DAILY_REPORT_CRON=0 8 * * *
APP_TIMEZONE=Asia/Bangkok
```

The daily report analyzes yesterday in Bangkok time.

## Test

```powershell
npm.cmd test
npm.cmd run check
```
