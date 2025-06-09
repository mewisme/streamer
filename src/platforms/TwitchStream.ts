import { BaseStream } from "../base/BaseStream.js";
import type { StreamConfig } from "../base/BaseStream.js";

export interface TwitchConfig extends StreamConfig {
  streamKey: string;
  rtmpUrl?: string;
}

export class TwitchStream extends BaseStream {
  private streamKey: string;
  private rtmpUrl: string;

  constructor(config: TwitchConfig) {
    super(config);
    this.streamKey = config.streamKey;
    this.rtmpUrl = config.rtmpUrl || "rtmp://live.twitch.tv/live";

    if (!this.streamKey) {
      throw new Error("Twitch stream key is required");
    }
  }

  protected getStreamArgs(): string[] {
    return [
      `${this.rtmpUrl}/${this.streamKey}`
    ];
  }

  protected getPlatformName(): string {
    return "Twitch";
  }

  /**
   * Update stream key without restarting
   */
  public updateStreamKey(newKey: string): void {
    this.streamKey = newKey;
    this.logger.info(`🔑 Stream key updated`);
  }

  /**
   * Update RTMP server (for different Twitch ingest servers)
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