import { AppBar, EventItem, LoadingPage, MainBody, NAVBAR_HEIGHT } from "@/components";
import { SortIcon } from "@/components/icons";
import { Event } from "@/models";
import { Paginated, useFeathers } from "@/providers/feathers_provider";
import { useAppTheme, AppTheme } from "@/providers/style_provider";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, SectionList, StyleSheet, TouchableOpacity, View } from "react-native";
import { Calendar, CalendarUtils, DateData } from "react-native-calendars";
import { MarkedDates } from "react-native-calendars/src/types";
import { Button, Text } from "react-native-paper";
import { useLocation } from "@/hooks/useLocation";
import { calculateDistance } from "@/plugins/utils";
import { useLocalizedText } from "@/hooks/useLocalizedText";
import {
  dayStringsBetween,
  eventOverlapsRange,
  getEventDateStrings,
  groupEventsByMonth,
  nextRange,
  splitEventsByTime,
} from "@/app/composable/event_dates";

type Tab = "upcoming" | "past";

export default function Page() {
  const feathers = useFeathers();
  const { theme } = useAppTheme();
  const style = useStyle({ theme });
  const localize = useLocalizedText();
  const [loaded, setLoaded] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [isSorted, setIsSorted] = useState(false);
  const [tab, setTab] = useState<Tab>("upcoming");
  const { location: userLocation } = useLocation();

  const initDate = CalendarUtils.getCalendarDateString(new Date());
  const minDate = initDate;

  /** The chosen range. `end` stays null until a second day is picked. */
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const hasRange = !!startDate && !!endDate;

  /** Events we are willing to show at all: a record with no name in any
   * language renders as a blank card, so it is left out everywhere. */
  const displayableEvents = useMemo(
    () => events.filter((event) => !!(typeof event.name === "string" ? event.name : localize(event.name))?.trim()),
    [events, localize]
  );

  /** Upcoming (including anything on right now) and past, split by end time. */
  const { upcoming, past } = useMemo(() => splitEventsByTime(displayableEvents), [displayableEvents]);
  const pastSections = useMemo(() => groupEventsByMonth(past), [past]);

  const markedDates: MarkedDates = useMemo(() => {
    const marks: MarkedDates = {};

    // Dots only for days with an upcoming event: past days cannot be picked.
    upcoming.forEach((event) => {
      getEventDateStrings(event.startDate, event.endDate).forEach((day) => {
        marks[day] = { ...(marks[day] ?? {}), marked: true, dotColor: theme.colors.primary };
      });
    });

    // The selected range painted on top.
    if (startDate) {
      const days = dayStringsBetween(startDate, endDate ?? startDate);
      days.forEach((day, index) => {
        marks[day] = {
          ...(marks[day] ?? {}),
          color: theme.colors.primary,
          textColor: theme.colors.textOnPrimary,
          startingDay: index === 0,
          endingDay: index === days.length - 1,
        };
      });
    }

    return marks;
  }, [upcoming, startDate, endDate, theme]);

  const shownEvents = useMemo(() => {
    // Nothing is listed until a full range is chosen - the empty state explains
    // why, rather than silently showing every event.
    if (!hasRange) return [];

    let filtered = upcoming.filter((event) => eventOverlapsRange(event.startDate, event.endDate, startDate!, endDate!));

    if (isSorted && userLocation) {
      filtered = [...filtered].sort((a, b) => {
        const aLat = a.latitude || (typeof a.venue !== "string" && a.venue?.latitude);
        const aLon = a.longitude || (typeof a.venue !== "string" && a.venue?.longitude);
        const bLat = b.latitude || (typeof b.venue !== "string" && b.venue?.latitude);
        const bLon = b.longitude || (typeof b.venue !== "string" && b.venue?.longitude);

        if (!aLat || !aLon) return 1;
        if (!bLat || !bLon) return -1;

        const distA = calculateDistance(userLocation.latitude, userLocation.longitude, aLat as number, aLon as number);
        const distB = calculateDistance(userLocation.latitude, userLocation.longitude, bLat as number, bLon as number);
        return distA - distB;
      });
    }

    return filtered;
  }, [hasRange, startDate, endDate, upcoming, isSorted, userLocation]);

  const onDayPress = useCallback(
    (day: DateData) => {
      const next = nextRange({ start: startDate, end: endDate }, day.dateString);
      setStartDate(next.start);
      setEndDate(next.end);
    },
    [startDate, endDate]
  );

  const resetDates = useCallback(() => {
    setStartDate(null);
    setEndDate(null);
  }, []);

  const rangeLabel = useMemo(() => {
    if (!startDate) return "Select a start date";
    if (!endDate) return `${startDate}  →  select an end date`;
    return `${startDate}  →  ${endDate}`;
  }, [startDate, endDate]);

  useEffect(() => {
    async function init() {
      try {
        const res: Paginated<Event> = await feathers.service("events").find({ query: { $sort: "startDate,order" } });
        setEvents(res.data);
      } finally {
        setLoaded(true);
      }
    }
    init();
  }, []);

  const listPadding = {
    flexGrow: 1,
    paddingTop: theme.spacing.lg,
    paddingBottom: NAVBAR_HEIGHT + theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
  };

  function renderTabs() {
    const tabs: { key: Tab; label: string; count: number }[] = [
      { key: "upcoming", label: "Upcoming", count: upcoming.length },
      { key: "past", label: "Past", count: past.length },
    ];
    return (
      <View style={style.segmentTrack} accessibilityRole="tablist">
        {tabs.map(({ key, label, count }) => {
          const active = tab === key;
          return (
            <Pressable
              key={key}
              onPress={() => setTab(key)}
              style={[style.segment, active && style.segmentActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${label} events, ${count}`}
            >
              <Text variant="labelMedium" style={{ color: active ? theme.colors.textOnPrimary : theme.colors.grey2 }}>
                {label}
              </Text>
              {loaded && (
                <View style={[style.countBadge, active && style.countBadgeActive]}>
                  <Text variant="labelSmall" style={{ color: active ? theme.colors.primary : theme.colors.grey2 }}>
                    {count}
                  </Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    );
  }

  function renderEmpty(title: string, body: string) {
    return (
      <View style={style.emptyState}>
        <Text variant="labelLarge" style={{ color: theme.colors.text, textAlign: "center" }}>
          {title}
        </Text>
        <Text variant="bodyMedium" style={{ color: theme.colors.grey2, textAlign: "center" }}>
          {body}
        </Text>
      </View>
    );
  }

  function renderUpcomingBody() {
    if (!hasRange) {
      return startDate
        ? renderEmpty("Now pick an end date", "Tap another day on the calendar to finish the range.")
        : renderEmpty(
            upcoming.length ? "Select your dates" : "No upcoming events yet",
            upcoming.length
              ? "Tap a start date and then an end date to see what's on. Days with events are dotted."
              : "New events will appear here as they're announced. See what has already happened under Past."
          );
    }
    if (shownEvents.length === 0) {
      return renderEmpty("Nothing on these dates", "Try a different range - dotted days on the calendar have events.");
    }
    return (
      <FlatList
        contentContainerStyle={listPadding}
        data={shownEvents}
        keyExtractor={(item) => item._id}
        ItemSeparatorComponent={() => <View style={{ height: theme.spacing.md }} />}
        renderItem={({ item }) => <EventItem {...item} />}
      />
    );
  }

  function renderPastBody() {
    if (pastSections.length === 0) {
      return renderEmpty("No past events yet", "Events move here once they've finished.");
    }
    return (
      <SectionList
        contentContainerStyle={listPadding}
        sections={pastSections}
        keyExtractor={(item) => item._id}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <Text variant="labelMedium" style={style.monthHeading}>
            {section.title}
          </Text>
        )}
        SectionSeparatorComponent={() => <View style={{ height: theme.spacing.xs }} />}
        ItemSeparatorComponent={() => <View style={{ height: theme.spacing.md }} />}
        renderItem={({ item }) => <EventItem {...item} past />}
      />
    );
  }

  return (
    <MainBody padding={{ top: 0 }}>
      <AppBar showBack title="What's Hot!" />
      <View style={style.calendarContainer}>
        {renderTabs()}
        {tab === "upcoming" && (
          <>
            <View style={style.toolbar}>
              <Text variant="labelSmall" style={style.rangeLabel} numberOfLines={1}>
                {rangeLabel}
              </Text>
              <Button
                buttonColor="transparent"
                mode="outlined"
                style={[style.outlinedButton, !startDate && style.outlinedButtonDisabled]}
                labelStyle={{ marginVertical: theme.spacing.xs, marginHorizontal: theme.spacing.sm }}
                onPress={resetDates}
                disabled={!startDate}
              >
                <Text variant="labelSmall" style={[style.buttonText, !startDate && { color: theme.colors.grey3 }]}>
                  Reset
                </Text>
              </Button>
              <TouchableOpacity
                onPress={() => setIsSorted(!isSorted)}
                style={{
                  backgroundColor: isSorted ? theme.colors.primary : theme.colors.surface,
                  padding: 10,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: theme.colors.outline,
                }}
              >
                <SortIcon fill={isSorted ? theme.colors.onPrimary : theme.colors.onSurface} strokeWidth={2} />
              </TouchableOpacity>
            </View>
            <Calendar
              enableSwipeMonths
              current={initDate}
              minDate={minDate}
              onDayPress={onDayPress}
              markedDates={markedDates}
              markingType="period"
              theme={{
                calendarBackground: "transparent",
                textSectionTitleColor: theme.colors.text,
                monthTextColor: theme.colors.text,
                dayTextColor: theme.colors.text,
                textDisabledColor: theme.colors.grey3,
                dotColor: theme.colors.primary,
              }}
            />
          </>
        )}
      </View>
      {!loaded ? <LoadingPage /> : tab === "upcoming" ? renderUpcomingBody() : renderPastBody()}
    </MainBody>
  );
}

const useStyle = ({ theme }: { theme: AppTheme }) =>
  StyleSheet.create({
    center: { flex: 1, justifyContent: "center", alignContent: "center" },
    calendarContainer: {
      flexDirection: "column",
      backgroundColor: theme.colors.container,
      borderBottomRightRadius: theme.borderRadius.md,
      borderBottomLeftRadius: theme.borderRadius.md,
      overflow: "hidden",
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.sm,
      paddingBottom: theme.spacing.lg,

      elevation: 4,
      shadowColor: theme.colors.shadowColor,
      shadowRadius: 4,
      shadowOpacity: 0.75,
      shadowOffset: { height: 12, width: 0 },
    },
    // Two-segment pill: the selected side fills with brand blue.
    segmentTrack: {
      flexDirection: "row",
      padding: 4,
      borderRadius: 999,
      backgroundColor: theme.colors.background,
      borderWidth: 1,
      borderColor: theme.colors.grey4,
    },
    segment: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      columnGap: theme.spacing.xs,
      paddingVertical: theme.spacing.xs,
      borderRadius: 999,
    },
    segmentActive: {
      backgroundColor: theme.colors.primary,
    },
    countBadge: {
      minWidth: 22,
      paddingHorizontal: 6,
      borderRadius: 999,
      alignItems: "center",
      backgroundColor: theme.colors.grey4,
    },
    countBadgeActive: {
      backgroundColor: theme.colors.textOnPrimary,
    },
    toolbar: {
      flexDirection: "row",
      justifyContent: "flex-end",
      alignItems: "center",
      gap: theme.spacing.sm,
      paddingTop: theme.spacing.sm,
    },
    rangeLabel: {
      flex: 1,
      color: theme.colors.grey2,
    },
    monthHeading: {
      color: theme.colors.grey2,
      paddingHorizontal: theme.spacing.xs,
      paddingTop: theme.spacing.sm,
    },
    emptyState: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: theme.spacing.xs,
      paddingHorizontal: theme.spacing.xl,
    },

    outlinedButton: {
      borderWidth: 2,
      borderColor: theme.colors.primary,
      borderRadius: 999,
      maxHeight: 34,
    },
    outlinedButtonDisabled: {
      borderColor: theme.colors.grey4,
    },
    buttonText: {
      color: theme.colors.primary,
      textAlignVertical: "center",
    },
  });
