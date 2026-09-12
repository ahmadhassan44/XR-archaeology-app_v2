/** Exercises the events date rules against the real helpers.
 *
 * Run under more than one timezone - results must not depend on the phone's:
 *   TZ=Asia/Shanghai npx tsx ./scripts/check_event_dates.ts
 *   TZ=UTC           npx tsx ./scripts/check_event_dates.ts
 *
 * There is no test runner in this project, so this is a plain script that
 * exits non-zero on failure.
 */
import {
  MAX_EVENT_DAYS,
  dayStringsBetween,
  eventDayString,
  eventMoment,
  eventOverlapsRange,
  getEventDateStrings,
  groupEventsByMonth,
  isEventPast,
  nextRange,
  splitEventsByTime,
} from "../app/composable/event_dates";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures += 1;
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${ok ? "" : `\n         expected ${e}\n         actual   ${a}`}`);
}

console.log(`\nprocess timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);

console.log("\n--- times are Armenia wall-clock, whatever the phone is set to ---");
// The admin stores 10:45 Armenia time as 06:45 UTC.
check("10:45 in Armenia shows as 10:45", eventMoment("2026-07-03T06:45:00.000Z")!.format("HH:mm"), "10:45");
check("minutes are minutes, not the month", eventMoment("2026-11-03T06:33:00.000Z")!.format("HH:mm"), "10:33");
check("late-evening Armenia event keeps its day", eventDayString("2026-07-03T19:30:00.000Z"), "2026-07-03");
check("just-after-midnight Armenia event is on the next day", eventDayString("2026-07-03T20:15:00.000Z"), "2026-07-04");
check("invalid and missing values give null", [eventMoment("nope"), eventMoment(null), eventMoment("")], [null, null, null]);

console.log("\n--- calendar markers ---");
check("single-day event marks one day", getEventDateStrings("2026-07-01T06:00:00Z", "2026-07-01T18:00:00Z"), ["2026-07-01"]);
check("three-day event marks three days", getEventDateStrings("2025-11-15T06:00:00Z", "2025-11-17T15:00:00Z"), [
  "2025-11-15",
  "2025-11-16",
  "2025-11-17",
]);
check("missing end marks only the start", getEventDateStrings("2026-07-12T06:00:00Z", null), ["2026-07-12"]);
check("reversed range marks nothing", getEventDateStrings("2026-07-05T06:00:00Z", "2026-07-01T06:00:00Z"), []);
check("invalid start marks nothing", getEventDateStrings("not-a-date", "2026-07-01T06:00:00Z"), []);
check("a two-year record is capped", getEventDateStrings("2025-01-01T06:00:00Z", "2027-01-01T06:00:00Z").length, MAX_EVENT_DAYS);
check("selected range paints every day", dayStringsBetween("2026-07-30", "2026-08-02"), ["2026-07-30", "2026-07-31", "2026-08-01", "2026-08-02"]);

console.log("\n--- range filtering ---");
const rs = "2026-07-01";
const re = "2026-07-31";
check("event inside the range is shown", eventOverlapsRange("2026-07-03T05:00:00Z", "2026-07-03T13:00:00Z", rs, re), true);
check("event before the range is hidden", eventOverlapsRange("2026-06-01T05:00:00Z", "2026-06-02T05:00:00Z", rs, re), false);
check("event after the range is hidden", eventOverlapsRange("2026-08-01T05:00:00Z", "2026-08-02T05:00:00Z", rs, re), false);
check("event straddling the start is shown", eventOverlapsRange("2026-06-28T05:00:00Z", "2026-07-02T05:00:00Z", rs, re), true);
check("event straddling the end is shown", eventOverlapsRange("2026-07-30T05:00:00Z", "2026-08-05T05:00:00Z", rs, re), true);
check("20:30 UTC on 30 June is 1 July in Armenia, so it is in range", eventOverlapsRange("2026-06-30T20:30:00Z", null, rs, re), true);

console.log("\n--- past and upcoming ---");
const now = new Date("2026-09-12T08:00:00Z");
check("finished yesterday is past", isEventPast({ startDate: "2026-09-11T06:00:00Z", endDate: "2026-09-11T15:00:00Z" }, now), true);
check("on right now is not past", isEventPast({ startDate: "2026-09-12T04:00:00Z", endDate: "2026-09-12T14:00:00Z" }, now), false);
check("tomorrow is not past", isEventPast({ startDate: "2026-09-13T06:00:00Z" }, now), false);
check("no end: judged by its start", isEventPast({ startDate: "2026-09-10T06:00:00Z" }, now), true);
check("no dates at all is never past", isEventPast({}, now), false);

const events = [
  { name: "Old", startDate: "2024-02-25T12:00:00Z", endDate: "2024-02-26T12:00:00Z" },
  { name: "Soon", startDate: "2026-09-20T06:00:00Z", endDate: "2026-09-20T14:00:00Z" },
  { name: "Summer", startDate: "2026-07-03T05:00:00Z", endDate: "2026-07-03T13:00:00Z" },
  { name: "Now", startDate: "2026-09-12T04:00:00Z", endDate: "2026-09-12T14:00:00Z" },
  { name: "Autumn", startDate: "2025-11-15T06:00:00Z", endDate: "2025-11-18T15:00:00Z" },
  { name: "July", startDate: "2026-07-12T06:00:00Z", endDate: "2026-07-12T18:00:00Z" },
];
const { upcoming, past } = splitEventsByTime(events, now);
check("upcoming is soonest first, includes what is on now", upcoming.map((e) => e.name), ["Now", "Soon"]);
check("past is most recent first", past.map((e) => e.name), ["July", "Summer", "Autumn", "Old"]);

console.log("\n--- past list grouped by month ---");
const groups = groupEventsByMonth(past);
check("month headings in order", groups.map((g) => g.title), ["July 2026", "November 2025", "February 2024"]);
check("two July events share one heading", groups[0].data.map((e) => e.name), ["July", "Summer"]);
check("undated events get their own heading", groupEventsByMonth([{ startDate: null }]).map((g) => g.title), ["Date to be confirmed"]);

console.log("\n--- range selection ---");
check("first tap sets the start", nextRange({ start: null, end: null }, "2026-07-10"), { start: "2026-07-10", end: null });
check("second tap closes the range", nextRange({ start: "2026-07-10", end: null }, "2026-07-14"), { start: "2026-07-10", end: "2026-07-14" });
check("earlier second tap restarts from that day", nextRange({ start: "2026-07-10", end: null }, "2026-07-04"), { start: "2026-07-04", end: null });
check("tapping a complete range starts a new one", nextRange({ start: "2026-07-10", end: "2026-07-14" }, "2026-07-20"), {
  start: "2026-07-20",
  end: null,
});

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
