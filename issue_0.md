## Problem
Settings.tsx is a God Object (SRP violation). It handles branch config, network config, P2P mesh logic, and state dispatch.

## Solution
Split Settings.tsx into <BranchConfig />, <NetworkConfig />, and <GeneralConfig />.
Extract UUID generation to utils/id.ts.

## Testing
- Create Unit tests for utils/id.ts.
- Verify Playwright settings-features.spec.ts passes after refactor.