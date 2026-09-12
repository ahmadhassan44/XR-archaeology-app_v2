import { AppBar, Carousel, MainBody, NAVBAR_HEIGHT, NumInput, ErrorPage, LoadingPage } from "@/components";
import { CalendarIcon, CalendarOutlinedIcon, LocationIcon, ProfileIcon } from "@/components/icons";
import { Event } from "@/models";
import { useAuth } from "@/providers/auth_provider";
import { useFeathers } from "@/providers/feathers_provider";
import { useLanguage } from "@/providers/language_provider";
import { AppTheme, useAppTheme } from "@/providers/style_provider";
import { useLocalSearchParams } from "expo-router";
import moment from "moment";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Button, Text } from "react-native-paper";
import { EVENT_TIMEZONE_LABEL, eventMoment, isEventPast } from "@/app/composable/event_dates";

/** A time is only worth showing if the editor actually set one.
 *
 * `startDate`/`endDate` are full timestamps, but an all-day event is stored as
 * midnight. Printing "00:00" for those is noise, so times are shown only when
 * at least one end of the event carries a real time.
 */
function hasMeaningfulTime(start?: Date | string, end?: Date | string) {
  // Judged in Armenia time, the time the editor typed. An all-day event entered
  // as midnight in Armenia is not midnight on a phone set to another zone.
  return [start, end].some((value) => {
    const m = eventMoment(value);
    return !!m && (m.hours() !== 0 || m.minutes() !== 0);
  });
}

export default function Page() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const feathers = useFeathers();
  const { user } = useAuth();
  const { theme } = useAppTheme();
  const { getLocalizedText } = useLanguage();

  const [event, setEvent] = useState<Event>();
  const [venueName, setVenueName] = useState<string>();
  const [loaded, setLoaded] = useState(false);
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [selectedDates, setSelectedDates] = useState([]);

  const authenticated: boolean = !!(user && user._id);

  useEffect(() => {
    async function init() {
      try {
        if (!id) return;
        const res = await feathers.service("events").get(id, { query: { $populate: ["venue"] } });
        setEvent(res);
        //   fetch venue name if $populate not working
        if (typeof res.venue === "string") {
          const venue = await feathers.service("attractions").get(res.venue, { query: { $select: ["name"] } });
          setVenueName(getLocalizedText(venue.name));
        } else {
          setVenueName(getLocalizedText(res.venue?.name));
        }
      } catch (error) {
        console.warn(error);
      } finally {
        setLoaded(true);
      }
    }
    init();
  }, []);

  const showTime = useMemo(() => hasMeaningfulTime(event?.startDate, event?.endDate), [event]);
  /** Ended events keep all their details but lose booking - there is nothing
   * left to book. Judged by the end time, so an event on right now still books. */
  const isPast = useMemo(() => !!event && isEventPast(event), [event]);
  const accent = isPast ? theme.colors.grey2 : theme.colors.primary;
  // A plain function despite the name - safe to call once isPast is known.
  const style = useStyle({ theme, past: isPast });

  /** Date and time in Armenia wall-clock time - what the editor typed - rather
   * than converted to the phone's timezone, which shifted every event by the
   * difference between the two. */
  function formatWhen(value?: Date) {
    const m = eventMoment(value);
    if (!m) return { date: "", time: "" };
    return { date: m.format("ddd, D MMM YYYY"), time: showTime ? m.format("HH:mm") : "" };
  }

  const start = formatWhen(event?.startDate);
  const end = event?.endDate ? formatWhen(event.endDate) : null;
  const startM = eventMoment(event?.startDate);
  const endM = eventMoment(event?.endDate);
  const sameDay = !!(startM && endM && startM.isSame(endM, "day"));

  /** A single row of the details card.
   *
   * The icon sits in a fixed-size badge and the text in a flexed column, so a
   * longer label can never push the icon onto its own line - the previous
   * layout used a fixed-width wrapping header, which is why "Start Date" and
   * "End Date" ended up aligned differently.
   */
  function DetailRow({
    icon,
    label,
    value,
    hint,
    last,
  }: {
    icon: React.ReactNode;
    label: string;
    value: string;
    hint?: string;
    last?: boolean;
  }) {
    if (!value) return null;
    return (
      <View style={[style.detailRow, !last && style.detailRowDivider]}>
        <View style={style.iconBadge}>{icon}</View>
        <View style={style.detailText}>
          <Text variant="bodySmall" style={{ color: theme.colors.grey2 }}>
            {label}
          </Text>
          <Text variant="labelMedium" style={{ color: theme.colors.text }}>
            {value}
          </Text>
        </View>
        {!!hint && (
          <Text variant="labelMedium" style={style.hint}>
            {hint}
          </Text>
        )}
      </View>
    );
  }

  return (
    <MainBody padding={{ top: 0 }}>
      <AppBar showBack />
      {!loaded ? (
        <LoadingPage />
      ) : event ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: NAVBAR_HEIGHT + theme.spacing.md }}>
          {event.images && <Carousel images={event.images} />}

          <View style={style.topSection}>
            <Text variant="headlineSmall" style={{ color: theme.colors.text }}>
              {getLocalizedText(event.name)}
            </Text>
            {!!event.briefDesc && (
              <Text variant="bodyMedium" style={{ color: theme.colors.grey2 }}>
                {getLocalizedText(event.briefDesc)}
              </Text>
            )}
          </View>

          {isPast && (
            <View style={style.endedBanner}>
              <CalendarIcon fill={theme.colors.grey2} size={18} />
              <View style={{ flex: 1 }}>
                <Text variant="labelMedium" style={{ color: theme.colors.text }}>
                  This event has ended
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.grey2 }}>
                  The details below are kept for reference.
                </Text>
              </View>
            </View>
          )}

          {/* When & where */}
          <View style={style.card}>
            <DetailRow
              icon={<CalendarOutlinedIcon fill={accent} size={20} />}
              label={sameDay ? "Date" : "Starts"}
              value={start.date}
              hint={start.time}
              last={!end && !venueName}
            />
            {end && !sameDay && (
              <DetailRow
                icon={<CalendarIcon fill={accent} size={20} />}
                label="Ends"
                value={end.date}
                hint={end.time}
                last={!venueName}
              />
            )}
            {end && sameDay && showTime && (
              <DetailRow
                icon={<CalendarIcon fill={accent} size={20} />}
                label="Time"
                value={`${start.time} - ${end.time}`}
                last={!venueName}
              />
            )}
            {!!venueName && (
              <DetailRow icon={<LocationIcon fill={accent} size={20} />} label="Venue" value={venueName} last />
            )}
          </View>
          {showTime && (
            <Text variant="bodySmall" style={style.timezoneNote}>
              Times are {EVENT_TIMEZONE_LABEL.toLowerCase()} (UTC+4)
            </Text>
          )}

          {/* Full description */}
          {!!event.content && (
            <View style={style.contentSection}>
              <Text variant="bodyMedium" style={{ color: theme.colors.text, lineHeight: 22 }}>
                {getLocalizedText(event.content)}
              </Text>
            </View>
          )}

          {/* Reservation - not offered once the event is over */}
          {authenticated && !isPast && (
            <View style={{ marginBottom: theme.spacing.lg }}>
              <Text variant="titleMedium" style={style.sectionTitle}>
                Reservation
              </Text>

              <View style={[style.row, style.personSection]}>
                <ProfileIcon fill={theme.colors.text} size={24} />
                <View style={{ flexDirection: "column", gap: theme.spacing.xs, flex: 1 }}>
                  <View style={style.personRow}>
                    <Text variant="labelMedium" style={{ color: theme.colors.text }}>
                      Adults
                    </Text>
                    <NumInput inputValue={adults} onChange={setAdults} min={0} />
                  </View>
                  <View style={style.personRow}>
                    <View style={{ flexDirection: "column" }}>
                      <Text variant="labelMedium" style={{ color: theme.colors.text }}>
                        Children
                      </Text>
                      <Text variant="bodySmall" style={{ color: theme.colors.grey2 }}>
                        Ages 0 to 17
                      </Text>
                    </View>
                    <NumInput inputValue={children} onChange={setChildren} min={0} />
                  </View>
                </View>
              </View>

              {/* Date & Time */}
              <View style={[style.row, style.dateTimeSection]}>
                <CalendarOutlinedIcon fill={theme.colors.text} size={24} />
                <Text variant="labelMedium" style={{ color: theme.colors.text, flex: 1 }}>
                  Date & Time
                </Text>
                <Button>{selectedDates && selectedDates.length ? moment(selectedDates[0]).format("DD MMM, YYYY") : "Select a day"}</Button>
              </View>
            </View>
          )}

          {/* Footer - no booking or sign-up for an event that has already happened */}
          {!isPast && (
            <View style={style.footer}>
              <Button
                mode="contained"
                style={{ borderRadius: theme.borderRadius.sm }}
                contentStyle={{ paddingVertical: theme.spacing.xxs }}
                textColor={theme.colors.textOnPrimary}
              >
                {authenticated ? "Book now" : "Sign up to book now"}
              </Button>
            </View>
          )}
        </ScrollView>
      ) : (
        <ErrorPage message="Details for this item aren't available" />
      )}
    </MainBody>
  );
}

const useStyle = ({ theme, past = false }: { theme: AppTheme; past?: boolean }) =>
  StyleSheet.create({
    center: { flex: 1, justifyContent: "center", alignContent: "center" },
    topSection: {
      flexDirection: "column",
      paddingHorizontal: theme.spacing.lg,
      rowGap: theme.spacing.xs,
      marginTop: theme.spacing.md,
      marginBottom: theme.spacing.md,
    },
    card: {
      marginHorizontal: theme.spacing.lg,
      marginBottom: theme.spacing.lg,
      backgroundColor: theme.colors.container,
      borderRadius: theme.borderRadius.md,
      borderWidth: 1,
      borderColor: theme.colors.grey4,
      overflow: "hidden",
    },
    detailRow: {
      flexDirection: "row",
      alignItems: "center",
      columnGap: theme.spacing.sm,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
    },
    detailRowDivider: {
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.grey4,
    },
    // Fixed square badge: the icon can never wrap away from its label, which
    // is what misaligned the old Start/End rows.
    iconBadge: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.background,
    },
    detailText: {
      flex: 1,
      flexDirection: "column",
      rowGap: 2,
    },
    hint: {
      color: past ? theme.colors.grey2 : theme.colors.primary,
      marginLeft: theme.spacing.sm,
    },
    endedBanner: {
      flexDirection: "row",
      alignItems: "center",
      columnGap: theme.spacing.sm,
      marginHorizontal: theme.spacing.lg,
      marginBottom: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.background,
      borderWidth: 1,
      borderColor: theme.colors.grey4,
    },
    timezoneNote: {
      color: theme.colors.grey2,
      marginHorizontal: theme.spacing.lg,
      marginTop: -theme.spacing.sm,
      marginBottom: theme.spacing.lg,
    },
    contentSection: {
      paddingHorizontal: theme.spacing.lg,
      marginBottom: theme.spacing.lg,
    },
    sectionTitle: {
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.xs,
      color: theme.colors.text,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
    },
    personSection: {
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.sm,
      columnGap: theme.spacing.sm,
    },
    personRow: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    dateTimeSection: {
      paddingLeft: theme.spacing.lg,
      paddingRight: theme.spacing.xxs,
      columnGap: theme.spacing.sm,
    },
    footer: {
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.lg,
    },
  });
