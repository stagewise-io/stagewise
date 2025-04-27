import TimeAgo from "javascript-time-ago";
// English.
import en from "javascript-time-ago/locale/en";
import { useMemo, useRef } from "preact/hooks";

TimeAgo.addDefaultLocale(en);

export function useTimeAgo(date: Date) {
  const timeAgoRef = useRef(new TimeAgo("en-US"));

  const timeAgoString = useMemo(() => timeAgoRef.current.format(date), [date]);

  return timeAgoString;
}
