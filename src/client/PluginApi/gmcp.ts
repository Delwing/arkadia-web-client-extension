import { gmcp } from "@client/gmcp";

/**
 * GMCP API - Access GMCP data
 */
export interface GmcpApi {
  /**
   * Get the current GMCP data object
   * Contains all GMCP data received from the server
   * @returns GMCP data object
   *
   * @example
   * ```typescript
   * const gmcp = api.gmcp.get();
   * const hp = gmcp?.char?.vitals?.hp;
   * const roomName = gmcp?.room?.info?.name;
   * ```
   */
  get(): Record<string, any>;
}

export function createGmcpApi(): GmcpApi {
  return {
    get: () => {
      return gmcp;
    }
  };
}
