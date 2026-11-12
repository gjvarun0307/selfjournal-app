import { createContext, use, useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { openEncryptedDb } from "@/core/db/expo-db";
import { EventBus } from "@/core/events/bus";
import { PluginHost } from "@/core/plugins/host";
import { useEnabledIds } from "@/core/plugins/use-enabled-ids";
import {
  DbKeyError,
  EncryptionUnavailableError,
  MissingDbKeyError,
  dbFileExists,
  getOrCreateDbKey,
  randomHex32,
  secureKeyStore,
} from "@/core/security/db-key";
import { createAppSettings, type AppSettings } from "@/core/settings/app-settings";
import { ALL_PLUGINS } from "@/plugins";
import { useTheme } from "@/theme/use-theme";

export interface AppServices {
  host: PluginHost;
  settings: AppSettings;
  bus: EventBus;
}

async function bootServices(): Promise<AppServices> {
  const key = await getOrCreateDbKey({
    store: secureKeyStore,
    dbFileExists: dbFileExists(),
    randomHex: randomHex32,
  });
  const db = await openEncryptedDb(key);
  const bus = new EventBus();
  const settings = createAppSettings(db);
  const host = new PluginHost(ALL_PLUGINS, { db, bus, settings });
  await host.start();
  return { host, settings, bus };
}

// Boot exactly once per JS runtime. expo-sqlite caches the connection by name, so re-keying it
// (StrictMode double effects, Fast Refresh re-evaluating this module) is avoided by keeping the
// promise on globalThis rather than in component or module state.
const BOOT_KEY = "__selfjournalBoot";
type BootGlobal = typeof globalThis & { [BOOT_KEY]?: Promise<AppServices> };

function isKeyOrEncryptionError(error: unknown): boolean {
  return error instanceof MissingDbKeyError || error instanceof DbKeyError || error instanceof EncryptionUnavailableError;
}

export function bootOnce(): Promise<AppServices> {
  const g = globalThis as BootGlobal;
  if (!g[BOOT_KEY]) {
    const promise = bootServices();
    g[BOOT_KEY] = promise;
    // Key/encryption failures are deterministic and must not be retried (a retry could mint a new key);
    // anything else may be transient, so forget the failed boot and let the next mount try again.
    promise.catch((error: unknown) => {
      if (isKeyOrEncryptionError(error)) return;
      if (g[BOOT_KEY] === promise) delete g[BOOT_KEY];
    });
  }
  return g[BOOT_KEY];
}

const ServicesContext = createContext<AppServices | null>(null);

type BootState = { status: "booting" } | { status: "ready"; services: AppServices } | { status: "failed"; error: unknown };

export function AppProvider({
  children,
  boot = bootOnce,
}: {
  children: ReactNode;
  /** Injected in tests; the app always uses the default. */
  boot?: () => Promise<AppServices>;
}) {
  const [state, setState] = useState<BootState>({ status: "booting" });

  useEffect(() => {
    let live = true;
    boot().then(
      (services) => live && setState({ status: "ready", services }),
      (error: unknown) => live && setState({ status: "failed", error }),
    );
    return () => {
      live = false;
    };
  }, [boot]);

  if (state.status === "booting") return <BootSplash />;
  if (state.status === "failed") return <BootFailure error={state.error} />;
  return <ServicesContext value={state.services}>{children}</ServicesContext>;
}

function useServices(hook: string): AppServices {
  const services = use(ServicesContext);
  if (!services) throw new Error(`${hook}() must be used inside <AppProvider> after it has booted.`);
  return services;
}

export function useHost(): PluginHost {
  return useServices("useHost").host;
}

export function useAppSettings(): AppSettings {
  return useServices("useAppSettings").settings;
}

export function useBus(): EventBus {
  return useServices("useBus").bus;
}

export function useEnabledPlugins(): string[] {
  return useEnabledIds(useServices("useEnabledPlugins").host);
}

export const UNLOCK_FAILED_MESSAGE = "SelfJournal can't unlock its data on this device. Nothing has been deleted.";
export const ENCRYPTION_UNAVAILABLE_MESSAGE =
  "SelfJournal can't secure its data on this device, so it won't store anything. Nothing has been deleted.";
export const BOOT_FAILED_MESSAGE =
  "SelfJournal couldn't start just now. Nothing has been deleted. It will try again the next time it opens.";

export function bootFailureMessage(error: unknown): string {
  if (error instanceof MissingDbKeyError || error instanceof DbKeyError) return UNLOCK_FAILED_MESSAGE;
  if (error instanceof EncryptionUnavailableError) return ENCRYPTION_UNAVAILABLE_MESSAGE;
  return BOOT_FAILED_MESSAGE;
}

function CalmScreen({ children }: { children: ReactNode }) {
  const { colors, space } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: space.lg,
        padding: space.xxl,
        backgroundColor: colors.background,
      }}
    >
      {children}
    </View>
  );
}

function BootSplash() {
  const { colors } = useTheme();
  return (
    <CalmScreen>
      <ActivityIndicator color={colors.accent} accessibilityLabel="Opening SelfJournal" />
    </CalmScreen>
  );
}

function BootFailure({ error }: { error: unknown }) {
  const { colors, font } = useTheme();
  return (
    <CalmScreen>
      <Text
        selectable
        accessibilityRole="alert"
        style={{ color: colors.text, fontSize: font.body, lineHeight: font.body * 1.5, textAlign: "center" }}
      >
        {bootFailureMessage(error)}
      </Text>
    </CalmScreen>
  );
}
