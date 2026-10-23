export interface NofileLimits {
  state: "available" | "unknown" | "not_applicable";
  soft: number | "unlimited" | null;
  hard: number | "unlimited" | null;
  source: "self-measured" | "inherited-at-spawn" | "child-measured" | "unavailable";
  observedAt: string | null;
  error: string | null;
  measurementError?: string;
}
export interface ResourceSnapshot {
  state: "ok" | "degraded" | "pressure" | "unknown" | "not_applicable";
  nofile: NofileLimits;
  startup?: {
    targetSoft: number;
    original: NofileLimits;
    actual: NofileLimits;
    attemptedSoft: number | null;
    platformCeiling: number | null;
    state: string;
    reasons: string[];
    observedAt: string;
  };
  fd?: { state: string; count: number | null; sampledAt: string | null; attemptedAt: string | null; error: string | null };
  usageRatio?: number | null;
  warningRatio?: number;
}
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
  resources: ResourceSnapshot;
  appServer: {
    state: string;
    pid: number | null;
    startedAt: string | null;
    resources: ResourceSnapshot;
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
export interface DispatchSummary {
  controlSource?: { id?: string; label?: string; kind?: string };
  model?: string;
  effort?: string;
  serviceTier?: string;
}
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
  turnCount?: number;
  projectName?: string | null;
  dispatchSummary?: DispatchSummary;
  origin?: { ingressId?: string; controlSource?: string };
  id: string;
  source: "arc-task" | "codex-thread" | "transcript";
  turnId?: string | null;
  nativeSessionId?: string;
  title?: string;
  project?: string | null;
  phase: AgentPhase;
  headline: string;
  fallbackHeadline?: string;
  recentContent?: string[];
  recentSteps?: Exclude<AgentPhase, "idle">[];
  startedAt?: string | null;
  turnStartedAt?: string | null;
  phaseSince: string | null;
  interaction?: AgentInteraction;
  timeline: boolean;
  open?: { taskId: string };
}
export interface AgentActivitySnapshot {
  observedAt: string;
  activeAgents: string[];
  agents: Record<string, { sessions: AgentActivitySession[] }>;
}
export interface AgentConversation {
  dispatchSummary?: DispatchSummary | null;
  turnCount?: number | null;
  projectName?: string | null;
  id: string;
  source: "arc-task" | "codex-thread";
  status?: string | null;
  title?: string | null;
  project?: string | null;
  createdAt: string | null;
  nativeSessionId?: string | null;
  open?: AgentActivitySession["open"];
}
export interface AgentConversationPage {
  data: AgentConversation[];
  nextCursor: string | null;
  scope: "native-unarchived" | "arc-tasks";
}
export interface AgentTimelineEntry {
  phase?: string;
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
export interface TurnTiming {
  startedAt?: string | null;
  endedAt?: string | null;
}
export interface AgentTimeline {
  turnTimings?: Record<string, TurnTiming>;
  projectName?: string | null;
  dispatchSummary?: DispatchSummary;
  turnDispatchSummaries?: Record<string, DispatchSummary>;
  turnStatuses?: Record<string, string>;
  readOnly?: boolean;
  status?: string;
  sessionId: string;
  entries: AgentTimelineEntry[];
  cursor: number;
  coverage: { state: "complete" | "partial"; truncated: boolean };
  executionEvidence: boolean | "partial";
}
