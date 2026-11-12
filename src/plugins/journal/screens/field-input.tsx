import { Text, TextInput, View } from "react-native";

import type { EntryField } from "@/core/entry-types/types";
import { useTheme } from "@/theme/use-theme";
import { Rating } from "./rating";

/** One form field. Values are kept as raw strings; `normalizeFields` turns them into stored values. */
export function FieldInput({
  field,
  value,
  error,
  onChange,
}: {
  field: EntryField;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const { colors, space, radius, font } = useTheme();
  const multiline = field.kind === "longText";

  return (
    <View style={{ gap: space.sm }}>
      <Text style={{ color: colors.text, fontSize: font.body, fontWeight: "600" }}>{field.label}</Text>
      {field.kind === "rating" ? (
        // Tapping the chosen star again clears the rating.
        <Rating value={Number(value) || 0} onChange={(n) => onChange(String(n) === value ? "" : String(n))} />
      ) : (
        <TextInput
          accessibilityLabel={field.label}
          value={value}
          onChangeText={onChange}
          placeholder={field.placeholder}
          placeholderTextColor={colors.textMuted}
          multiline={multiline}
          keyboardType={field.kind === "number" ? "decimal-pad" : "default"}
          textAlignVertical={multiline ? "top" : "center"}
          style={{
            minHeight: multiline ? space.xxl * 4 : 48,
            paddingHorizontal: space.md,
            paddingVertical: space.md,
            borderRadius: radius.md,
            borderCurve: "continuous",
            borderWidth: 1,
            borderColor: error ? colors.caution : colors.border,
            backgroundColor: colors.surface,
            color: colors.text,
            fontSize: font.body,
          }}
        />
      )}
      {error ? (
        <Text selectable accessibilityLiveRegion="polite" style={{ color: colors.caution, fontSize: font.small }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
