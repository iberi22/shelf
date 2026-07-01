import { describe, it, expect, beforeEach } from 'vitest';
import { IdentityManager } from '../src/identity';
import { CapabilityAuthorizer, type Capability } from '../src/authz/namespace';

describe('CapabilityAuthorizer', () => {
	let authorityIdentity: IdentityManager;
	let peerIdentity: IdentityManager;
	let authorizer: CapabilityAuthorizer;
	let peerId: string;

	beforeEach(() => {
		authorityIdentity = new IdentityManager();
		peerIdentity = new IdentityManager();
		authorizer = new CapabilityAuthorizer(authorityIdentity);
		peerId = 'peer-1';
	});

	it('should issue and verify a valid capability', async () => {
		const cap = await authorizer.issueCapability(peerId, 'inventory', [
			'read',
			'write',
		]);

		expect(cap.peerId).toBe(peerId);
		expect(cap.namespace).toBe('inventory');
		expect(cap.permissions).toContain('read');
		expect(cap.permissions).toContain('write');
		expect(cap.issuedBy).toBe(
			IdentityManager.toHex(authorityIdentity.getPublicKeys().dsa),
		);

		const isValid = await authorizer.verifyCapability(cap);
		expect(isValid).toBe(true);
	});

	it('should allow admin to write', async () => {
		const cap = await authorizer.issueCapability(peerId, 'inventory', ['admin']);

		expect(authorizer.canWrite('inventory', cap)).toBe(true);
		expect(authorizer.canRead('inventory', cap)).toBe(true);
	});

	it('should allow collaborator with write permission to write', async () => {
		const cap = await authorizer.issueCapability(peerId, 'inventory', [
			'read',
			'write',
		]);

		expect(authorizer.canWrite('inventory', cap)).toBe(true);
		expect(authorizer.canRead('inventory', cap)).toBe(true);
	});

	it('should not allow collaborator with only read permission to write', async () => {
		const cap = await authorizer.issueCapability(peerId, 'inventory', ['read']);

		expect(authorizer.canWrite('inventory', cap)).toBe(false);
		expect(authorizer.canRead('inventory', cap)).toBe(true);
	});

	it('should reject tampered permissions', async () => {
		const cap = await authorizer.issueCapability(peerId, 'inventory', ['read']);

		// Tamper with permissions
		const tamperedCap: Capability = {
			...cap,
			permissions: ['read', 'write', 'admin'],
		};

		const isValid = await authorizer.verifyCapability(tamperedCap);
		expect(isValid).toBe(false);
	});

	it('should reject tampered peerId', async () => {
		const cap = await authorizer.issueCapability(peerId, 'inventory', ['admin']);

		// Tamper with peerId
		const tamperedCap: Capability = {
			...cap,
			peerId: 'other-peer',
		};

		const isValid = await authorizer.verifyCapability(tamperedCap);
		expect(isValid).toBe(false);
	});

	it('should reject capability for a different namespace', async () => {
		const cap = await authorizer.issueCapability(peerId, 'inventory', ['admin']);

		expect(authorizer.canWrite('sales', cap)).toBe(false);
		expect(authorizer.canRead('sales', cap)).toBe(false);
	});

	it('should support wildcard namespace', async () => {
		const cap = await authorizer.issueCapability(peerId, '*', ['admin']);

		expect(authorizer.canWrite('inventory', cap)).toBe(true);
		expect(authorizer.canRead('sales', cap)).toBe(true);
	});

	it('should return false if no capability is provided', () => {
		expect(authorizer.canWrite('inventory')).toBe(false);
		expect(authorizer.canRead('inventory')).toBe(false);
	});
});
