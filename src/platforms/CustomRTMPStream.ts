import { BaseStream } from "../base/BaseStream.js";
import type { StreamConfig } from "../base/BaseStream.js";

export interface CustomRTMPConfig extends StreamConfig {
  rtmpUrl: string;
  streamKey: string;
  platformName?: string;
}

export class CustomRTMPStream extends BaseStream {
  private rtmpUrl: string;
  private streamKey: string;
  private platformName: string;

  constructor(config: CustomRTMPConfig) {
    super(config);
    this.rtmpUrl = config.rtmpUrl;
    this.streamKey = config.streamKey;
    this.platformName = config.platformName || "Custom RTMP";

    if (!this.rtmpUrl) {
      throw new Error("RTMP URL is required");
    }
    if (!this.streamKey) {
      throw new Error("Stream key is required");
    }
  }

  protected getStreamArgs(): string[] {
    return [
      `${this.rtmpUrl}/${this.streamKey}`
    ];
  }

  protected getPlatformName(): string {
    return this.platformName;
  }

  /**
   * Update stream key without restarting
   */
  public updateStreamKey(newKey: string): void {
    this.streamKey = newKey;
    this.logger.info(`🔑 Stream key updated`);
  }

  /**
   * Update RTMP URL
   */
  public updateRtmpUrl(newUrl: string): void {
    this.rtmpUrl = newUrl;
    this.logger.info(`🌐 RTMP URL updated: ${newUrl}`);
  }

  /**
   * Update platform name for logging
   */
  public updatePlatformName(newName: string): void {
    this.platformName = newName;
    this.logger.info(`📝 Platform name updated to: ${newName}`);
  }

  /**
   * Get stream info
   */
  public getStreamInfo(): { rtmpUrl: string; keyMasked: string; platformName: string } {
    const keyMasked = this.streamKey.slice(0, 8) + "..." + this.streamKey.slice(-4);
    return {
      rtmpUrl: this.rtmpUrl,
      keyMasked,
      platformName: this.platformName
    };
  }
} 