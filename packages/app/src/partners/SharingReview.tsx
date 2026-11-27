import { fullDate } from "../home.ts";

export function MatchingDate({ value }: { value: string }) {
  return <time dateTime={value}>{fullDate(new Date(value).toISOString().slice(0, 10))}</time>;
}
