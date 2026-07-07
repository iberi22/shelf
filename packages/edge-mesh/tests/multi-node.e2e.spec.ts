import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EDGE_MESH_BUNDLE_PATH = path.join(__dirname, '..', 'dist', 'edge-mesh.bundle.js');
const EDGE_MESH_BUNDLE = fs.readFileSync(EDGE_MESH_BUNDLE_PATH, 'utf-8');

async function setupNode(page: Page, peerId: string) {
  // Inject the bundle
  await page.addScriptTag({ content: EDGE_MESH_BUNDLE });

  await page.evaluate((id) => {
    const EdgeMesh = (window as any).EdgeMeshLib.EdgeMesh;

    class BroadcastChannelTransport {
      private bc: BroadcastChannel;
      private onMessageCb?: (from: string, data: Uint8Array) => void;
      private onPeerConnectCb?: (peerId: string) => void;
      private onPeerDisconnectCb?: (peerId: string) => void;
      private isStopped = false;

      constructor(peerId: string) {
        this.bc = new BroadcastChannel('edge-mesh-e2e');
        this.bc.onmessage = (event) => {
          if (this.isStopped) return;
          const { from, to, data } = event.data;

          // If it's a direct message to us or a broadcast (no 'to')
          if (from !== id && (!to || to === id)) {
            this.onMessageCb?.(from, new Uint8Array(data));
          }

          // Simulation of peer discovery
          if (from !== id && event.data.type === 'hello') {
             this.onPeerConnectCb?.(from);
          }
        };
      }

      send(to: string, data: Uint8Array) {
        if (this.isStopped) return;
        this.bc.postMessage({ from: id, to, data: Array.from(data) });
      }

      broadcast(data: Uint8Array) {
        if (this.isStopped) return;
        this.bc.postMessage({ from: id, data: Array.from(data) });
      }

      onMessage(callback: (from: string, data: Uint8Array) => void) {
        this.onMessageCb = callback;
      }

      onPeerConnect(callback: (peerId: string) => void) {
        this.onPeerConnectCb = callback;
      }

      onPeerDisconnect(callback: (peerId: string) => void) {
        this.onPeerDisconnectCb = callback;
      }

      stop() {
        this.isStopped = true;
      }

      resume() {
        this.isStopped = false;
      }

      sayHello() {
        this.bc.postMessage({ from: id, type: 'hello' });
      }
    }

    const transport = new BroadcastChannelTransport(id);
    (window as any).transport = transport;
    (window as any).mesh = new EdgeMesh({
      localPeerId: id,
      transport: transport
    });
    // Trigger initial hello for discovery
    transport.sayHello();
    (window as any).shelf = (window as any).mesh.getNamespace('shelf');
  }, peerId);
}

test.describe('Multi-node CRDT Convergence E2E', () => {
  test('3 nodes converge after concurrent edits', async ({ browser }) => {
    const context = await browser.newContext();
    const pageA = await context.newPage();
    const pageB = await context.newPage();
    const pageC = await context.newPage();

    // Use about:blank to have a clean environment
    await pageA.goto('about:blank');
    await pageB.goto('about:blank');
    await pageC.goto('about:blank');

    await setupNode(pageA, 'node-a');
    await setupNode(pageB, 'node-b');
    await setupNode(pageC, 'node-c');

    // Concurrent edits to different keys
    await Promise.all([
      pageA.evaluate(() => {
        const shelf = (window as any).shelf;
        const products = shelf.doc.getMap('products');
        products.set('a', 'apple');
      }),
      pageB.evaluate(() => {
        const shelf = (window as any).shelf;
        const products = shelf.doc.getMap('products');
        products.set('b', 'banana');
      }),
      pageC.evaluate(() => {
        const shelf = (window as any).shelf;
        const products = shelf.doc.getMap('products');
        products.set('c', 'cherry');
      })
    ]);

    // Verify convergence
    const expected = { a: 'apple', b: 'banana', c: 'cherry' };

    for (const page of [pageA, pageB, pageC]) {
      await expect.poll(async () => {
        return page.evaluate(() => {
          const shelf = (window as any).shelf;
          const products = shelf.doc.getMap('products');
          return Object.fromEntries(products.entries());
        });
      }, { timeout: 10000 }).toEqual(expected);
    }

    await context.close();
  });

  test('node catches up after being offline', async ({ browser }) => {
    const context = await browser.newContext();
    const pageA = await context.newPage();
    const pageB = await context.newPage();

    await pageA.goto('about:blank');
    await pageB.goto('about:blank');

    await setupNode(pageA, 'node-a');
    await setupNode(pageB, 'node-b');

    // Node B goes "offline"
    await pageB.evaluate(() => {
      (window as any).transport.stop();
    });

    // Node A makes changes
    await pageA.evaluate(() => {
      const shelf = (window as any).shelf;
      const products = shelf.doc.getMap('products');
      products.set('offline-test', 'synced');
    });

    // Node B should NOT have the change yet
    const valB = await pageB.evaluate(() => {
      return (window as any).shelf.doc.getMap('products').get('offline-test');
    });
    expect(valB).toBeUndefined();

    // Node B comes back "online" and triggers discovery/sync
    await pageB.evaluate(() => {
      (window as any).transport.resume();
      (window as any).transport.sayHello();
    });

    // Also Node A says hello back when it sees B's hello
    await pageA.evaluate(() => {
      (window as any).transport.sayHello();
    });

    // Verify Node B catches up
    await expect.poll(async () => {
      return pageB.evaluate(() => {
        return (window as any).shelf.doc.getMap('products').get('offline-test');
      });
    }, { timeout: 10000 }).toBe('synced');

    await context.close();
  });
});
