import * as Y from 'yjs';

export class SyncEngine {
  public doc: Y.Doc;

  constructor(doc?: Y.Doc) {
    this.doc = doc || new Y.Doc();
  }

  public getUpdate(): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc);
  }

  public applyUpdate(update: Uint8Array, origin?: any): void {
    Y.applyUpdate(this.doc, update, origin);
  }

  public getStateVector(): Uint8Array {
    return Y.encodeStateVector(this.doc);
  }

  public getDiff(remoteStateVector: Uint8Array): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc, remoteStateVector);
  }
}
