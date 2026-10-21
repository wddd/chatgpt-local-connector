export interface CoreSnapshot {
  chatgpt?: { code: string; verifiedAt: string | null; challengeVerifiedAt?: string | null };
  desktop?: { supported: boolean; state: string; message: string };
  eventStorageError?: string | null;
  version: string;
  pid: number;
  package: { sha: string; version: string };
  backendSession: string;
  activeTurns: number;
  activeWrites: number;
  pendingInteractions: number;
  liveProcesses: number;
  uncertain: boolean;
  draining: boolean;
  appServer: {
    state: string;
    observedAt: string | null;
    evidence: string;
    stale: boolean;
    error?: { code: string; stage: string };
  };
  account: { state: string; observedAt: string | null };
  transport?: { state: string; error?: string };
  logs?: string[];
  lastInbound: string | null;
  toolCount: number;
  registered: boolean;
  schemaDiscovered: string;
  operationVerified: string;
}

export type AgentPhase = "thinking" | "command" | "file" | "tool" | "text" | "interaction" | "idle";
export interface AgentInteraction {
  kind: "permission" | "question";
  summary: string;
  respond: { via?: "act"; op?: "agent_respond" | "codex_respond"; args?: Record<string, unknown>; hint?: string };
  command?: string | null;
  path?: string | null;
  title?: string | null;
  options?: unknown;
  canRespond?: boolean;
  method?: "select" | "confirm" | "input" | "editor";
}
export interface AgentActivitySession {
  id: string;
  source: "arc-task" | "codex-thread" | "transcript";
  nativeSessionId?: string;
  title?: string;
  project?: string | null;
  phase: AgentPhase;
  headline: string;
  startedAt?: string | null;
  phaseSince: string | null;
  interaction?: AgentInteraction;
  timeline: boolean;
  open?: { kind: "url" | "agent-session"; target: string };
}
export interface AgentActivitySnapshot {
  observedAt: string;
  activeAgents: string[];
  agents: Record<string, { sessions: AgentActivitySession[] }>;
}
export interface AgentTimelineEntry {
  id: string;
  type: "user" | "text" | "thinking" | "command" | "file" | "tool" | "plan" | "interaction" | "error";
  status: "pending" | "running" | "completed" | "failed" | "cancelled" | "unknown";
  startedAt: string | null;
  updatedAt: string;
  position?: number;
  durationMs?: number;
  endedAt?: string | null;
  cursor: number;
  turnId: string;
  text?: string;
  title?: string;
  command?: string;
  cwd?: string;
  path?: string | null;
  operation?: "read" | "write" | "edit" | "create";
  exitCode?: number;
  exitCodeSource?: "rawOutput" | "output";
  input?: AgentTrackingExcerpt;
  output?: AgentTrackingExcerpt;
  plan?: { content: AgentTrackingExcerpt; status: string; priority?: string | null }[];
  changes?: { path: string; operation: "create" | "edit" | null }[];
  interaction?: AgentInteraction;
  truncated?: boolean;
}
export interface AgentTrackingExcerpt {
  state: "available";
  text: string;
  truncated: boolean;
  sha256: string;
  hashScope: "excerpt";
}
export interface AgentTimeline {
  status?: string;
  sessionId: string;
  entries: AgentTimelineEntry[];
  cursor: number;
  coverage: { state: "complete" | "partial"; truncated: boolean };
  executionEvidence: boolean | "partial";
}
