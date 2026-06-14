import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';

export interface PQCKeyPair {
	publicKey: Uint8Array;
	secretKey: Uint8Array;
}

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
