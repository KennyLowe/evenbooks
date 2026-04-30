/**
 * Connection-state observer.
 *
 * Maps the SDK's DeviceConnectType to the three-state model the phone-side
 * UI consumes. This is the only place in the app where DeviceConnectType
 * values are interpreted.
 */

import { DeviceConnectType, EvenAppBridge } from "@evenrealities/even_hub_sdk";
import { Teardowns } from "./teardown";

export type ConnectionState = "connected" | "connecting" | "not-connected";

export function observeConnection(
  bridge: EvenAppBridge,
  teardowns: Teardowns,
  onChange: (state: ConnectionState) => void,
): void {
  const unsub = bridge.onDeviceStatusChanged((status) => {
    const connectType = status?.connectType;
    let next: ConnectionState;
    switch (connectType) {
      case DeviceConnectType.Connecting:
        next = "connecting";
        break;
      case DeviceConnectType.Connected:
        next = "connected";
        break;
      default:
        next = "not-connected";
        break;
    }
    onChange(next);
  });
  teardowns.add(unsub);
}
