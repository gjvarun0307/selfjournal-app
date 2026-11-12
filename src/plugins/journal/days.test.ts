process.env.TZ = "Europe/London";

import { dayKey, dayLabel, shiftDay } from "./days";

describe("days", () => {
  it("shifts across the spring DST change", () => {
    expect(shiftDay("2026-03-28", 1)).toBe("2026-03-29");
    expect(shiftDay("2026-03-29", 1)).toBe("2026-03-30");
  });
  it("shifts across the autumn DST change", () => {
    expect(shiftDay("2026-10-24", 1)).toBe("2026-10-25");
    expect(shiftDay("2026-10-25", 1)).toBe("2026-10-26");
    expect(shiftDay("2026-10-26", -1)).toBe("2026-10-25");
  });
  it("crosses year boundaries", () => {
    expect(shiftDay("2026-01-01", -1)).toBe("2025-12-31");
  });
  it("formats a local date as a key", () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
  it("labels today and yesterday", () => {
    expect(dayLabel("2026-05-10", "2026-05-10")).toBe("Today");
    expect(dayLabel("2026-05-09", "2026-05-10")).toBe("Yesterday");
  });
  it("labels other days, adding the year when it differs", () => {
    expect(dayLabel("2026-05-01", "2026-05-10")).not.toMatch(/2026/);
    expect(dayLabel("2025-05-01", "2026-05-10")).toMatch(/2025/);
  });
});
