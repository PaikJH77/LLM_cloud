import { mockBridge } from "./mock-bridge";
if (!window.planner) window.planner = mockBridge();
void import("../../apps/desktop/src/renderer/index");
