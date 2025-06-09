import { BaseStream } from "../base/BaseStream.js";
import type { StreamConfig } from "../base/BaseStream.js";

export interface TikTokConfig extends StreamConfig {
  streamKey: string;
  rtmpUrl?: string;
}

export class TikTokStream extends BaseStream {
  private streamKey: string;
  private rtmpUrl: string;

  constructor(config: TikTokConfig) {
    super(config);
    this.streamKey = config.streamKey;
    this.rtmpUrl = config.rtmpUrl || "rtmp://live.tiktok.com/live";

    if (!this.streamKey) {
      throw new Error("TikTok stream key is required");
    }
  }

  protected getStreamArgs(): string[] {
    return [
      `${this.rtmpUrl}/${this.streamKey}`
    ];
  }

  protected getPlatformName(): string {
    return "TikTok";
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