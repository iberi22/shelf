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
