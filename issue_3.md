## Problem
Lack of visibility into production crashes, especially offline.

## Solution
Add @sentry/react. Configure an offline cache so error payloads are stored in IndexedDB and sent when connectivity is restored.

## Testing
- Cypress/Playwright test verifying error interception.
- Test the offline queue mechanism natively.