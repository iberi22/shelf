import { describe, expect, it } from 'vitest';
import { IdentityManager } from '../src/identity';

describe('IdentityManager', () => {
	it('should generate valid keypairs and sign/verify messages', () => {
		const im = new IdentityManager();
		const message = new TextEncoder().encode('hello edge-mesh');
		const signature = im.sign(message);
		const pubKeys = im.getPublicKeys();

		expect(im.verify(signature, message, pubKeys.dsa)).toBe(true);

		const wrongMessage = new TextEncoder().encode('wrong message');
		expect(im.verify(signature, wrongMessage, pubKeys.dsa)).toBe(false);
	});

	it('should support PQC key encapsulation', () => {
		const alice = new IdentityManager();
		const bob = new IdentityManager();

		const bobPub = bob.getPublicKeys();
		const { cipherText, sharedSecret: aliceSecret } = alice.encapsulate(
			bobPub.kem,
		);
		const bobSecret = bob.decapsulate(cipherText);

		expect(aliceSecret).toEqual(bobSecret);
	});
});
