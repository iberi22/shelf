export type Capability = string;

export interface SignedCapability {
	capability: Capability;
	issuer: string;
	subject: string;
	signature: Uint8Array;
	expiresAt?: number;
}

export class AuthzManager {
	private capabilities: Map<string, SignedCapability[]> = new Map();

	public addCapability(signedCap: SignedCapability) {
		const userCaps = this.capabilities.get(signedCap.subject) || [];
		userCaps.push(signedCap);
		this.capabilities.set(signedCap.subject, userCaps);
	}

	public hasCapability(
		subject: string,
		requiredCap: Capability,
		verifyFn?:
			| ((signature: Uint8Array, message: Uint8Array, issuer: string) => boolean)
			| null,
	): boolean {
		const userCaps = this.capabilities.get(subject);
		if (!userCaps) return false;

		const now = Date.now();
		return userCaps.some((cap) => {
			if (cap.expiresAt && cap.expiresAt < now) return false;

			// Verification is REQUIRED unless explicitly waived by passing null
			if (verifyFn !== null) {
				if (!verifyFn) {
					console.warn(
						`[SECURITY] hasCapability called without verifyFn for ${subject}. Rejecting by default.`,
					);
					return false;
				}

				const message = new TextEncoder().encode(
					`${cap.capability}:${cap.issuer}:${cap.subject}`,
				);
				if (!verifyFn(cap.signature, message, cap.issuer)) return false;
			}

			return this.checkCapabilityMatch(cap.capability, requiredCap);
		});
	}

	private checkCapabilityMatch(granted: string, required: string): boolean {
		if (granted === '*') return true;
		if (granted === required) return true;
		if (granted.endsWith(':*')) {
			const prefix = granted.slice(0, -2);
			return required.startsWith(prefix);
		}
		return false;
	}
}
