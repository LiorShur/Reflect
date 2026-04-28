# Reflect

A mobile app that helps couples have better conversations using Gottman's
speaker-listener technique with AI moderation.

> **Status:** Pre-v1 development. Not yet ready for use.

## What it does

Two partners on two devices participate in synchronous, structured
conversations. The AI:

- Enforces turn-taking and catches harsh startup
- Offers softened versions of statements (with speaker approval)
- Helps the listener reflect back what they heard
- Detects emotional flooding and suggests breaks when needed

Built around the clinical research of John Gottman on what predicts
relationship success and the speaker-listener communication technique.

## Tech stack

- React Native (mobile)
- Firebase Realtime Database (sync) and Cloud Functions (orchestrator)
- Anthropic API (Claude) for AI roles
- TypeScript throughout

## Development

See `CLAUDE.md` for the development guide and `docs/` for design specs.

The canonical v1 scope is in `docs/v1-scope.md`.

## License

TBD
