import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as Y from "yjs";
import { CloudSyncManager, type SupabaseConfig } from "../src/cloud-sync";

describe("CloudSyncManager", () => {
	let doc: Y.Doc;
	let config: SupabaseConfig;
	let manager: CloudSyncManager;

	beforeEach(() => {
		doc = new Y.Doc();
		config = {
			url: "https://example.supabase.co",
			key: "test-key",
			table: "sync_state",
			userId: "user-123",
		};
		manager = new CloudSyncManager(doc, config, 100);
		vi.stubGlobal("fetch", vi.fn());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		manager.stop();
	});

	it("should pull state from cloud on start", async () => {
		const remoteDoc = new Y.Doc();
		remoteDoc.getArray("test").insert(0, ["remote data"]);
		const remoteState = Y.encodeStateAsUpdate(remoteDoc);
		// Using btoa as it is available in the browser-like environment and consistent with implementation
		const base64State = btoa(String.fromCharCode(...remoteState));

		vi.mocked(fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => [{ state: base64State }],
		} as Response);

		await manager.start();

		expect(fetch).toHaveBeenCalledWith(
			expect.stringContaining("user_id=eq.user-123"),
			expect.objectContaining({
				method: "GET",
				headers: expect.objectContaining({
					apikey: "test-key",
				}),
			}),
		);

		expect(doc.getArray("test").toArray()).toEqual(["remote data"]);
	});

	it("should push state to cloud", async () => {
		doc.getArray("test").insert(0, ["local data"]);

		vi.mocked(fetch).mockResolvedValueOnce({
			ok: true,
		} as Response);

		await manager.pushToCloud();

		expect(fetch).toHaveBeenCalledWith(
			expect.stringContaining("sync_state"),
			expect.objectContaining({
				method: "POST",
				headers: expect.objectContaining({
					Prefer: "resolution=merge-duplicates",
				}),
			}),
		);

		const lastCall = vi.mocked(fetch).mock.calls[0];
		const body = JSON.parse(lastCall[1]!.body as string);
		expect(body.user_id).toBe("user-123");
		expect(body.state).toBeDefined();

		// Decode state back to verify content
		const decoded = new Uint8Array(atob(body.state).split("").map(c => c.charCodeAt(0)));
		const tempDoc = new Y.Doc();
		Y.applyUpdate(tempDoc, decoded);
		expect(tempDoc.getArray("test").toArray()).toEqual(["local data"]);
	});

	it("should resolve conflicts correctly between local and remote", async () => {
		// 1. Initial local state
		doc.getArray("items").insert(0, ["item 1"]);

		// 2. Mock remote state with different content
		const remoteDoc = new Y.Doc();
		remoteDoc.getArray("items").insert(0, ["item 2"]);
		const remoteState = Y.encodeStateAsUpdate(remoteDoc);
		const base64State = btoa(String.fromCharCode(...remoteState));

		vi.mocked(fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => [{ state: base64State }],
		} as Response);

		// 3. Pull and merge
		await manager.pullFromCloud();

		// 4. Verify merged state (Yjs should contain both since they are independent inserts in this case)
		const items = doc.getArray("items").toArray();
		expect(items).toContain("item 1");
		expect(items).toContain("item 2");
		expect(items.length).toBe(2);
	});

	it("should stop periodic sync when stop() is called", async () => {
		vi.useFakeTimers();
		vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => [] } as Response);

		await manager.start();
		expect(vi.getTimerCount()).toBe(1);

		manager.stop();
		expect(vi.getTimerCount()).toBe(0);

		vi.useRealTimers();
	});
});
