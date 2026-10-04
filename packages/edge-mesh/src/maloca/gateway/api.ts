import type { EdgeMesh } from '../../edge-mesh.js';
import { secureRandomString } from '../../protocol/utils.js';
import { TokenBucketRateLimiter } from '../../security/rate-limiter.js';
import type { NodoId } from '../../types/index.js';
// Type-only import: the gateway READS the real karma engine, it never re-implements it
// and never mutates it. Importing the type does not couple us to KarmaManager internals,
// only to its public surface (`getScore`).
import type { KarmaManager } from '../karma.js';

/**
 * Reputation band returned alongside the karma score.
 *
 * IMPORTANT (mesh medico): these are DISPLAY BANDS derived from the real engine score.
 * They are not an authorization signal. A reputation badge MUST NOT be read as
 * "this node is allowed to see patients" — access is granted by credential
 * verification, never by reputation.
 */
export type ReputationBand = 'unrated' | 'newcomer' | 'member' | 'trusted' | 'legendary';

/**
 * REST API Gateway para el mesh Maloca.
 *
 * ── SCOPE: READ-ONLY WITH RESPECT TO REPUTATION ──────────────────────────
 * Every reputation value surfaced here (profiles, karma) is READ from the single
 * real engine (`KarmaManager`, wired as `mesh.karma` by `MalocaKernel`). The gateway
 * never recomputes a score from its own rules and never invents a base value.
 *
 * A node with no signed karma history reports `0` / `unrated`. It is NOT granted a
 * free starting score: reputation must be earned through validated transactions.
 *
 * SECURITY NOTE (medical networks): reputation is a signal about history, not about
 * entitlement. Credential verification (`identidad` / registry attestation) is what
 * grants access to patient data. This API is read-only and grants nothing.
 */

export class MalocaGatewayAPI {
  private readonly rateLimiter = new TokenBucketRateLimiter({
    tokensPerInterval: 60,
    intervalMs: 1000,
    maxTokens: 100,
  });

  constructor(private readonly mesh: EdgeMesh) {}

  private checkRateLimit(clientIp: string) {
    if (!this.rateLimiter.consume(clientIp)) {
      console.warn(`Rate limit exceeded for IP/peer: ${clientIp} on Gateway API`);
      throw new Error('Rate limit exceeded: 429');
    }
  }

  /**
   * GET /mesh/status
   */
  async getMeshStatus(clientIp = '127.0.0.1') {
    this.checkRateLimit(clientIp);
    const nodes = this.mesh.presence.obtenerNodosActivos();
    return {
      status: 'online',
      totalNodes: nodes.length,
      activeNodes: nodes,
      config: {
        nodoId: this.mesh.config.nodoId,
      },
    };
  }

  /**
   * GET /profiles/:id
   */
  async getProfile(id: string, clientIp = '127.0.0.1') {
    this.checkRateLimit(clientIp);
    const profiles = this.mesh.yjsAdapter.getMap('maloca:profiles');
    const profileData = profiles.get(id) as any;

    if (!profileData) {
      return {
        id,
        alias: `Nodo ${id.slice(0, 4)}`,
        karma: await this.getKarmaValue(id),
      };
    }

    return {
      ...profileData,
      id,
      karma: await this.getKarmaValue(id),
    };
  }

  /**
   * POST /profiles
   */
  async registerProfile(profile: any, clientIp = '127.0.0.1') {
    this.checkRateLimit(clientIp);
    const profiles = this.mesh.yjsAdapter.getMap('maloca:profiles');
    profiles.set(this.mesh.config.nodoId, {
      ...profile,
      updatedAt: Date.now(),
    });

    return {
      success: true,
      profile,
    };
  }

  /**
   * GET /karma/:id
   *
   * READ-ONLY view of reputation. The score and band both come from the real engine.
   * Nothing here grants access to clinical data — credential verification does.
   */
  async getKarma(id: string, clientIp = '127.0.0.1') {
    this.checkRateLimit(clientIp);
    const karmaValue = await this.getKarmaValue(id);
    return {
      nodoId: id,
      karma: karmaValue,
      reputacion: this.calculateReputation(karmaValue),
      // Explicit invariant for the medical mesh: reputation is informational only.
      // Consumers MUST NOT treat `reputacion` as an entitlement to handle patients.
      autorizaAcceso: false as const,
    };
  }

  /**
   * POST /karma/emit
   *
   * Writes an UNSIGNED karma event into the shared Yjs log for dashboard/leaderboard
   * display. It does NOT touch the reputation engine: the score returned by
   * `getKarma`/`getProfile` is unaffected by this call.
   *
   * Rationale: this unsigned log is still consumed by `MalocaDashboard.getKarmaValue`
   * for its leaderboard, so removing the writer here would break that file (outside this
   * change's file scope). The authoritative path is `MalocaKernel.emitKarma` ->
   * `KarmaManager.emit`, which signs with the node's PQC identity.
   *
   * TODO(owner): unify both paths once dashboard is migrated off the raw Yjs array.
   */
  async emitKarma(transaction: { to: string; amount: number; reason: string }, clientIp = '127.0.0.1') {
    this.checkRateLimit(clientIp);
    const karmaLogs = this.mesh.yjsAdapter.getArray('maloca:karma:txs');
    const tx = {
      from: this.mesh.config.nodoId,
      ...transaction,
      timestamp: Date.now(),
    };
    karmaLogs.push([tx]);

    return {
      txId: secureRandomString(6),
      ...tx,
      // Callers must not assume this affected the reputation score.
      afectaReputacion: false as const,
    };
  }

  /**
   * GET /plugins
   */
  async getPlugins(clientIp = '127.0.0.1') {
    this.checkRateLimit(clientIp);
    // Lista de plugins activos basada en configuración o estado dinámico
    return [
      { id: 'core', status: 'active' },
      { id: 'chat', status: 'active' },
      { id: 'governance', status: 'active' },
      { id: 'gateway', status: 'active' },
    ];
  }

  /**
   * POST /evidentia/notarize
   */
  async notarizeDocument(doc: { hash: string; metadata: any }, clientIp = '127.0.0.1') {
    this.checkRateLimit(clientIp);
    const notarizations = this.mesh.yjsAdapter.getMap('maloca:evidentia');
    const entry = {
      ...doc,
      timestamp: Date.now(),
      author: this.mesh.config.nodoId,
    };
    notarizations.set(doc.hash, entry);

    return {
      notarized: true,
      ...entry,
    };
  }

  // --- Helpers ---

  /**
   * Resolves the REAL karma engine (`KarmaManager`) attached to the mesh.
   *
   * `MalocaKernel` owns `readonly karma: KarmaManager`. The gateway is typed against
   * the base `EdgeMesh`, so we look the accessor up structurally rather than casting
   * blindly. When the mesh is a plain `EdgeMesh` (no kernel wired), there is no engine
   * to read and we report "no reputation data" instead of fabricating a score.
   */
  private getKarmaEngine(): KarmaManager | null {
    const mesh = this.mesh as unknown as { karma?: unknown };
    const engine = mesh.karma;
    if (!engine || typeof engine !== 'object') return null;
    const candidate = engine as { getScore?: unknown };
    return typeof candidate.getScore === 'function' ? (engine as KarmaManager) : null;
  }

  /**
   * Reads the karma score from the real engine.
   *
   * A node with no history returns 0 — never a synthetic base value. A missing engine
   * (plain EdgeMesh, kernel not attached) is reported as 0 as well, so the API can never
   * imply unearned standing.
   */
  private async getKarmaValue(id: string): Promise<number> {
    const engine = this.getKarmaEngine();
    if (engine === null) return 0;
    try {
      const score = engine.getScore(id as NodoId);
      return Number.isFinite(score) ? score : 0;
    } catch {
      // Engine present but unreadable: fail closed to 0 rather than inventing standing.
      return 0;
    }
  }

  /**
   * Derives a DISPLAY band from the real engine score.
   *
   * The score itself is the source of truth; this only buckets it for presentation.
   * `unrated` is returned for a zero score so a node without validated history is
   * visibly unrated instead of inheriting the previous base-100 "newcomer" floor.
   */
  private calculateReputation(karma: number): ReputationBand {
    if (karma > 1000) return 'legendary';
    if (karma > 500) return 'trusted';
    if (karma > 100) return 'member';
    if (karma > 0) return 'newcomer';
    return 'unrated';
  }
}
