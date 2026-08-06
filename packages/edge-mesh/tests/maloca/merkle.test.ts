import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashLeaf, type Leaf, MerkleTree, mergeMerkleTrees } from '../../src/maloca/evidentia.js';

// ─── REFERENCIA LEGACY ─────────────────────────────────────────────────────
// Implementación del algoritmo PREVIO (node:crypto createHash) para verificar
// que la migración a Web Crypto produce EXACTAMENTE los mismos roots/pruebas.

function hashLeafLegacy(leaf: Leaf): string {
  return createHash('sha256').update(`${leaf.id}:${leaf.hash}:${leaf.timestamp}`).digest('hex');
}

function merkleRootLegacy(leaves: Leaf[]): string {
  if (leaves.length === 0) return '';
  let level = leaves.map(hashLeafLegacy);

  while (level.length > 1) {
    const nextLevel: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      if (i + 1 < level.length) {
        const left = level[i];
        const right = level[i + 1];
        const combined = left < right ? left + right : right + left;
        nextLevel.push(createHash('sha256').update(combined).digest('hex'));
      } else {
        const left = level[i];
        nextLevel.push(
          createHash('sha256')
            .update(left + left)
            .digest('hex'),
        );
      }
    }
    level = nextLevel;
  }

  return level[0];
}

// ─── FIXTURES ──────────────────────────────────────────────────────────────

const leaves: Leaf[] = [
  { id: 'a', hash: 'h-a', timestamp: 1000 },
  { id: 'b', hash: 'h-b', timestamp: 2000 },
  { id: 'c', hash: 'h-c', timestamp: 3000 },
  { id: 'd', hash: 'h-d', timestamp: 4000 },
  { id: 'e', hash: 'h-e', timestamp: 5000 },
];

// ─── TESTS ─────────────────────────────────────────────────────────────────

describe('MerkleTree (Web Crypto API)', () => {
  it('produce el MISMO root que la implementación node:crypto anterior (golden)', async () => {
    const tree = new MerkleTree(leaves);
    expect(await tree.getRoot()).toBe(merkleRootLegacy(leaves));
  });

  it('hashLeaf coincide con el hash legacy para cada leaf', async () => {
    for (const leaf of leaves) {
      expect(await hashLeaf(leaf)).toBe(hashLeafLegacy(leaf));
    }
  });

  it('es determinista: mismo input → mismo root', async () => {
    const t1 = new MerkleTree(leaves);
    const t2 = new MerkleTree(leaves);
    expect(await t1.getRoot()).toBe(await t2.getRoot());
  });

  it('árbol vacío → root vacío', async () => {
    const tree = new MerkleTree();
    expect(await tree.getRoot()).toBe('');
  });

  it('add() reconstruye y produce el root legacy esperado', async () => {
    const tree = new MerkleTree([leaves[0]]);
    const root1 = await tree.getRoot();
    expect(root1).toBe(merkleRootLegacy([leaves[0]]));

    await tree.add(leaves[1]);
    const root2 = await tree.getRoot();
    expect(root2).not.toBe(root1);
    expect(root2).toBe(merkleRootLegacy([leaves[0], leaves[1]]));
  });

  it('verify() valida la proof de getProof() y rechaza una leaf adulterada', async () => {
    const tree = new MerkleTree(leaves);
    const target = leaves[2];
    const proof = await tree.getProof(target);

    expect(proof.length).toBeGreaterThan(0);
    expect(await tree.verify(target, proof)).toBe(true);

    const tampered: Leaf = { ...target, hash: 'h-adulterado' };
    expect(await tree.verify(tampered, proof)).toBe(false);
  });

  it('getProof() de una leaf inexistente devuelve []', async () => {
    const tree = new MerkleTree(leaves);
    const proof = await tree.getProof({ id: 'zzz', hash: 'x', timestamp: 1 });
    expect(proof).toEqual([]);
  });

  it('raíz impar: self-pairing del nodo huérfano coincide con legacy', async () => {
    const unica: Leaf[] = [leaves[0]];
    const impar: Leaf[] = [leaves[0], leaves[1], leaves[2]];
    expect(await new MerkleTree(unica).getRoot()).toBe(merkleRootLegacy(unica));
    expect(await new MerkleTree(impar).getRoot()).toBe(merkleRootLegacy(impar));
  });
});

describe('mergeMerkleTrees (Web Crypto API)', () => {
  it('resuelve conflicto LWW (>5min) y no muta los árboles origen', async () => {
    const treeA = new MerkleTree([
      { id: '1', hash: 'same', timestamp: 1000 },
      { id: '2', hash: 'old', timestamp: 1000 },
    ]);
    const treeB = new MerkleTree([
      { id: '1', hash: 'same', timestamp: 1000 },
      { id: '2', hash: 'new', timestamp: 10_000_000 },
      { id: '3', hash: 'only-b', timestamp: 5000 },
    ]);

    const { mergedTree, conflictCount, resolvedLeaves, pendingLeaves } = await mergeMerkleTrees(treeA, treeB);

    expect(conflictCount).toBe(1);
    expect(resolvedLeaves).toHaveLength(1);
    expect(resolvedLeaves[0]?.hash).toBe('new');
    expect(pendingLeaves).toHaveLength(0);
    expect(mergedTree.getLeaves()).toHaveLength(3);

    // Atomicidad: los árboles origen quedan intactos
    expect(treeA.getLeaves()).toHaveLength(2);
    expect(treeB.getLeaves()).toHaveLength(3);
  });

  it('deja conflicto irresoluble (<5min) en pendingLeaves para governance vote', async () => {
    const treeA = new MerkleTree([{ id: 'x', hash: 'v1', timestamp: 1000 }]);
    const treeB = new MerkleTree([{ id: 'x', hash: 'v2', timestamp: 2000 }]);

    const { conflictCount, pendingLeaves, mergedTree } = await mergeMerkleTrees(treeA, treeB);

    expect(conflictCount).toBe(1);
    expect(pendingLeaves).toHaveLength(2);
    expect(mergedTree.getLeaves()).toHaveLength(0);
  });

  it('merge sin conflictos produce root determinista y firma con identity', async () => {
    const treeA = new MerkleTree(leaves.slice(0, 3));
    const treeB = new MerkleTree(leaves.slice(3));

    const { mergedTree, conflictCount } = await mergeMerkleTrees(treeA, treeB);

    expect(conflictCount).toBe(0);
    expect(await mergedTree.getRoot()).toBe(merkleRootLegacy(leaves));
    expect(mergedTree.signature).toBeUndefined();
  });
});
