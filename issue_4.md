## Problem
No telemetry on which features users rely on most.

## Solution
Implement GA4 tracking for critical user paths (e.g., product creation, P2P connect). Enqueue events offline.

## Testing
- Unit tests for the telemetry service ensuring the offline queue persists.