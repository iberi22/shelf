## Problem
Cloud sync needs strict permissions.

## Solution
Implement Role-Based Access Control on the Supabase/Firestore backend to prevent unauthorized reads/writes from organizations.

## Testing
- Backend RLS (Row Level Security) unit tests.
- Authenticated vs Unauthenticated read tests.