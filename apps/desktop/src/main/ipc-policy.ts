import { z } from "zod";
import {
  commandSchema,
  filterSchema,
  operationSchema,
} from "../../../../packages/core/src/contracts";
export function validateCaller(c: {
  senderId: number;
  expectedId: number;
  isMainFrame: boolean;
  url: string;
  expectedUrl: string;
}) {
  if (c.senderId !== c.expectedId || !c.isMainFrame || c.url !== c.expectedUrl)
    throw new Error("Forbidden IPC sender");
}
const draftFields = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("project"),
    name: z.string(),
    deadline: z.string(),
  }),
  z.strictObject({
    kind: z.literal("task"),
    taskId: z.uuid(),
    name: z.string(),
    start: z.string(),
    end: z.string(),
    progress: z.string(),
  }),
  z.strictObject({ kind: z.literal("operation"), operation: operationSchema }),
]);
const draft = z.strictObject({
  principalKey: z.string(),
  projectId: z.uuid(),
  base: z.unknown(),
  editedFields: draftFields,
  command: commandSchema.nullable(),
  phase: z.enum(["editing", "prepared", "unknown", "conflict"]),
  savedLocallyAt: z.iso.datetime(),
});
const schemas: Record<string, z.ZodType> = {
  login: z.undefined(),
  session: z.undefined(),
  logout: z.enum(["keep", "discard"]),
  listProjects: filterSchema,
  getProject: z.uuid(),
  mutate: commandSchema,
  requestStatus: z.uuid(),
  saveDraft: draft,
  loadDrafts: z.undefined(),
  removeDraft: z.uuid(),
  protection: z.undefined(),
};
export function validateCall(method: string, payload: unknown) {
  const schema = schemas[method];
  if (!schema) throw new Error("Unsupported IPC method");
  return schema.parse(payload);
}
