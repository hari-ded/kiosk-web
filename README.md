# AROX Web Kiosk

Current release: `2.1.8`

AROX Web Kiosk is the self-service terminal experience for the AROX print ecosystem. It guides users through pickup-code entry, QR scanning, OTP verification, print confirmation, low-supply handling, and live support escalation from a single kiosk interface.

## Purpose

This application is the user-facing control surface for release workflows. It validates the pickup code, requests OTP delivery, verifies the OTP, and then allows the job to proceed to release and printing.

## Ecosystem Contract

The kiosk is part of a three-system operating model:

- `arox-web-kiosk` handles the user journey on the terminal.
- `arox_backend` owns job state, OTP generation, release approval, and consumable truth.
- `arox_engine` executes the approved print job on the physical kiosk device.

The kiosk must call the backend for OTP request and OTP verification. It should not generate or trust release codes locally.

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

## Release Flow

The current release sequence is:

1. The user enters or scans a pickup code.
2. The kiosk validates the job against the backend.
3. The kiosk requests an OTP from the backend when the job requires secure release.
4. The backend stores the OTP and sends it through the app notification channel.
5. The user enters the OTP in the kiosk UI.
6. The kiosk verifies the OTP against the backend.
7. The backend authorizes the release.
8. The engine receives the approved print job and starts printing.

This is the intended contract for the current deployment. Any route or payload drift between kiosk and backend should be treated as a release-blocking integration defect.

## Architecture

- `src/` contains the kiosk user interface and screen flow
- `server.ts` hosts the local development server and mock API behaviors
- `src/api.ts` centralizes API calls to the AROX backend
- `src/components/SupportOverlay.tsx` manages the kiosk-side support call flow
- `src/screens/AgentConsole.tsx` provides the admin or care-team support console

The app talks to the same-origin `/api` proxy for browser API calls. The printer socket still connects to the backend root directly unless you override it with `VITE_PRINTER_BACKEND_URL`.

The API layer normalizes its base URL and appends `/api` automatically when needed. The printer socket uses a separate backend-root setting.

## Backend Endpoints Used

The kiosk expects the AROX backend to expose endpoints for:

- consumables lookup
- job validation and release
- release OTP request and verification
- alert creation
- support call creation, listing, updating, and live session signaling

The release OTP endpoints used by the kiosk are:

- `POST /api/job/:code/request_release_otp`
- `POST /api/job/:code/verify_release_otp`

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

## Notes For Production Teams

- Keep the kiosk ID consistent across the kiosk UI and the support console.
- Ensure microphone permission is available on the agent workstation for live support calls.
- Use the same backend origin for kiosk and agent signaling when possible to reduce CORS and session issues.
- Verify the support queue and live call endpoints before rollout so the kiosk can escalate issues cleanly.
- Verify the release OTP route contract after every backend deployment; a route registration regression will surface as a 404 at the kiosk layer.
- Treat OTP mismatches as an integration fault until backend storage and kiosk payloads have been checked together.

## Version

- App release: `2.1.8`
- Documentation aligned with the current kiosk support, release OTP, and print flow implementation
