import { describe, it, expect } from "vitest";
import { formatDuration } from "./duration.js";

describe("formatDuration", () => {
  it.each([
    [40, "40 s"],
    [59, "59 s"],
    [60, "1 min"],
    [2700, "45 min"],
    // Rounds to the nearest minute before splitting, so 59:40 is an hour.
    [3580, "1 h"],
    [3900, "1 h 5 min"],
    [7200, "2 h"],
  ])("%i s reads as %s", (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
});
