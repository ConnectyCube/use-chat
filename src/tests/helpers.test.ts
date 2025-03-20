import { expect, test } from "vitest";
import { parseDate } from "../helpers";

test("adds 1 + 2 to equal 3", () => {
  expect(parseDate(1742458544)).toBe(1742458544000);
  expect(parseDate("Thu Mar 20 2025 10:15:44 GMT+0200 (Eastern European Standard Time)")).toBe(1742458544000);
});
