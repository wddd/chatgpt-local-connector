// Management projections for docs/dev/accounts.md. Keep wire assumptions here.
export type AccountKind = 'claude' | 'codex' | 'api-key' | 'detect';
export type AccountProfile = { agent: string; profileId: string; kind: 'cli-profile' | 'codex-home' | 'api-key'; state: 'signed-in' | 'signed-out' | 'unfinished' | 'invalid'; default: boolean };
export type Account = {
  id: string; provider: 'anthropic' | 'openai' | 'deepseek' | 'other'; identityKey: string; alias: string;
  email?: string; orgName?: string; plan?: string; createdAt: string; observedAt: string;
  sources: string[]; agentProfiles: AccountProfile[];
  notifications: { state: 'verified' | 'not-bound' | 'mcp-events' | 'n/a'; sessions: { id: string; name: string; lastDelivery?: string }[] };
  quota: { windows: { id: string; label: string; usedPercent: number; resetsAt?: string }[] };
};
export type AccountLogin = { loginId: string; state: 'starting' | 'waiting' | 'completed' | 'failed' | 'cancelled'; loginUrl?: string; accountId?: string; matchedExisting?: boolean; error?: string };
export type AccountBrowser = { id: string; name: string };
