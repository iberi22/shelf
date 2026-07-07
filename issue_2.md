## Problem
Offline nodes default to `admin` if disconnected. A malicious node could exploit this fallback to gain admin rights in an existing mesh.

## Solution
Implement WebGPU/PQC signed handshakes to validate admin claims before promoting a peer locally.

## Testing
- Create edge-mesh security unit tests.
- E2E test verifying a fake peer cannot usurp the admin role.