# @shelf/edge-mesh

Core edge-mesh library for decentralized P2P communication.

## Features

- **Modular Architecture**: Clean separation between core logic, transport, and storage.
- **Protocol Versioning**: Built-in support for versioned messages and deduplication.
- **WebRTC Support**: Includes a PeerJS-based transport for browser-to-browser communication.
- **Presence Management**: Basic peer discovery and heartbeat mechanism.

## Installation

```bash
pnpm add @shelf/edge-mesh
```

## Usage

### Basic Example

```typescript
import {
  createEdgeMeshNode,
  PeerJSTransport,
  InMemoryStorage
} from '@shelf/edge-mesh';

const node = await createEdgeMeshNode({
  peerId: 'my-peer-id',
  transport: new PeerJSTransport(),
  storage: new InMemoryStorage(),
});

await node.start();

node.on('peer:connected', (peerId) => {
  console.log(`Connected to peer: ${peerId}`);
});

node.on('message', ({ type, payload, sourcePeerId }) => {
  console.log(`Received ${type} from ${sourcePeerId}:`, payload);
});

// Connect to a remote peer
await node.connect('remote-peer-id');

// Broadcast a message
await node.broadcast({
  type: 'app:event',
  payload: { data: 'hello mesh' }
});

// Stop the node
// await node.stop();
```

## Architecture

- **Core**: Manages the node lifecycle, event dispatching, and message routing.
- **Transport**: Abstract interface for P2P communication (e.g., WebRTC, WebSockets).
- **Storage**: Abstract interface for persisting mesh state and metadata.
- **Protocol**: Defines the common envelope for all mesh messages.
- **Presence**: Handles peer discovery and connectivity status.
