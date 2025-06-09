import { BaseStream } from "../base/BaseStream.js";
import type { StreamConfig } from "../base/BaseStream.js";

export interface FacebookConfig extends StreamConfig {
  streamKey: string;
  rtmpUrl?: string;
}

export class FacebookStream extends BaseStream {
  private streamKey: string;
  private rtmpUrl: string;

  constructor(config: FacebookConfig) {
    super(config);
    this.streamKey = config.streamKey;
    this.rtmpUrl = config.rtmpUrl || "rtmp://live-api-s.facebook.com:80/rtmp";

    if (!this.streamKey) {
      throw new Error("Facebook stream key is required");
    }
  }

  protected getStreamArgs(): string[] {
    return [
      `${this.rtmpUrl}/${this.streamKey}`
    ];
  }

  protected getPlatformName(): string {
    return "Facebook";
  }

  /**
   * Update stream key without restarting
   */
  public updateStreamKey(newKey: string): void {
    this.streamKey = newKey;
    this.logger.info(`🔑 Stream key updated`);
  }

  /**
   * Update RTMP server
   */
  public updateRtmpUrl(newUrl: string): void {
    this.rtmpUrl = newUrl;
    this.logger.info(`🌐 RTMP URL updated: ${newUrl}`);
  }

  /**
   * Get stream info
   */
  public getStreamInfo(): { rtmpUrl: string; keyMasked: string } {
    const keyMasked = this.streamKey.slice(0, 8) + "..." + this.streamKey.slice(-4);
    return {
      rtmpUrl: this.rtmpUrl,
      keyMasked
    };
  }
} 