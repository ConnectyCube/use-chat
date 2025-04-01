import { expect, test } from "vitest";
import { parseDate, getLastActivityText } from "../helpers";
import { describe } from "node:test";

describe("parseDate", () => {
  test("parseDate: parses timestamp to milliseconds", () => {
    expect(parseDate(1742458544)).toBe(1742458544000);
  });

  test("parseDate: parses ISO string to milliseconds", () => {
    expect(parseDate("Thu Mar 20 2025 10:15:44 GMT+0200 (Eastern European Standard Time)")).toBe(1742458544000);
  });
});

describe("getLastActivityText", () => {
  test("getLastActivityText: returns 'Online' for 0-30 seconds", () => {
    expect(getLastActivityText(0)).toBe("Online");
    expect(getLastActivityText(15)).toBe("Online");
    expect(getLastActivityText(30)).toBe("Online");
  });

  test("getLastActivityText: returns 'Last seen X minutes ago' for 31-3599 seconds", () => {
    expect(getLastActivityText(31)).toBe("Last seen 1 minutes ago");
    expect(getLastActivityText(60)).toBe("Last seen 1 minutes ago");
    expect(getLastActivityText(333)).toBe(`Last seen ${Math.ceil(333 / 60)} minutes ago`);
    expect(getLastActivityText(3599)).toBe(`Last seen ${Math.ceil(3599 / 60)} minutes ago`);
  });

  test("getLastActivityText: returns 'Last seen X hours ago' for 1-24 hours", () => {
    expect(getLastActivityText(3600)).toBe("Last seen 1 hours ago");
    expect(getLastActivityText(7200)).toBe("Last seen 2 hours ago");
    expect(getLastActivityText(86399)).toBe(`Last seen ${Math.ceil(86399 / 3600)} hours ago`);
  });

  test("getLastActivityText: returns 'Last seen DD/MM/YYYY' for more than 24 hours", () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 86400 * 1000);
    const expectedDate = `${yesterday.getUTCDate()}/${(yesterday.getMonth() + 1)
      .toString()
      .padStart(2, "0")}/${yesterday.getFullYear()}`;

    expect(getLastActivityText(86400)).toBe(`Last seen ${expectedDate}`);
  });
});
