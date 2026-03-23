import { TELEMETRY_ROOT } from '../../utils/config';
import {
  WOOX_ENABLE_STAGING_TRADING,
  WOOX_SIGNED_API_CONFIGURED,
  WOOX_TELEMETRY_ROOT
} from '../config';

/**
 * One-shot safe startup log (no secrets). Call from server bootstrap only.
 */
export function logWooxStartup(): void {
  console.log(
    `[woox] binance_telemetry_root=${TELEMETRY_ROOT} woox_telemetry_root=${WOOX_TELEMETRY_ROOT} staging_trading_enabled=${WOOX_ENABLE_STAGING_TRADING} signed_api_configured=${WOOX_SIGNED_API_CONFIGURED}`
  );
}
