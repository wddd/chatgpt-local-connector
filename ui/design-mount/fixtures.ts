import { baseFixtures } from './baseFixtures';
import { requestFixtures } from './requestFixtures';
import { taskFixtures } from './taskFixtures';
import { agentFixtures } from './agentFixtures';

// Keep all design records behind the single non-component Arc.fixtures export.
export const fixtures = {
  ...baseFixtures,
  requests: requestFixtures,
  tasks: taskFixtures,
  agentObjects: agentFixtures,
};
