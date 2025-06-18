import { expect, test } from "vitest";
import { parseDate, getLastActivityText, getDialogTimestamp } from "../helpers";
import { describe } from "node:test";
import { LastMessageMessageStatus } from "connectycube/types";

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

describe("getDialogTimestamp", () => {
  const mockDialog = {
    _id: "some-id",
    name: "some name",
    description: null,
    xmpp_room_jid: null,
    type: 3,
    photo: null,
    user_id: 1234567,
    admins_ids: [1234567],
    occupants_ids: [1234567, 1234568],
    created_at: "2025-01-04T17:46:00.000Z",
    updated_at: "2025-01-04T17:46:04.000Z",
    last_message: "Hey All",
    last_message_date_sent: 1736012764,
    last_message_id: "last-message-id",
    last_message_user_id: 1234567,
    last_message_status: LastMessageMessageStatus.SENT,
    unread_messages_count: 0,
  };

  test("getDialogTimestamp: returns timestamp from [dialog.last_message_date_sent] if valid", () => {
    const dialog = { ...mockDialog };
    expect(getDialogTimestamp(dialog)).toBe(1736012764000);
  });

  test("getDialogTimestamp: returns timestamp from [dialog.updated_at] if [dialog.last_message_date_sent] is invalid", () => {
    const dialog = { ...mockDialog, last_message_date_sent: undefined };
    expect(getDialogTimestamp(dialog)).toBe(new Date(mockDialog.updated_at).getTime());
  });

  test("getDialogTimestamp: returns timestamp from [dialog.created_at] if [dialog.last_message_date_sent] and [dialog.updated_at] are invalid", () => {
    const dialog = { ...mockDialog, last_message_date_sent: undefined, updated_at: "invalid" };
    expect(getDialogTimestamp(dialog)).toBe(new Date(mockDialog.created_at).getTime());
  });

  test("getDialogTimestamp: returns 0 if all date fields are invalid", () => {
    const dialog = { ...mockDialog, last_message_date_sent: undefined, created_at: "invalid", updated_at: "invalid" };
    expect(getDialogTimestamp(dialog)).toBe(0);
  });
});
