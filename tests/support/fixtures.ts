import { randomUUID } from "node:crypto";
import type {
  Command,
  Principal,
  Operation,
  Snapshot,
  MutationResult,
} from "../../packages/core/src/model";
export const owner: Principal = {
  ownerId: "11111111-1111-4111-8111-111111111111",
  issuer: "https://test.invalid",
  subject: "owner",
};
export const other: Principal = {
  ownerId: "22222222-2222-4222-8222-222222222222",
  issuer: "https://test.invalid",
  subject: "other",
};
export function command(
  projectId: string,
  expectedVersion: number,
  operation: Operation,
): Command {
  return { requestId: randomUUID(), projectId, expectedVersion, operation };
}
export function applied(result: MutationResult): Snapshot {
  if (result.kind !== "applied") throw new Error(JSON.stringify(result));
  return result.snapshot;
}
export const dbUrl =
  "postgresql://planner_test:isolated-test-only@127.0.0.1:55432/planner_test";
