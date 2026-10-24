import { createStore } from "./store";
export type TaskPurpose = "inherit" | "task" | "self-test";
export const taskPurposes = createStore<Record<string, TaskPurpose>>({});
export const taskPurposeKey = (agent: string, id: string) => JSON.stringify([agent, id]);
export function setTaskPurpose(agent: string, id: string, purpose: TaskPurpose) {
  taskPurposes.set(values => ({ ...values, [taskPurposeKey(agent, id)]: purpose }));
}
