import Ionicons from "@expo/vector-icons/Ionicons";
import * as LocalAuthentication from "expo-local-authentication";
import * as ScreenCapture from "expo-screen-capture";
import { createContext, use, useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, AppState, BackHandler, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BOOT_FAILED_MESSAGE, useAppSettings } from "@/core/app-provider";
import { createAppLockStore, type AppLockConfig, type AppLockStore } from "@/core/security/app-lock-store";
import { isValidPin, newPinSalt, shouldLock } from "@/core/security/pin";
import { useTheme } from "@/theme/use-theme";
import { CalmButton } from "./calm-button";
import { PinDots, PinPad } from "./pin-pad";

export const WRONG_PIN_MESSAGE = "That PIN didn't match. Take your time and try again.";
export const NO_DEVICE_CREDENTIAL_MESSAGE =
  "This phone doesn't have a screen lock set up, so it can't confirm it's you. Your PIN is still the way in. " +
  "If you add a screen lock in your phone's settings, you can come back and reset your PIN here.";
export const CHECKING_PIN_MESSAGE = "Checking your PIN. This can take a few seconds.";
export const DEVICE_AUTH_FAILED_MESSAGE = "That didn't go through just now. You can try again whenever you're ready.";

type LoadState =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; config: AppLockConfig; onboarded: boolean };

/** Thrown when something tries to change the lock settings while the app is locked. */
export class AppLockedError extends Error {
  constructor() {
    super("The app is locked; lock settings can't be changed until it is unlocked.");
    this.name = "AppLockedError";
  }
}

export interface AppLock {
  config: AppLockConfig;
  /**
   * True while the lock screen is up. Anything that renders in its own window above the lock
   * overlay must close itself when this turns true: React Native `<Modal>`s and `Alert`s draw above
   * every view, including the overlay, so a modal editor left open would show over the lock.
   */
  locked: boolean;
  /** Whether the first-run screen has been finished in this session (or an earlier one). */
  onboarded: boolean;
  /**
   * Hashes and stores a new PIN with a fresh salt. The lock does not engage until the app is next away.
   * This, `removePin` and `setBiometrics` reject with `AppLockedError` while the app is locked.
   */
  savePin(pin: string): Promise<void>;
  removePin(): Promise<void>;
  setBiometrics(on: boolean): Promise<void>;
  /** Persists the first-run flag without leaving the first-run screen. */
  markOnboarded(): Promise<void>;
  /** Persists the first-run flag and leaves the first-run screen. */
  finishOnboarding(): Promise<void>;
  /**
   * Runs a system prompt (biometrics, device credential). The app briefly goes to the background
   * while the prompt is up; that must not count as leaving the app.
   */
  withSystemPrompt<T>(prompt: () => Promise<T>): Promise<T>;
}

const AppLockContext = createContext<AppLock | null>(null);

export function useAppLock(): AppLock {
  const lock = use(AppLockContext);
  if (!lock) throw new Error("useAppLock() must be used inside <LockGate>.");
  return lock;
}

/** Applies Android FLAG_SECURE while a PIN is set: no screenshots, and a blank Recents thumbnail. */
function useScreenCaptureBlock(blocked: boolean | null) {
  const applied = useRef(false);
  useEffect(() => {
    if (blocked === null) return;
    if (blocked && !applied.current) {
      applied.current = true;
      ScreenCapture.preventScreenCaptureAsync(CAPTURE_KEY).catch(() =>
        console.warn("[AppLock] could not hide the app from screenshots and Recents"),
      );
    } else if (!blocked && applied.current) {
      applied.current = false;
      ScreenCapture.allowScreenCaptureAsync(CAPTURE_KEY).catch(() =>
        console.warn("[AppLock] could not allow screenshots again"),
      );
    }
  }, [blocked]);
}

const CAPTURE_KEY = "app-lock";

/**
 * Loads the app-lock settings, then renders the app with the lock screen over it when needed. Nothing
 * from the app is rendered until the settings are known, so a locked app never flashes its content.
 *
 * Once locked, only a correct PIN, biometrics or "Forgot PIN?" can unlock: the lock does not depend
 * on the (mutable) config, and the settings mutators refuse to run while locked.
 */
export function LockGate({
  children,
  onPinReset,
  store: injectedStore,
}: {
  children: ReactNode;
  /** Called after "Forgot PIN?" succeeds and the PIN is cleared, e.g. to open App lock settings. */
  onPinReset: () => void;
  /** Injected in tests; the app builds one from `useAppSettings()`. */
  store?: AppLockStore;
}) {
  const settings = useAppSettings();
  const [store] = useState(() => injectedStore ?? createAppLockStore(settings));
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [locked, setLockedState] = useState(true);
  // Shown while the app is away (when the lock is on), until the lock decision on return.
  const [covered, setCovered] = useState(false);

  const lockedRef = useRef(true);
  const lockEnabledRef = useRef(false);
  const backgroundedAt = useRef<number | null>(null);
  const systemPrompts = useRef(0);

  const setLocked = (next: boolean) => {
    lockedRef.current = next;
    setLockedState(next);
  };

  useEffect(() => {
    let live = true;
    Promise.all([store.getConfig(), store.isOnboarded()]).then(
      ([config, onboarded]) => {
        if (!live) return;
        lockEnabledRef.current = config.lockEnabled;
        // Cold start: locked whenever a PIN is set.
        lockedRef.current = config.lockEnabled;
        setLockedState(config.lockEnabled);
        setState({ status: "ready", config, onboarded });
      },
      () => live && setState({ status: "failed" }),
    );
    return () => {
      live = false;
    };
  }, [store]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (systemPrompts.current > 0) return;
      if (next === "active") {
        const away = { lockEnabled: lockEnabledRef.current, backgroundedAt: backgroundedAt.current };
        backgroundedAt.current = null;
        if (shouldLock(away, Date.now())) {
          lockedRef.current = true;
          setLockedState(true);
        }
        setCovered(false);
        return;
      }
      // "inactive" (app switcher, notification shade on iOS) or "background".
      if (lockEnabledRef.current) setCovered(true);
      if (next === "background") backgroundedAt.current ??= Date.now();
    });
    return () => sub.remove();
  }, []);

  const showLock = state.status === "ready" && locked;
  const hideApp = showLock || covered;

  useScreenCaptureBlock(state.status === "ready" ? state.config.lockEnabled : null);

  // While locked, the back button must not navigate the app hidden underneath.
  useEffect(() => {
    if (!showLock) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, [showLock]);

  if (state.status === "loading") return <Cover />;
  if (state.status === "failed") return <Cover message={BOOT_FAILED_MESSAGE} />;

  const refresh = async () => {
    const config = await store.getConfig();
    lockEnabledRef.current = config.lockEnabled;
    setState((s) => (s.status === "ready" ? { ...s, config } : s));
  };

  /** Settings changes are refused while locked, so a screen left open under the lock can't act. */
  const whileUnlocked = async (change: () => Promise<void>) => {
    if (lockedRef.current) throw new AppLockedError();
    await change();
    await refresh();
  };

  const lock: AppLock = {
    config: state.config,
    locked: showLock,
    onboarded: state.onboarded,
    savePin: (pin) => whileUnlocked(() => store.setPin(pin, newPinSalt())),
    removePin: () => whileUnlocked(() => store.clearPin()),
    setBiometrics: (on) => whileUnlocked(() => store.setBiometrics(on)),
    markOnboarded: () => store.markOnboarded(),
    async finishOnboarding() {
      await store.markOnboarded();
      setState((s) => (s.status === "ready" ? { ...s, onboarded: true } : s));
    },
    async withSystemPrompt(prompt) {
      systemPrompts.current += 1;
      try {
        return await prompt();
      } finally {
        systemPrompts.current -= 1;
        backgroundedAt.current = null;
      }
    },
  };

  const unlock = () => setLocked(false);

  // Only reachable from the lock screen, after the phone's own credential was confirmed.
  const forgotPinReset = async () => {
    await store.clearPin();
    await refresh();
    setLocked(false);
    onPinReset();
  };

  return (
    <AppLockContext value={lock}>
      <View style={{ flex: 1 }}>
        <View
          style={{ flex: 1 }}
          importantForAccessibility={hideApp ? "no-hide-descendants" : "auto"}
          accessibilityElementsHidden={hideApp}
        >
          {children}
        </View>
        {showLock ? (
          <View style={StyleSheet.absoluteFill}>
            <LockScreen store={store} onUnlock={unlock} onPinReset={forgotPinReset} />
          </View>
        ) : covered ? (
          <View testID="privacy-cover" style={StyleSheet.absoluteFill}>
            <PrivacyCover />
          </View>
        ) : null}
      </View>
    </AppLockContext>
  );
}

/** Plain, opaque cover with no app content, shown while the app is away. */
function PrivacyCover() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
      <Ionicons name="lock-closed-outline" size={32} color={colors.accent} />
    </View>
  );
}

/** An opaque screen shown while the lock settings load (or if they can't be read). */
function Cover({ message }: { message?: string }) {
  const { colors, space, font } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: space.xxl,
        backgroundColor: colors.background,
      }}
    >
      {message ? (
        <Text
          selectable
          accessibilityRole="alert"
          style={{ color: colors.text, fontSize: font.body, lineHeight: font.body * 1.5, textAlign: "center" }}
        >
          {message}
        </Text>
      ) : (
        <ActivityIndicator color={colors.accent} accessibilityLabel="Opening SelfJournal" />
      )}
    </View>
  );
}

const NO_CREDENTIAL_ERRORS = new Set(["not_enrolled", "passcode_not_set", "not_available"]);
const CANCEL_ERRORS = new Set(["user_cancel", "system_cancel", "app_cancel", "user_fallback"]);

export function LockScreen({
  store,
  onUnlock,
  onPinReset,
}: {
  store: AppLockStore;
  onUnlock: () => void;
  /** Called after the phone's own credential is confirmed via "Forgot PIN?". */
  onPinReset: () => Promise<void>;
}) {
  const { colors, space, font } = useTheme();
  const insets = useSafeAreaInsets();
  const lock = useAppLock();
  const [entry, setEntry] = useState("");
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async () => {
    if (!isValidPin(entry) || checking) return;
    setChecking(true);
    const ok = await store.checkPin(entry).catch(() => false);
    setChecking(false);
    if (ok) {
      onUnlock();
      return;
    }
    setEntry("");
    setMessage(WRONG_PIN_MESSAGE);
  };

  const changeEntry = (next: string) => {
    setEntry(next);
    if (message) setMessage(null);
  };

  const unlockWithBiometrics = async () => {
    setMessage(null);
    const result = await lock
      .withSystemPrompt(() =>
        LocalAuthentication.authenticateAsync({
          promptMessage: "Unlock SelfJournal",
          cancelLabel: "Use PIN",
          disableDeviceFallback: true,
        }),
      )
      .catch(() => null);
    if (result?.success) onUnlock();
    else if (result && !CANCEL_ERRORS.has(result.error)) setMessage(DEVICE_AUTH_FAILED_MESSAGE);
  };

  const forgotPin = async () => {
    setMessage(null);
    const level = await LocalAuthentication.getEnrolledLevelAsync().catch(() => null);
    if (level === LocalAuthentication.SecurityLevel.NONE) {
      setMessage(NO_DEVICE_CREDENTIAL_MESSAGE);
      return;
    }
    const result = await lock
      .withSystemPrompt(() =>
        LocalAuthentication.authenticateAsync({ disableDeviceFallback: false, promptMessage: "Confirm it's you" }),
      )
      .catch(() => null);
    if (result?.success) {
      await onPinReset().catch(() => setMessage(DEVICE_AUTH_FAILED_MESSAGE));
    } else if (result && NO_CREDENTIAL_ERRORS.has(result.error)) {
      setMessage(NO_DEVICE_CREDENTIAL_MESSAGE);
    } else if (!result || !CANCEL_ERRORS.has(result.error)) {
      setMessage(DEVICE_AUTH_FAILED_MESSAGE);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: "center",
        gap: space.xl,
        paddingTop: insets.top + space.xl,
        paddingBottom: insets.bottom + space.xl,
        paddingHorizontal: space.xl,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ alignItems: "center", gap: space.sm }}>
        <Ionicons name="lock-closed-outline" size={32} color={colors.accent} />
        <Text accessibilityRole="header" style={{ color: colors.text, fontSize: font.title, fontWeight: "600" }}>
          Welcome back
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: font.body, textAlign: "center" }}>
          Enter your PIN to open your journal.
        </Text>
      </View>
      <PinDots length={entry.length} />
      <Text
        accessibilityLiveRegion="polite"
        style={{
          color: colors.textMuted,
          fontSize: font.small,
          lineHeight: font.small * 1.5,
          textAlign: "center",
          minHeight: font.small * 1.5,
        }}
      >
        {checking ? CHECKING_PIN_MESSAGE : (message ?? "")}
      </Text>
      <PinPad value={entry} onChange={changeEntry} disabled={checking} />
      <View style={{ gap: space.sm }}>
        <CalmButton label="Unlock" onPress={submit} disabled={!isValidPin(entry)} busy={checking} />
        {lock.config.biometricsEnabled ? (
          <CalmButton label="Use fingerprint or face" variant="secondary" onPress={unlockWithBiometrics} disabled={checking} />
        ) : null}
        <CalmButton label="Forgot PIN?" variant="quiet" onPress={forgotPin} disabled={checking} />
      </View>
    </ScrollView>
  );
}
