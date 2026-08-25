# Changelog

All notable changes to AROX Web Kiosk are documented in this file

The repository does not currently contain a formal tagged release history, so the entries below summarize the release line as it exists in the codebase and current deployment flow.

## [2.1.7] - 2026-07-24

### Added

- Live support call flow between the kiosk and the agent console.
- Incoming call tone on the kiosk so users get clear feedback while waiting for support.
- Agent-side live call screen with kiosk details, consumables context, mute, hold, resume, and end controls.
- Support call state synchronization so the kiosk can show waiting, connected, held, and ended states consistently.

### Changed

- Support requests now use the AROX support API contract directly instead of a local-only placeholder flow.
- The support queue and live-call UI are now tied together through a shared call record and signaling layer.
- Support session handling now keeps kiosk status and agent actions in sync during the call lifecycle.

### Fixed

- Reduced the chance of support requests appearing connected on the UI without an actual live session.
- Improved backend routing so the kiosk can reach the configured AROX API base URL.
- Added clearer handling for failed support-call setup and call state recovery.

## [2.1.6]

### Added

- Support queue presentation for admin and care-team operators.
- Periodic refresh of live support requests so the queue stays current.
- Kiosk detail lookup for the operator view, including the kiosk consumables context.

### Changed

- Support request records are now treated as live operational items instead of static alerts.
- The support console now distinguishes open, connected, on-hold, and closed calls.

### Fixed

- Improved retry behavior for queue loading and support session cleanup.

## [2.1.5]

### Added

- Kiosk-side support overlay for creating support requests directly from the terminal.
- Support categories and issue descriptions to help route calls faster.
- Microphone permission handling for live audio sessions.

### Changed

- Support requests now carry more context from the kiosk to the agent side.
- The kiosk support overlay now reflects queueing and connection states more clearly.

### Fixed

- Better cleanup for audio and socket resources when a support session ends.

## [2.1.4]

### Added

- QR code scanning and manual pickup-code entry flows.
- OTP verification before job release.
- Consumables checks for paper and toner before printing.

### Changed

- Print confirmation now surfaces job metadata more clearly before release.
- Low-supply conditions now route users into a service-oriented warning flow.

### Fixed

- Improved handling for invalid pickup codes and print-release failures.

## [2.1.3]

### Added

- Print job status tracking and completion messaging.
- Inactivity timeout behavior to keep kiosk sessions controlled.
- Audio cues for important print states such as waiting and completion.

### Changed

- The kiosk flow was refined into a clearer start, confirm, print, and finish journey.

### Fixed

- General UI stability improvements across the core kiosk shell.
