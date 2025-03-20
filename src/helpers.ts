import { DateOrTimestamp } from "connectycube/types";

export const parseDate = (date: DateOrTimestamp): number | undefined => {
  if (typeof date === "string") {
    return new Date(date).getTime();
  } else if (typeof date === "number") {
    return date * 1000;
  }
  return undefined;
};
