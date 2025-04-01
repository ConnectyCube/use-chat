import { DateOrTimestamp } from "connectycube/types";

export const parseDate = (date: DateOrTimestamp): number | undefined => {
  let result: number | undefined;

  if (typeof date === "string") {
    const t = new Date(date).getTime();
    result = isNaN(t) ? undefined : t;
  } else if (typeof date === "number") {
    result = date * 1000;
  }

  return result;
};

export const getLastActivityText = (seconds: number): string => {
  let status: string;

  const MINUTE_IN_SEC = 60;
  const HOUR_IN_SEC = 3600;
  const DAY_IN_SEC = 86400;
  const ONLINE_IN_SEC = MINUTE_IN_SEC / 2;

  if (seconds <= ONLINE_IN_SEC) {
    status = "Online";
  } else if (seconds < HOUR_IN_SEC) {
    status = `Last seen ${Math.ceil(seconds / MINUTE_IN_SEC)} minutes ago`;
  } else if (seconds < DAY_IN_SEC) {
    status = `Last seen ${Math.ceil(seconds / HOUR_IN_SEC)} hours ago`;
  } else {
    const lastLoggedInTime = new Date(Date.now() - seconds * 1000);
    const day = lastLoggedInTime.getUTCDate();
    const month = (lastLoggedInTime.getMonth() + 1).toString().padStart(2, "0");
    const year = lastLoggedInTime.getFullYear();
    status = `Last seen ${day}/${month}/${year}`;
  }

  return status;
};
