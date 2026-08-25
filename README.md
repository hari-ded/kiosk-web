# AROX Web Kiosk

AROX Web Kiosk is the self-service terminal experience for the AROX print ecosystem. It guides users through pickup-code entry, QR scanning, OTP verification, print confirmation, low-supply handling, and live support escalation from a single kiosk interface.

**Current release:** `2.1.7`

## Overview

This kiosk app is built to support a fast, reliable front desk or public terminal flow. It connects the browser UI to the AROX backend for print jobs, consumables, alerts, and support calls. The local Node server in `server.ts` serves the app during development and also provides the runtime API used by the kiosk when the remote backend is not available.

## What The Kiosk Supports

- Pickup code entry through manual input or QR scanning
- Print job confirmation and release workflow
- OTP-based job validation before release
- Consumables awareness for paper and toner
- Low-supply alerts for service teams
- Support request creation from the kiosk screen
- Live support call handoff between the kiosk and the agent console
- Inactivity timeout and automatic return to home
- Audio feedback for major print states

## Architecture

- `src/` contains the kiosk user interface and screen flow
- `server.ts` hosts the local development server and mock API behaviors
- `src/api.ts` centralizes API calls to the AROX backend
- `src/components/SupportOverlay.tsx` manages the kiosk-side support call flow
- `src/screens/AgentConsole.tsx` provides the admin or care-team support console

The app talks to the same-origin `/api` proxy for browser API calls. The printer socket still connects to the backend root directly unless you override it with `VITE_PRINTER_BACKEND_URL`.

The API layer normalizes its base URL and appends `/api` automatically when needed. The printer socket uses a separate backend-root setting.

## Getting Started

### Prerequisites

- Node.js 18 or newer
- npm
- Access to the AROX backend environment

### Install Dependencies

```bash
npm install
```

### Configure Environment

Copy `.env.example` to your local environment file and adjust the values if needed.

Key variables:

- `VITE_API_URL` - API base URL for the browser. The default is `/api`, which should be proxied server-side in production.
- `VITE_KIOSK_ID` - Kiosk identifier used for consumables, jobs, alerts, and support calls.
- `VITE_PRINTER_BACKEND_URL` - Backend root used by the printer realtime socket. Defaults to the production backend root.
- `GEMINI_API_KEY` - Required only if you are using the Gemini-backed features in this environment.
- `APP_URL` - Host URL for the deployed app.

Example:

```env
VITE_KIOSK_ID="1"
VITE_API_URL="/api"
VITE_PRINTER_BACKEND_URL="https://arox-api-993539509814.asia-south1.run.app"
BACKEND_API_URL="https://arox-api-993539509814.asia-south1.run.app/api"
BACKEND_SERVICE_TOKEN="your-server-side-token"
```

### Run Locally

```bash
npm run dev
```

### Build For Production

```bash
npm run build
```

### Start The Production Build

```bash
npm run start
```

## Available Scripts

- `npm run dev` - starts the local development server
- `npm run build` - builds the client and server bundle for production
- `npm run start` - runs the compiled production server
- `npm run preview` - previews the Vite build locally
- `npm run lint` - type-checks the project
- `npm run clean` - removes build output

## Main Routes

- `/` - home screen
- `/code` - manual pickup code entry
- `/scan` - QR scanner
- `/confirm/:jobId` - print confirmation
- `/otp/:jobId` - OTP verification
- `/status/:jobId` - print progress and completion
- `/low-supply` - consumables warning and service prompt
- `/agent` - support agent console

## Support Workflow

1. The kiosk user opens support from the kiosk screen.
2. A support call request is created and sent to the AROX backend.
3. The kiosk enters the waiting state and plays the incoming call tone.
4. The agent console loads the queue and shows the active support requests.
5. When the agent connects, the live session is established and both sides exchange audio.
6. The agent can mute, hold, resume, or end the call from the console.
7. If the call is held, the kiosk shows a waiting message until the agent resumes it.
8. When the call ends, the kiosk exits the support session and returns to normal flow.

## Backend Endpoints Used

This kiosk expects the AROX backend to expose endpoints for:

- consumables lookup
- job validation and release
- alert creation
- support call creation, listing, updating, and live session signaling

If you are wiring this into a new environment, make sure the backend URL and the support endpoints match the same API contract used by `src/api.ts`.

## Notes For Production Teams

- Keep the kiosk ID consistent across the kiosk UI and the support console.
- Ensure microphone permission is available on the agent workstation for live support calls.
- Use the same backend origin for kiosk and agent signaling when possible to reduce CORS and session issues.
- Verify the support queue and live call endpoints before rollout so the kiosk can escalate issues cleanly.

## Version

- App release: `2.1.7`
- Documentation aligned with the current kiosk support and print flow implementation
