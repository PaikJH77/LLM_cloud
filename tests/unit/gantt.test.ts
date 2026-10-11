import { it, expect } from "vitest";
import {
  moveRange,
  resizeRange,
} from "../../apps/desktop/src/renderer/tasks/gantt-geometry";
it("keeps inclusive duration through month/leap boundaries and rejects reverse resizing", () => {
  expect(moveRange("2028-02-28", "2028-03-01", 1)).toEqual({
    start: "2028-02-29",
    end: "2028-03-02",
  });
  expect(resizeRange("2028-02-28", "2028-03-01", "start", 1)).toEqual({
    start: "2028-02-29",
    end: "2028-03-01",
  });
  expect(() => resizeRange("2028-02-28", "2028-03-01", "end", -3)).toThrow();
});
import { axisDate } from "../../apps/desktop/src/renderer/tasks/gantt-geometry";
it("clamps chart margins to the supported calendar without crashing valid tasks", () => {
  expect(axisDate("0001-01-01", -3)).toBe("0001-01-01");
  expect(axisDate("9999-12-31", 8)).toBe("9999-12-31");
});
