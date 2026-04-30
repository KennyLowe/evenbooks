/**
 * SDK bridge wrapper.
 *
 * Constitution Principle III: phone is authoritative; the bridge is the
 * communication channel. We register the onLaunchSource listener exactly
 * once here so callers don't accidentally miss the one-shot event.
 */

import {
  EvenAppBridge,
  waitForEvenAppBridge,
} from "@evenrealities/even_hub_sdk";
import { Teardowns } from "./teardown";

export type LaunchSource = "appMenu" | "glassesMenu";

export interface BridgeHandle {
  readonly bridge: EvenAppBridge;
  /** Resolves once with the launch source. Fires whether or not it arrives
   *  before the consumer awaits this — internally caches the value. */
  readonly launchSource: Promise<LaunchSource>;
}

/**
 * Wait for the SDK bridge and immediately register the launch-source
 * listener. Returns the bridge plus a one-shot promise for the launch source.
 *
 * Per Constitution Principle V: this function rejects if the bridge fails to
 * initialize. The caller (main.ts bootstrap) is responsible for surfacing
 * that failure to the user.
 */
export async function initBridge(teardowns: Teardowns): Promise<BridgeHandle> {
  const bridge = await waitForEvenAppBridge();

  // One-shot promise resolved by the first onLaunchSource callback.
  let resolveLaunch!: (s: LaunchSource) => void;
  const launchSource = new Promise<LaunchSource>((resolve) => {
    resolveLaunch = resolve;
  });

  const unsub = bridge.onLaunchSource((source) => {
    resolveLaunch(source as LaunchSource);
  });
  teardowns.add(unsub);

  return { bridge, launchSource };
}
