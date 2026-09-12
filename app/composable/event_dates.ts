/** Date rules for events: what day and time an event is on, and whether it is over.
 *
 * Kept out of the screens so they can be exercised directly with
 * scripts/check_event_dates.ts.
 *
 * Every event is at Vedi, so its date and time mean Armenia wall-clock time.
 * Everything here is pinned to that offset rather than to the phone's timezone:
 * an event starting at 10:00 in Armenia shows as 10:00 on a phone still set to
 * London or Hong Kong, and lands on the right calendar day. The admin editor
 * pins to the same offset (XR-archaeology-server plugins/date.ts), so what is
 * typed there is exactly what is shown here.
 */
import moment from "moment";

/** Armenia is UTC+4 all year round (no daylight saving since 2012). */
export const EVENT_UTC_OFFSET_MINUTES = 4 * 60;

/** Shown beside event times so a visitor on another timezone knows what they mean. */
export const EVENT_TIMEZONE_LABEL = "Armenia time";

/** Safety valve for the day-by-day loop that builds calendar dots, so a record
 * spanning years cannot walk thousands of iterations and dot every visible day. */
export const MAX_EVENT_DAYS = 366;

type DateInput = Date | string | number | null | undefined;

/** A moment in Armenia time, or null for a missing or invalid value. */
export function eventMoment(value: DateInput): moment.Moment | null {
  if (value === null || value === undefined || value === "") return null;
  const m = moment.utc(value);
  return m.isValid() ? m.utcOffset(EVENT_UTC_OFFSET_MINUTES) : null;
}

/** The `YYYY-MM-DD` day an instant falls on in Armenia - the same shape as
 * react-native-calendars' day strings, so the two compare directly. */
export function eventDayString(value: DateInput): string | null {
  return eventMoment(value)?.format("YYYY-MM-DD") ?? null;
}

/** Every calendar day an event covers, in Armenia, bounded by MAX_EVENT_DAYS.
 *
 * A missing end means a single-day event. An end before the start, or an invalid
 * start, contributes no days rather than throwing.
 */
export function getEventDateStrings(start: DateInput, end?: DateInput): string[] {
  const from = eventMoment(start);
  if (!from) return [];
  const to = eventMoment(end) ?? from;
  if (to.format("YYYY-MM-DD") < from.format("YYYY-MM-DD")) return [];

  const days: string[] = [];
  const cursor = from.clone().startOf("day");
  const last = to.format("YYYY-MM-DD");
  while (days.length < MAX_EVENT_DAYS) {
    const day = cursor.format("YYYY-MM-DD");
    if (day > last) break;
    days.push(day);
    cursor.add(1, "day");
  }
  return days;
}

/** Every `YYYY-MM-DD` from a to b inclusive - for painting a selected range. */
export function dayStringsBetween(a: string, b: string): string[] {
  const days: string[] = [];
  const cursor = moment.utc(a, "YYYY-MM-DD", true);
  if (!cursor.isValid() || b < a) return days;
  while (days.length < MAX_EVENT_DAYS) {
    const day = cursor.format("YYYY-MM-DD");
    if (day > b) break;
    days.push(day);
    cursor.add(1, "day");
  }
  return days;
}

/** Does an event overlap the selected range (inclusive `YYYY-MM-DD` strings)?
 *
 * Overlap rather than containment, so a multi-day event still appears when the
 * range covers only part of it. Compares Armenia days, not phone-local days.
 */
export function eventOverlapsRange(eventStart: DateInput, eventEnd: DateInput, rangeStart: string, rangeEnd: string): boolean {
  const first = eventDayString(eventStart);
  if (!first) return false;
  const last = eventDayString(eventEnd) ?? first;
  return first <= rangeEnd && last >= rangeStart;
}

/** Has the event finished? Judged by its end, or its start when it has no end,
 * so an event that is on right now still counts as upcoming. */
export function isEventPast(event: { startDate?: DateInput; endDate?: DateInput }, now: Date = new Date()): boolean {
  const finish = eventMoment(event.endDate) ?? eventMoment(event.startDate);
  return !!finish && finish.valueOf() < now.getTime();
}

/** Split events into upcoming (soonest first) and past (most recent first). */
export function splitEventsByTime<T extends { startDate?: DateInput; endDate?: DateInput }>(
  events: T[],
  now: Date = new Date()
): { upcoming: T[]; past: T[] } {
  const byStart = (e: T) => eventMoment(e.startDate)?.valueOf() ?? 0;
  const upcoming = events.filter((e) => !isEventPast(e, now)).sort((a, b) => byStart(a) - byStart(b));
  const past = events.filter((e) => isEventPast(e, now)).sort((a, b) => byStart(b) - byStart(a));
  return { upcoming, past };
}

/** Group already-sorted events under month headings such as "July 2026",
 * keeping the incoming order within and between groups. */
export function groupEventsByMonth<T extends { startDate?: DateInput }>(events: T[]): { key: string; title: string; data: T[] }[] {
  const groups: { key: string; title: string; data: T[] }[] = [];
  for (const event of events) {
    const m = eventMoment(event.startDate);
    const key = m ? m.format("YYYY-MM") : "undated";
    const title = m ? m.format("MMMM YYYY") : "Date to be confirmed";
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.data.push(event);
    else groups.push({ key, title, data: [event] });
  }
  return groups;
}

/** Next range state for a tapped day.
 *
 * First tap sets the start. A second tap closes the range, unless it lands
 * before the start, in which case it becomes the new start. Tapping again once
 * a range is complete begins a fresh one.
 */
export function nextRange(
  current: { start: string | null; end: string | null },
  picked: string
): { start: string | null; end: string | null } {
  if (!current.start || (current.start && current.end)) return { start: picked, end: null };
  if (picked < current.start) return { start: picked, end: null };
  return { start: current.start, end: picked };
}
