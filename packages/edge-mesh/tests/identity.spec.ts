import { describe, expect, it } from 'vitest';
import { createIdentity } from '../src/identity';

describe('Identity', () => {
	it('should generate an identity with a peerId', async () => {
		const identity = await createIdentity();
		expect(identity.peerId).toBeDefined();
		expect(typeof identity.peerId).toBe('string');
		expect(identity.peerId.length).toBeGreaterThan(0);
	});

	it('should sign and verify data correctly', async () => {
		const identity = await createIdentity();
		const data = new TextEncoder().encode('test data');
		const signature = await identity.sign(data);

		expect(signature).toBeDefined();
		const isValid = await identity.verify(data, signature, identity.peerId);
		expect(isValid).toBe(true);
	});

	it('should reject tampered data', async () => {
		const identity = await createIdentity();
		const data = new TextEncoder().encode('original data');
		const signature = await identity.sign(data);

		const tamperedData = new TextEncoder().encode('tampered data');
		const isValid = await identity.verify(
			tamperedData,
			signature,
			identity.peerId,
		);
		expect(isValid).toBe(false);
	});

	it('should reject wrong signer', async () => {
		const identity1 = await createIdentity();
		const identity2 = await createIdentity();
		const data = new TextEncoder().encode('some data');
		const signature = await identity1.sign(data);

		// Verifying identity1's signature with identity2's peerId should fail
		const isValid = await identity1.verify(data, signature, identity2.peerId);
		expect(isValid).toBe(false);
	});

	it('should reject tampered signature', async () => {
		const identity = await createIdentity();
		const data = new TextEncoder().encode('test data');
		const signature = await identity.sign(data);

		const tamperedSignature = new Uint8Array(signature);
		tamperedSignature[0] ^= 0xff; // Flip bits in first byte

		const isValid = await identity.verify(
			data,
			tamperedSignature,
			identity.peerId,
		);
		expect(isValid).toBe(false);
	});
});
