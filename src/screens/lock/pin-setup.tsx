import { useState } from "react";
import { Text, View } from "react-native";

import { isValidPin } from "@/core/security/pin";
import { useTheme } from "@/theme/use-theme";
import { CalmButton } from "./calm-button";
import { PinDots, PinPad } from "./pin-pad";

export const PIN_MISMATCH_MESSAGE = "Those two didn't match. Let's start again.";
export const SAVING_PIN_MESSAGE = "Saving your PIN. This can take a few seconds.";
export const PIN_SAVE_FAILED_MESSAGE = "That PIN couldn't be saved just now. Please try again.";

/**
 * Choose a PIN, then type it again to confirm. Calls `onSave` with the confirmed PIN and stays busy
 * until it resolves, so the screen never moves on before the PIN is really stored.
 */
export function PinSetup({
  onSave,
  onCancel,
  cancelLabel = "Cancel",
}: {
  onSave: (pin: string) => Promise<void>;
  onCancel?: () => void;
  cancelLabel?: string;
}) {
  const { colors, space, font } = useTheme();
  const [first, setFirst] = useState<string | null>(null);
  const [entry, setEntry] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const confirming = first !== null;

  const next = async () => {
    if (!isValidPin(entry)) return;
    if (!confirming) {
      setFirst(entry);
      setEntry("");
      setMessage(null);
      return;
    }
    if (entry !== first) {
      setFirst(null);
      setEntry("");
      setMessage(PIN_MISMATCH_MESSAGE);
      return;
    }
    setSaving(true);
    try {
      await onSave(entry);
    } catch {
      setSaving(false);
      setFirst(null);
      setEntry("");
      setMessage(PIN_SAVE_FAILED_MESSAGE);
    }
  };

  return (
    <View style={{ gap: space.xl, alignItems: "stretch" }}>
      <View style={{ gap: space.sm, alignItems: "center" }}>
        <Text accessibilityRole="header" style={{ color: colors.text, fontSize: font.title, fontWeight: "600" }}>
          {confirming ? "Type it once more" : "Choose a PIN"}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: font.body, textAlign: "center" }}>
          {confirming ? "Just to be sure it's the one you meant." : "Use 4 to 8 digits that you'll remember."}
        </Text>
      </View>
      <PinDots length={entry.length} />
      <Text
        accessibilityLiveRegion="polite"
        style={{ color: colors.textMuted, fontSize: font.small, textAlign: "center", minHeight: font.small * 1.5 }}
      >
        {saving ? SAVING_PIN_MESSAGE : (message ?? "")}
      </Text>
      <PinPad value={entry} onChange={setEntry} disabled={saving} />
      <View style={{ gap: space.sm }}>
        <CalmButton
          label={confirming ? "Save PIN" : "Next"}
          onPress={next}
          disabled={!isValidPin(entry)}
          busy={saving}
        />
        {onCancel ? <CalmButton label={cancelLabel} variant="quiet" onPress={onCancel} disabled={saving} /> : null}
      </View>
    </View>
  );
}
