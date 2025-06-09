import { BaseStream } from "../base/BaseStream.js";
import type { StreamConfig } from "../base/BaseStream.js";

export interface YouTubeConfig extends StreamConfig {
  streamKey: string;
  rtmpUrl?: string;
  enableBackup?: boolean;
  backupRtmpUrl?: string;
}

export interface YouTubeStreamInfo {
  rtmpUrl: string;
  backupRtmpUrl?: string;
  keyMasked: string;
  isUsingBackup: boolean;
}

export class YouTubeStream extends BaseStream {
  private streamKey: string;
  private rtmpUrl: string;
  private backupRtmpUrl?: string;
  private enableBackup: boolean;
  private isUsingBackup = false;
  private connectionTestCount = 0;
  private readonly maxConnectionTests = 3;

  private static readonly YOUTUBE_RTMP_SERVERS = [
    "rtmp://a.rtmp.youtube.com/live2",
    "rtmp://b.rtmp.youtube.com/live2",
    "rtmp://c.rtmp.youtube.com/live2",
    "rtmp://d.rtmp.youtube.com/live2"
  ];

  constructor(config: YouTubeConfig) {
    // YouTube-optimized default settings
    const youtubeDefaults: Partial<StreamConfig> = {
      resolution: "1920x1080",
      framerate: 30,
      videoBitrate: "2500k",
      audioBitrate: "128k",
      videoCodec: "libx264",
      audioCodec: "aac"
    };

    super({ ...youtubeDefaults, ...config });

    this.streamKey = config.streamKey;
    this.rtmpUrl = config.rtmpUrl || YouTubeStream.YOUTUBE_RTMP_SERVERS[0];
    this.backupRtmpUrl = config.backupRtmpUrl || YouTubeStream.YOUTUBE_RTMP_SERVERS[1];
    this.enableBackup = config.enableBackup ?? true;

    this.validateConfiguration();
  }

  /**
   * Validate YouTube-specific configuration
   */
  private validateConfiguration(): void {
    if (!this.streamKey) {
      throw new Error("YouTube stream key is required");
    }

    this.validateStreamKey();
    this.validateRtmpUrl(this.rtmpUrl);

    if (this.backupRtmpUrl) {
      this.validateRtmpUrl(this.backupRtmpUrl);
    }
  }

  /**
   * Validate stream key format and provide feedback
   */
  private validateStreamKey(): void {
    // YouTube stream keys are typically 20-24 characters with letters, numbers, and hyphens
    if (this.streamKey.length < 16 || this.streamKey.length > 30) {
      this.logger.warn("⚠️ Stream key length seems unusual for YouTube (expected 16-30 characters)");
    }

    if (!/^[a-zA-Z0-9\-_]+$/.test(this.streamKey)) {
      this.logger.warn("⚠️ Stream key contains unexpected characters");
    }

    // Check for common mistakes
    if (this.streamKey.includes('youtube.com') || this.streamKey.includes('rtmp://')) {
      throw new Error("Stream key should not contain URLs. Please provide only the stream key.");
    }

    this.logger.info(`🔑 Using stream key: ${this.maskStreamKey()}`);
  }

  /**
   * Validate RTMP URL format
   */
  private validateRtmpUrl(url: string): void {
    if (!url.startsWith('rtmp://') && !url.startsWith('rtmps://')) {
      throw new Error(`Invalid RTMP URL format: ${url}. Must start with rtmp:// or rtmps://`);
    }

    if (!url.includes('youtube.com')) {
      this.logger.warn(`⚠️ RTMP URL does not appear to be a YouTube server: ${url}`);
    }
  }

  /**
   * Mask stream key for logging
   */
  private maskStreamKey(): string {
    return `${this.streamKey.slice(0, 8)}...${this.streamKey.slice(-4)}`;
  }

  protected getStreamArgs(): string[] {
    const currentUrl = this.isUsingBackup ? this.backupRtmpUrl! : this.rtmpUrl;
    return [`${currentUrl}/${this.streamKey}`];
  }

  protected getPlatformName(): string {
    return "YouTube";
  }

  /**
   * Enhanced start method with YouTube-specific diagnostics and backup server support
   */
  public override async start(): Promise<void> {
    this.logger.info("🎬 Starting YouTube Live stream...");
    this.printStreamConfiguration();

    // Test primary connection first
    const primaryWorking = await this.testRTMPConnection(this.rtmpUrl);

    if (!primaryWorking && this.enableBackup && this.backupRtmpUrl) {
      this.logger.warn("⚠️ Primary RTMP server failed, trying backup server...");
      const backupWorking = await this.testRTMPConnection(this.backupRtmpUrl);

      if (backupWorking) {
        this.isUsingBackup = true;
        this.logger.info("✅ Using backup RTMP server");
      } else {
        this.logger.warn("⚠️ Both primary and backup servers failed connection test");
        this.logger.info("💡 Continuing anyway - the test might be overly strict");
      }
    }

    await super.start();
  }

  /**
   * Print current stream configuration
   */
  private printStreamConfiguration(): void {
    const currentUrl = this.isUsingBackup ? this.backupRtmpUrl! : this.rtmpUrl;

    this.logger.info(`📡 RTMP Server: ${currentUrl}${this.isUsingBackup ? ' (backup)' : ''}`);
    this.logger.info(`🔧 Settings: ${this.config.resolution}@${this.config.framerate}fps`);
    this.logger.info(`📊 Bitrates: Video ${this.config.videoBitrate}, Audio ${this.config.audioBitrate}`);
    this.logger.info(`🎛️ Codecs: Video ${this.config.videoCodec}, Audio ${this.config.audioCodec}`);

    if (this.enableBackup) {
      this.logger.info(`🔄 Backup server: ${this.enableBackup ? 'Enabled' : 'Disabled'}`);
    }
  }

  /**
   * Test RTMP connection to YouTube with timeout
   */
  private async testRTMPConnection(rtmpUrl: string): Promise<boolean> {
    if (this.connectionTestCount >= this.maxConnectionTests) {
      this.logger.warn("⚠️ Maximum connection tests reached, skipping...");
      return false;
    }

    this.connectionTestCount++;
    this.logger.info(`🔍 Testing RTMP connection to ${rtmpUrl}... (${this.connectionTestCount}/${this.maxConnectionTests})`);

    try {
      // Quick connection test with minimal FFmpeg command and timeout
      const testProcess = Bun.spawn([
        "ffmpeg",
        "-f", "lavfi",
        "-i", "testsrc2=duration=1:size=320x240:rate=1",
        "-f", "lavfi",
        "-i", "sine=frequency=1000:duration=1",
        "-c:v", "libx264",
        "-c:a", "aac",
        "-t", "1",
        "-f", "flv",
        `${rtmpUrl}/${this.streamKey}`
      ], {
        stdio: ["ignore", "pipe", "pipe"]
      });

      // Set a timeout for the connection test
      const timeoutId = setTimeout(() => {
        testProcess.kill();
      }, 10000); // 10 second timeout

      const exitCode = await testProcess.exited;
      clearTimeout(timeoutId);

      if (exitCode === 0) {
        this.logger.info("✅ RTMP connection test successful");
        return true;
      } else {
        this.logger.warn(`⚠️ RTMP connection test failed with exit code: ${exitCode}`);
        return false;
      }
    } catch (error) {
      this.logger.warn("⚠️ Could not test RTMP connection:", error);
      return false;
    }
  }

  /**
   * Switch to backup server if available
   */
  public async switchToBackupServer(): Promise<boolean> {
    if (!this.enableBackup || !this.backupRtmpUrl || this.isUsingBackup) {
      this.logger.warn("⚠️ Backup server not available or already in use");
      return false;
    }

    this.logger.info("🔄 Switching to backup RTMP server...");

    const wasActive = this.isActive;
    if (wasActive) {
      await this.stop();
    }

    this.isUsingBackup = true;

    if (wasActive) {
      await this.start();
    }

    this.logger.info("✅ Switched to backup server");
    return true;
  }

  /**
   * Switch back to primary server
   */
  public async switchToPrimaryServer(): Promise<boolean> {
    if (!this.isUsingBackup) {
      this.logger.warn("⚠️ Already using primary server");
      return false;
    }

    this.logger.info("🔄 Switching back to primary RTMP server...");

    const wasActive = this.isActive;
    if (wasActive) {
      await this.stop();
    }

    this.isUsingBackup = false;

    if (wasActive) {
      await this.start();
    }

    this.logger.info("✅ Switched back to primary server");
    return true;
  }

  /**
   * Get optimal bitrate recommendations based on resolution
   */
  public getBitrateRecommendations(): { video: string; audio: string } {
    const resolution = this.config.resolution;
    const framerate = this.config.framerate;

    // YouTube recommended bitrates
    const recommendations: Record<string, { video: string; audio: string }> = {
      "426x240": { video: "300k", audio: "64k" },
      "640x360": { video: "400k", audio: "96k" },
      "854x480": { video: "1000k", audio: "128k" },
      "1280x720": framerate <= 30 ? { video: "2500k", audio: "128k" } : { video: "4000k", audio: "128k" },
      "1920x1080": framerate <= 30 ? { video: "4000k", audio: "192k" } : { video: "6000k", audio: "192k" },
      "2560x1440": framerate <= 30 ? { video: "9000k", audio: "192k" } : { video: "13500k", audio: "192k" },
      "3840x2160": framerate <= 30 ? { video: "20000k", audio: "192k" } : { video: "30000k", audio: "192k" }
    };

    return recommendations[resolution] || { video: "2500k", audio: "128k" };
  }

  /**
   * Apply YouTube's recommended settings
   */
  public applyYouTubeRecommendedSettings(): void {
    const recommendations = this.getBitrateRecommendations();

    this.updateConfig({
      videoBitrate: recommendations.video,
      audioBitrate: recommendations.audio,
      videoCodec: "libx264",
      audioCodec: "aac"
    });

    this.logger.info("📋 Applied YouTube recommended settings");
    this.logger.info(`   Video: ${recommendations.video} | Audio: ${recommendations.audio}`);
  }

  /**
   * YouTube-specific troubleshooting info
   */
  public printYouTubeTroubleshooting(): void {
    const recommendations = this.getBitrateRecommendations();

    this.logger.info(`
🔧 YouTube Live Troubleshooting:

📋 Requirements:
   • YouTube channel must be verified (phone number)
   • Live streaming must be enabled (no live streaming restrictions in past 90 days)
   • For mobile: Need 50+ subscribers OR channel verification

🔑 Stream Key Issues:
   • Go to YouTube Studio → Create → Go Live → Stream
   • Copy the Stream Key exactly (no extra spaces)
   • Stream keys are case-sensitive

📡 Network Issues:
   • Check firewall settings (allow port 1935 for RTMP)
   • Try different RTMP servers (backup feature enabled: ${this.enableBackup})

⚙️  Current Settings:
   • RTMP URL: ${this.isUsingBackup ? this.backupRtmpUrl : this.rtmpUrl}${this.isUsingBackup ? ' (backup)' : ''}
   • Stream Key: ${this.maskStreamKey()}
   • Resolution: ${this.config.resolution}
   • Frame Rate: ${this.config.framerate} fps
   • Video Bitrate: ${this.config.videoBitrate} (recommended: ${recommendations.video})
   • Audio Bitrate: ${this.config.audioBitrate} (recommended: ${recommendations.audio})

💡 Optimization Tips:
   • Use recommended bitrates for your resolution
   • Ensure stable internet (upload speed > video bitrate + 20%)
   • Consider using backup server if primary fails
   • Start your stream in YouTube Studio BEFORE running this tool
   • It can take 20-60 seconds for YouTube to recognize the stream

🏥 Health Check:
   • Connection tests performed: ${this.connectionTestCount}/${this.maxConnectionTests}
   • Currently using: ${this.isUsingBackup ? 'Backup' : 'Primary'} server
   • Backup available: ${this.enableBackup && this.backupRtmpUrl ? 'Yes' : 'No'}
`);
  }

  /**
   * Update stream key without restarting
   */
  public updateStreamKey(newKey: string): void {
    this.streamKey = newKey;
    this.validateStreamKey();
    this.logger.info(`🔑 Stream key updated`);
  }

  /**
   * Update RTMP server
   */
  public updateRtmpUrl(newUrl: string, isBackup = false): void {
    this.validateRtmpUrl(newUrl);

    if (isBackup) {
      this.backupRtmpUrl = newUrl;
      this.logger.info(`🌐 Backup RTMP URL updated: ${newUrl}`);
    } else {
      this.rtmpUrl = newUrl;
      this.logger.info(`🌐 Primary RTMP URL updated: ${newUrl}`);
    }
  }

  /**
   * Get comprehensive stream info
   */
  public getStreamInfo(): YouTubeStreamInfo {
    return {
      rtmpUrl: this.rtmpUrl,
      backupRtmpUrl: this.backupRtmpUrl,
      keyMasked: this.maskStreamKey(),
      isUsingBackup: this.isUsingBackup
    };
  }

  /**
   * Get available YouTube RTMP servers
   */
  public static getAvailableServers(): string[] {
    return [...YouTubeStream.YOUTUBE_RTMP_SERVERS];
  }

  /**
   * Test all available YouTube servers and return the best one
   */
  public async findBestServer(): Promise<string> {
    this.logger.info("🔍 Testing all YouTube RTMP servers to find the best one...");

    const servers = YouTubeStream.YOUTUBE_RTMP_SERVERS;
    const results: { server: string; working: boolean; responseTime: number }[] = [];

    for (const server of servers) {
      const startTime = Date.now();
      const working = await this.testRTMPConnection(server);
      const responseTime = Date.now() - startTime;

      results.push({ server, working, responseTime });

      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Find the fastest working server
    const workingServers = results.filter(r => r.working);

    if (workingServers.length === 0) {
      this.logger.warn("⚠️ No servers responded successfully, using default");
      return servers[0];
    }

    const bestServer = workingServers.sort((a, b) => a.responseTime - b.responseTime)[0];
    this.logger.info(`✅ Best server found: ${bestServer.server} (${bestServer.responseTime}ms)`);

    return bestServer.server;
  }
} 