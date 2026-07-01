import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';

export interface PQCKeyPair {
	publicKey: Uint8Array;
	secretKey: Uint8Array;
}

/**
 * Legacy IdentityManager using Post-Quantum Cryptography (ML-DSA and ML-KEM).
 */
export class IdentityManager {
	private kemKeys: PQCKeyPair;
	private dsaKeys: PQCKeyPair;

	constructor(kemKeys?: PQCKeyPair, dsaKeys?: PQCKeyPair) {
		this.kemKeys = kemKeys || this.generateKEMKeyPair();
		this.dsaKeys = dsaKeys || this.generateDSAKeyPair();
	}

	public getPublicKeys() {
		return {
			kem: this.kemKeys.publicKey,
			dsa: this.dsaKeys.publicKey,
		};
	}

	public generateKEMKeyPair(): PQCKeyPair {
		const keys = ml_kem768.keygen();
		return { publicKey: keys.publicKey, secretKey: keys.secretKey };
	}

	public generateDSAKeyPair(): PQCKeyPair {
		const keys = ml_dsa65.keygen();
		return { publicKey: keys.publicKey, secretKey: keys.secretKey };
	}

	public sign(message: Uint8Array): Uint8Array {
		return ml_dsa65.sign(message, this.dsaKeys.secretKey);
	}

	public verify(
		signature: Uint8Array,
		message: Uint8Array,
		publicKey: Uint8Array,
	): boolean {
		return ml_dsa65.verify(signature, message, publicKey);
	}

	public encapsulate(remoteKEMPublicKey: Uint8Array) {
		const { cipherText, sharedSecret } =
			ml_kem768.encapsulate(remoteKEMPublicKey);
		return { cipherText, sharedSecret };
	}

	public decapsulate(cipherText: Uint8Array) {
		return ml_kem768.decapsulate(cipherText, this.kemKeys.secretKey);
	}

	public static toHex(arr: Uint8Array): string {
		return Array.from(arr)
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('');
	}

	public static fromHex(hex: string): Uint8Array {
		const arr = new Uint8Array(hex.length / 2);
		for (let i = 0; i < arr.length; i++) {
			arr[i] = Number.parseInt(hex.substring(i * 2, i * 2 + 2), 16);
		}
		return arr;
	}
}

/**
 * Identity interface for cryptographic node identity with message signing.
 */
export interface Identity {
	peerId: string;
	sign(data: Uint8Array): Promise<Uint8Array>;
	verify(
		data: Uint8Array,
		signature: Uint8Array,
		peerId: string,
	): Promise<boolean>;
}

/**
 * Creates a new Identity using Web Crypto API (SubtleCrypto) with Ed25519.
 */
export async function createIdentity(): Promise<Identity> {
	const keyPair = (await crypto.subtle.generateKey(
		{
			name: 'Ed25519',
		},
		true,
		['sign', 'verify'],
	)) as CryptoKeyPair;

	const publicKeyBuffer = await crypto.subtle.exportKey(
		'raw',
		keyPair.publicKey,
	);
	const peerId = IdentityManager.toHex(new Uint8Array(publicKeyBuffer));

	return {
		peerId,
		async sign(data: Uint8Array): Promise<Uint8Array> {
			const signature = await crypto.subtle.sign(
				{
					name: 'Ed25519',
				},
				keyPair.privateKey,
				data,
			);
			return new Uint8Array(signature);
		},
		async verify(
			data: Uint8Array,
			signature: Uint8Array,
			remotePeerId: string,
		): Promise<boolean> {
			try {
				const publicKey = await crypto.subtle.importKey(
					'raw',
					IdentityManager.fromHex(remotePeerId),
					{
						name: 'Ed25519',
					},
					true,
					['verify'],
				);
				return await crypto.subtle.verify(
					{
						name: 'Ed25519',
					},
					publicKey,
					signature,
					data,
				);
			} catch (error) {
				return false;
			}
		},
	};
}
