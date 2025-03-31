import { DateOrTimestamp } from "connectycube/types";

export const parseDate = (date: DateOrTimestamp): number | undefined => {
  if (typeof date === "string") {
    return new Date(date).getTime();
  } else if (typeof date === "number") {
    return date * 1000;
  }
  return undefined;
};

export const getLastActivityText = (seconds: number): string => {
  let status: string;

  if (seconds <= 30) {
    status = "Online";
  } else if (seconds < 3600) {
    const minutesAgo = Math.ceil(seconds / 60);
    status = `Last seen ${minutesAgo} minutes ago`;
  } else {
    const hoursAgo = Math.ceil(seconds / 3600);
    const currentHour = new Date().getHours();

    if (currentHour - hoursAgo <= 0) {
      const lastLoggedInTime = new Date(Date.now() - seconds * 1000);
      const day = lastLoggedInTime.getUTCDate();
      const month = lastLoggedInTime.getMonth() + 1;
      const year = lastLoggedInTime.getFullYear();
      status = `Last seen ${day}/${month.toString().padStart(2, "0")}/${year}`;
    } else {
      status = `Last seen ${hoursAgo} hours ago`;
    }
  }

  return status;
};
