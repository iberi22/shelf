// ─── MALOCA BRIDGE ─────────────────────────────────────────────────────────
// Puente de adaptadores Maloca (salud, veeduría, xavier) sobre edge-mesh.
// SHELF-215 D2: scaffold del package separado desde edge-mesh.
// Ver docs/ADR-maloca-split.md para el plan completo del split.

export { CitaMeshAdapter } from './adapters/maloca-salud/citas-distribuidas.js';
export { EPSBridge } from './adapters/maloca-salud/eps-bridge.js';
export { PerfilPacienteAdapter } from './adapters/maloca-salud/patient-profile.js';
export * from './adapters/maloca-salud/types.js';
export { ContractBridge } from './adapters/maloca-veeduria/contract-bridge.js';
export { EvidentiaVeeduria } from './adapters/maloca-veeduria/evidentia-veeduria.js';
export { LicitanteProfileAdapter } from './adapters/maloca-veeduria/licitante-profile.js';
export * from './adapters/maloca-veeduria/types.js';
export type { AgentProfile } from './adapters/maloca-xavier/agent-profile.js';
export { AgentProfileAdapter } from './adapters/maloca-xavier/agent-profile.js';
export type { CodeGraphEntry } from './adapters/maloca-xavier/codegraph-bridge.js';
export { CodeGraphAdapter } from './adapters/maloca-xavier/codegraph-bridge.js';
export type { PromptRouteResponse } from './adapters/maloca-xavier/llm-router.js';
export { LLMRouterAdapter } from './adapters/maloca-xavier/llm-router.js';
