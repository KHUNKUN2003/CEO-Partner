# CEO Partner MVP Design

## Goal

CEO Partner is a JavaScript backend automation service for a business owner. It reads Meta business data for the previous day, asks AI to produce practical business and content recommendations, sends the daily brief to LINE at 08:00 Asia/Bangkok, and lets the owner chat with CEO Partner through LINE.

## Scope

The MVP has no dashboard. It runs as a Node.js HTTP service with a LINE webhook endpoint and a daily scheduler.

The first connected Meta assets are:

- Page ID: `731445173377155`
- Ad account ID: `act_3587793018144053`

Secrets are never committed. Meta, Google AI, LINE, and Neon credentials live in `.env`.

## Architecture

The service is split into focused ES modules:

- `config`: reads environment variables and validates required settings.
- `metaClient`: calls Meta Graph API and Marketing API.
- `aiClient`: calls the Google Generative Language API.
- `lineClient`: verifies LINE webhook signatures, replies to messages, and pushes daily reports.
- `storage`: persists Meta snapshots, AI reports, and inbound LINE users in Neon Postgres.
- `analysis`: turns Meta snapshots into prompts for daily reports and chat replies.
- `scheduler`: runs the daily report at the configured local time.
- `server`: exposes health and LINE webhook endpoints.

## Data Flow

At the scheduled time, CEO Partner:

1. Calculates yesterday in `Asia/Bangkok`.
2. Fetches Page metadata and ad insights from Meta.
3. Saves the raw snapshot in Neon.
4. Sends the snapshot to AI for analysis.
5. Saves the AI report in Neon.
6. Sends the report to the configured LINE user, group, or last seen LINE user.

For LINE chat:

1. LINE sends a webhook event to `/webhook/line`.
2. The server verifies `X-Line-Signature`.
3. If the message is text, the service stores the sender ID in Neon.
4. The service loads the latest snapshot and report.
5. The AI answers using the latest business context.
6. The server replies through LINE's reply API.

## AI Behavior

The AI is not constrained to a narrow business template. It can reason across content, ads, offers, operations, and customer behavior. The system still protects operational safety: it does not reveal secrets, does not claim data was fetched when an API failed, and does not perform destructive Meta actions in the MVP.

## Neon Free Plan Fit

Neon stores small daily JSON snapshots and AI reports. This is lightweight enough for a free-plan MVP. The schema uses append-only report rows plus a small `line_users` table for the latest known chat target.

## Error Handling

External API failures return structured errors. The daily report still sends a LINE message when Meta or AI fails, so the owner knows the automation attempted to run. Webhook signature failures return `401`.

## Testing

The MVP uses Node's built-in test runner. Tests cover configuration parsing, date calculation, LINE signature verification, Meta request construction, storage SQL behavior through dependency injection, and AI prompt construction.
