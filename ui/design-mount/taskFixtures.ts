import type { TrackedActivity } from '../state/activityModel';
import type { TaskRecord } from '../state/tasks';
import type { AgentTimeline } from '../types';
import { requestFixtures } from './requestFixtures';

const now = Date.UTC(2026, 0, 1);
const session: TrackedActivity = { id: 'design-task', source: 'arc-task', phase: 'thinking', phaseSince: null,
  title: 'Inspect task presentation', headline: 'Review the recorded evidence', project: '/sample/project',
  startedAt: '2025-12-31T23:58:00Z', turnStartedAt: '2025-12-31T23:59:00Z', turnId: 'current', turnCount: 2,
  orderAt: now - 120_000, timeline: true, open: { taskId: 'design-task' },
  dispatchSummary: { model: 'claude-opus-5-5', effort: 'medium', controlSource: { kind: 'Claude', label: 'Recorded source' } },
};
const receipt: TaskRecord = { requestId: 'design-receipt', threadId: 'design-task', agent: 'codex',
  state: 'completed', createdAt: '2025-12-31T23:58:00Z', updatedAt: '2025-12-31T23:59:00Z',
  approval: { decision: 'approved', source: 'local', at: '2025-12-31T23:58:00Z' },
  task: { kind: 'create', title: 'Recorded dispatch', prompt: 'Inspect the task adapters and preserve recorded values.', project: '/sample/project', input: null, settings: {}, model: 'gpt-6.1-sol', effort: 'high' },
};
const timeline: AgentTimeline = { sessionId: session.id, cursor: 1, executionEvidence: 'partial', entries: [requestFixtures.secretReceipt], status: 'failed',
  coverage: { state: 'partial', truncated: false }, readOnly: true,
  dispatchSummary: { model: 'current-must-not-leak', serviceTier: 'priority' },
  turnDispatchSummaries: { older: { model: '["magpie","opencode-go/deepseek-v4.1-flash"]', effort: 'max' } },
};
export const taskFixtures = { now, session, receipt, timeline };
