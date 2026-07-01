import { IdentityManager } from '../identity';

/**
 * Capability-based permission for a specific namespace.
 */
export interface Capability {
	peerId: string;
	namespace: string;
	permissions: string[]; // 'read', 'write', 'admin'
	issuedBy: string; // The public key (hex) of the authority
	signature: Uint8Array;
}

/**
 * Authorization module for managing and verifying capabilities.
 */
export interface Authorizer {
	issueCapability(
		peerId: string,
		namespace: string,
		permissions: string[],
	): Promise<Capability>;
	verifyCapability(cap: Capability): Promise<boolean>;
	canWrite(namespace: string, cap?: Capability): boolean;
	canRead(namespace: string, cap?: Capability): boolean;
}

export class CapabilityAuthorizer implements Authorizer {
	constructor(private identity: IdentityManager) {}

	/**
	 * Issues a new capability for a peer and namespace.
	 * Signed by this node's identity (acting as authority).
	 */
	async issueCapability(
		peerId: string,
		namespace: string,
		permissions: string[],
	): Promise<Capability> {
		const cap: Omit<Capability, 'signature'> = {
			peerId,
			namespace,
			permissions: [...permissions].sort(),
			issuedBy: IdentityManager.toHex(this.identity.getPublicKeys().dsa),
		};

		const message = this.serializeCapability(cap as Capability);
		const signature = this.identity.sign(message);

		return {
			...cap,
			signature,
		};
	}

	/**
	 * Verifies if a capability's signature is valid.
	 */
	async verifyCapability(cap: Capability): Promise<boolean> {
		try {
			const { signature, ...capData } = cap;
			const message = this.serializeCapability(capData as Capability);
			const issuerPublicKey = IdentityManager.fromHex(cap.issuedBy);

			return this.identity.verify(signature, message, issuerPublicKey);
		} catch (e) {
			return false;
		}
	}

	/**
	 * Checks if a capability grants write access to a namespace.
	 */
	canWrite(namespace: string, cap?: Capability): boolean {
		if (!cap) return false;
		if (cap.namespace !== namespace && cap.namespace !== '*') return false;
		return (
			cap.permissions.includes('write') || cap.permissions.includes('admin')
		);
	}

	/**
	 * Checks if a capability grants read access to a namespace.
	 */
	canRead(namespace: string, cap?: Capability): boolean {
		if (!cap) return false;
		if (cap.namespace !== namespace && cap.namespace !== '*') return false;
		return (
			cap.permissions.includes('read') ||
			cap.permissions.includes('write') ||
			cap.permissions.includes('admin')
		);
	}

	/**
	 * Serializes a capability to bytes for signing and verification.
	 */
	private serializeCapability(cap: Omit<Capability, 'signature'>): Uint8Array {
		const data = {
			peerId: cap.peerId,
			namespace: cap.namespace,
			permissions: cap.permissions,
			issuedBy: cap.issuedBy,
		};
		return new TextEncoder().encode(JSON.stringify(data));
	}
}

// LEGACY SUPPORT for existing tests
import type {
	NamespaceAction,
	NamespaceAuthorizer,
	NamespaceCapabilityGrant,
} from '../types';
import { AuthzManager, type SignedCapability } from './index';

export const namespaceCapability = (
	namespace: string,
	action: NamespaceAction,
): string => `${namespace}:${action}`;

export interface NamespaceAuthorizerOptions {
	authorityPeerId?: string;
	grants?: NamespaceCapabilityGrant[];
	verifyCapability?: (
		signature: Uint8Array,
		message: Uint8Array,
		issuer: string,
	) => boolean;
}

export class DefaultNamespaceAuthorizer implements NamespaceAuthorizer {
	private authz = new AuthzManager();
	private authorityPeerId?: string;
	private verifyCapability?: NamespaceAuthorizerOptions['verifyCapability'];

	constructor(options: NamespaceAuthorizerOptions = {}) {
		this.authorityPeerId = options.authorityPeerId;
		this.verifyCapability = options.verifyCapability;
		for (const grant of options.grants || []) {
			this.grant(grant);
		}
	}

	grant(grant: NamespaceCapabilityGrant): void {
		const issuer = this.authorityPeerId || 'authority';
		const capability = namespaceCapability(grant.namespace, grant.action);
		const signedCapability: SignedCapability = {
			capability,
			issuer,
			subject: grant.subject,
			signature: new Uint8Array(),
			expiresAt: grant.expiresAt,
		};
		this.authz.addCapability(signedCapability);
	}

	can(subject: string, namespace: string, action: NamespaceAction): boolean {
		if (this.authorityPeerId && subject === this.authorityPeerId) return true;
		return this.authz.hasCapability(
			subject,
			namespaceCapability(namespace, action),
			this.verifyCapability || null,
		);
	}

	require(subject: string, namespace: string, action: NamespaceAction): void {
		if (!this.can(subject, namespace, action)) {
			throw new Error(
				`Missing capability ${namespaceCapability(namespace, action)} for ${subject}`,
			);
		}
	}
}

export const createNamespaceAuthorizer = (
	options: NamespaceAuthorizerOptions = {},
): NamespaceAuthorizer => new DefaultNamespaceAuthorizer(options);
