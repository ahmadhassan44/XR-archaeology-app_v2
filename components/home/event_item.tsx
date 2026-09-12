import { Event } from "@models";
import { getThumb } from "@/plugins/utils";
import { AppTheme, useAppTheme } from "@/providers/style_provider";
import { Link } from "expo-router";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { Routes } from "@/app/composable/routes";
import { useLocalizedText } from "@/hooks/useLocalizedText";
import { eventMoment } from "@/app/composable/event_dates";

const IMAGE_WIDTH = 120;
const LABEL_WIDTH = 64;

type Props = Event & {
  /** Render as an ended event: a slate date block and a quieter image, so a
   * card in the past list reads as history rather than something to attend. */
  past?: boolean;
};

export default function EventItem({ _id, name, briefDesc, images, startDate, endDate, past, ...props }: Props) {
  const { theme } = useAppTheme();
  const style = useStyle({ theme, past: !!past });
  const localize = useLocalizedText();
  const image: string | undefined = images?.[0];

  // Handle multilingual text
  const localizedName = typeof name === "string" ? name : localize(name);
  const localizedBriefDesc = typeof briefDesc === "string" ? briefDesc : localize(briefDesc);

  // Dates are Armenia days, so the card agrees with the calendar and the detail
  // page wherever the phone's clock is set.
  const start = eventMoment(startDate);
  const end = eventMoment(endDate);
  const multiDay = !!(start && end && !start.isSame(end, "day"));

  function getDateLabel(m: ReturnType<typeof eventMoment>) {
    if (!m) return null;
    return (
      <>
        <Text variant="headlineSmall" style={{ color: theme.colors.textOnPrimary }}>
          {m.date()}
        </Text>
        <Text variant="bodySmall" style={{ fontWeight: "700", color: theme.colors.textOnPrimary, marginTop: -8 }}>
          {m.format("MMM")}
        </Text>
      </>
    );
  }

  return (
    <Link href={{ pathname: Routes.Event, params: { id: _id } }} asChild>
      <Pressable>
        <View style={style.card}>
          {image ? (
            <View style={style.imagePlaceholder}>
              <Image source={{ uri: getThumb(image) }} style={[style.image, past && style.imagePast]} />
            </View>
          ) : (
            <View style={style.imagePlaceholder} />
          )}
          <View style={[style.content, { marginLeft: image ? IMAGE_WIDTH : LABEL_WIDTH + theme.spacing.md }]}>
            <Text variant="labelLarge" style={{ color: theme.colors.text }}>
              {localizedName}
            </Text>
            {!!localizedBriefDesc && (
              <Text variant="bodyMedium" style={{ color: past ? theme.colors.grey2 : theme.colors.text }} numberOfLines={3}>
                {localizedBriefDesc}
              </Text>
            )}
          </View>
          <View style={style.dateStack}>
            <View style={style.dateContainer}>
              {getDateLabel(start)}
              {/* A one-day event gets one date, not the same date twice. */}
              {multiDay && <View style={style.toSign} />}
              {multiDay && getDateLabel(end)}
            </View>
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

const useStyle = ({ theme, past }: { theme: AppTheme; past: boolean }) =>
  StyleSheet.create({
    card: {
      flexDirection: "row",
      position: "relative",
      backgroundColor: theme.colors.container,
      elevation: past ? 2 : 4,
      overflow: "visible",
      borderRadius: theme.borderRadius.xs,
      minHeight: 130,
    },
    imagePlaceholder: {
      width: IMAGE_WIDTH,
      position: "absolute",
      top: 0,
      bottom: 0,
      left: 0,
      borderTopLeftRadius: theme.borderRadius.xs,
      borderBottomLeftRadius: theme.borderRadius.xs,
      overflow: "hidden",
    },
    image: {
      resizeMode: "cover",
      width: "100%",
      height: "100%",
    },
    imagePast: {
      opacity: 0.7,
    },
    content: {
      flex: 1,
      flexDirection: "column",
      justifyContent: "center",

      rowGap: theme.spacing.xs,
      paddingLeft: theme.spacing.xs,
      paddingRight: theme.spacing.lg,
      paddingVertical: theme.spacing.sm,
    },
    dateStack: {
      position: "absolute",
      top: 0,
      bottom: 0,
      left: 0,
      flexDirection: "column",
      justifyContent: "center",
    },
    dateContainer: {
      // Slate for ended events, brand blue for ones still to come.
      backgroundColor: past ? theme.colors.grey2 : theme.colors.primary,
      flexDirection: "column",
      justifyContent: "center",
      alignContent: "center",
      alignSelf: "center",
      alignItems: "center",
      borderRadius: theme.borderRadius.xs,
      gap: theme.spacing.xxs,
      paddingVertical: theme.spacing.xs,
      width: LABEL_WIDTH,
      minHeight: LABEL_WIDTH,
      elevation: 2,
    },
    toSign: {
      width: 4,
      height: 14,
      backgroundColor: theme.colors.textOnPrimary,
    },
  });
