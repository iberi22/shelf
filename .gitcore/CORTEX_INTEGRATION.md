# Cortex Integration — Shelf Project

**Protocol Version:** 3.6.0
**Created:** 2026-06-11

## Overview
Integration between GitCore SDLC phases and Cortex memory system (via xavier at `http://localhost:8006`).

## Sync Points

Each SDLC phase logs decisions to xavier:

| Phase | What to log | Path |
|-------|-------------|------|
| ANALYSIS | SRC Requirements generated | `projects/shelf/decisions/<YYYY-MM-DD>/analysis` |
| DESIGN | Architecture decisions, SRC approved | `projects/shelf/decisions/<YYYY-MM-DD>/design` |
| IMPLEMENT | Commits, features implemented | `projects/shelf/decisions/<YYYY-MM-DD>/implement` |
| TEST | Validation reports | `projects/shelf/decisions/<YYYY-MM-DD>/test` |

## Endpoint
```
POST http://localhost:8006/memory/add
Authorization: Bearer dev-token
Content-Type: application/json
```

## Payload Structure
```json
{
  "type": "decision",
  "path": "projects/shelf/decisions/2026-06-11/<phase>",
  "content": {
    "phase": "<ANALYSIS|DESIGN|IMPLEMENT|TEST>",
    "issue_id": "<#N>",
    "feature_id": "<SRC-ID>",
    "decision": "<summary of decision>",
    "agent": "<agent-name>",
    "timestamp": "<ISO-8601>"
  }
}
```

## Example Sync Command (PowerShell)
```powershell
$body = @{
    type = "decision"
    path = "projects/shelf/decisions/$(Get-Date -Format 'yyyy-MM-dd')/implement"
    content = @{
        phase = "IMPLEMENT"
        issue_id = "#42"
        feature_id = "SRC-FUN-001"
        decision = "Inventory Management CRUD implemented with React + localStorage"
        agent = "@protocol-codex"
        timestamp = (Get-Date).ToString("o")
    }
} | ConvertTo-Json -Depth 3

Invoke-RestMethod -Uri "http://localhost:8006/memory/add" `
  -Method Post -Headers @{Authorization="Bearer dev-token"} `
  -Body $body -ContentType "application/json"
```

## Fallback
If xavier is unreachable, save to `.gitcore/cortex-sync-cache/sync_<timestamp>.json` and sync when available.
