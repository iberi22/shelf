import * as Y from "yjs";
import { logger } from "./utils/logger";

/**
 * Configuration for Supabase cloud sync
 */
export interface SupabaseConfig {
	url: string;
	key: string;
	table: string;
	userId: string;
}

/**
 * Manages periodic synchronization of Yjs document state to Supabase.
 * This provides cloud persistence for Pro/Pyme users beyond the P2P mesh.
 */
export class CloudSyncManager {
	private doc: Y.Doc;
	private config: SupabaseConfig;
	private interval: number;
	private timer: ReturnType<typeof setInterval> | null = null;
	private isSyncing = false;

	constructor(doc: Y.Doc, config: SupabaseConfig, interval = 60000) {
		this.doc = doc;
		this.config = config;
		this.interval = interval;
	}

	/**
	 * Starts the periodic sync process.
	 * Performs an initial pull from the cloud before starting the timer.
	 */
	public async start() {
		if (this.timer) return;

		// Initial pull to get the latest cloud state
		await this.pullFromCloud();

		this.timer = setInterval(() => {
			this.pushToCloud();
		}, this.interval);

		logger.log("[CLOUD-SYNC] Cloud sync service started");
	}

	/**
	 * Stops the periodic sync process.
	 */
	public stop() {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
			logger.log("[CLOUD-SYNC] Cloud sync service stopped");
		}
	}

	/**
	 * Pushes the current local state to Supabase.
	 */
	public async pushToCloud() {
		if (this.isSyncing) return;
		this.isSyncing = true;

		try {
			const state = Y.encodeStateAsUpdate(this.doc);
			const base64State = this.toBase64(state);

			const response = await fetch(
				`${this.config.url}/rest/v1/${this.config.table}`,
				{
					method: "POST",
					headers: {
						apikey: this.config.key,
						Authorization: `Bearer ${this.config.key}`,
						"Content-Type": "application/json",
						Prefer: "resolution=merge-duplicates",
					},
					body: JSON.stringify({
						user_id: this.config.userId,
						state: base64State,
						updated_at: new Date().toISOString(),
					}),
				},
			);

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`Cloud sync push failed (${response.status}): ${errorText}`);
			}

			logger.log("[CLOUD-SYNC] State successfully pushed to Supabase");
		} catch (error) {
			logger.error("[CLOUD-SYNC] Push failed:", error);
		} finally {
			this.isSyncing = false;
		}
	}

	/**
	 * Pulls the latest state from Supabase and applies it to the local document.
	 * Yjs handles the merging and conflict resolution automatically.
	 */
	public async pullFromCloud() {
		try {
			const response = await fetch(
				`${this.config.url}/rest/v1/${this.config.table}?user_id=eq.${this.config.userId}&select=state`,
				{
					method: "GET",
					headers: {
						apikey: this.config.key,
						Authorization: `Bearer ${this.config.key}`,
						"Content-Type": "application/json",
					},
				},
			);

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`Cloud sync pull failed (${response.status}): ${errorText}`);
			}

			const data = await response.json();
			if (data && data.length > 0 && data[0].state) {
				const remoteUpdate = this.fromBase64(data[0].state);
				Y.applyUpdate(this.doc, remoteUpdate, "cloud");
				logger.log("[CLOUD-SYNC] State successfully pulled from Supabase and merged");
			}
		} catch (error) {
			logger.error("[CLOUD-SYNC] Pull failed:", error);
		}
	}

	/**
	 * Helper to convert Uint8Array to Base64 string
	 */
	private toBase64(array: Uint8Array): string {
		let binary = "";
		const len = array.byteLength;
		for (let i = 0; i < len; i++) {
			binary += String.fromCharCode(array[i]);
		}
		return btoa(binary);
	}

	/**
	 * Helper to convert Base64 string to Uint8Array
	 */
	private fromBase64(base64: string): Uint8Array {
		const binaryString = atob(base64);
		const len = binaryString.length;
		const bytes = new Uint8Array(len);
		for (let i = 0; i < len; i++) {
			bytes[i] = binaryString.charCodeAt(i);
		}
		return bytes;
	}
}
