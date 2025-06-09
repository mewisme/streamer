import { Database } from "../utils/database.js";
import { Logger } from "../utils/logger.js";
import { existsSync } from "fs";

export interface StreamConfig {
  resolution?: string;
  framerate?: number;
  videoBitrate?: string;
  audioBitrate?: string;
  videoCodec?: string;
  audioCodec?: string;
}

export interface StreamStatus {
  isStreaming: boolean;
  currentFile: string | null;
  queueCount: number;
  totalStreamed: number;
  uptime: number;
  health: 'healthy' | 'warning' | 'error';
}

export interface VideoSource {
  path: string;
  type: 'file' | 'url' | 'stream';
  isValid: boolean;
}

export abstract class BaseStream {
  protected readonly videoQueue: VideoSource[] = [];
  protected readonly videoQueueTemp: VideoSource[] = [];
  protected currentStreamProcess: any = null;
  protected isActive = false;
  protected isLoop = false;
  protected readonly placeholderPath = "tmp/placeholder.mp4";
  protected currentFile: string | null = null;
  protected totalStreamed = 0;
  protected readonly logger: Logger;
  protected startTime: number = 0;
  protected readonly MAX_RETRY_ATTEMPTS = 3;
  protected retryCount = 0;

  protected readonly config: Required<StreamConfig>;

  private readonly DEFAULT_CONFIG: Required<StreamConfig> = {
    resolution: "1080x1920",
    framerate: 30,
    videoBitrate: "2500k",
    audioBitrate: "128k",
    videoCodec: "libx264",
    audioCodec: "aac"
  };

  constructor(config: Partial<StreamConfig> = {}) {
    this.config = { ...this.DEFAULT_CONFIG, ...config };
    this.logger = new Logger(this.getPlatformName().toUpperCase());
    this.validateConfig();
  }

  /**
   * Abstract methods to be implemented by platform-specific classes
   */
  protected abstract getStreamArgs(): string[];
  protected abstract getPlatformName(): string;

  /**
   * Validate stream configuration
   */
  private validateConfig(): void {
    const { resolution, framerate, videoBitrate, audioBitrate } = this.config;

    if (!resolution.match(/^\d+x\d+$/)) {
      throw new Error(`Invalid resolution format: ${resolution}. Expected format: 1920x1080`);
    }

    if (framerate <= 0 || framerate > 120) {
      throw new Error(`Invalid framerate: ${framerate}. Must be between 1-120`);
    }

    if (!videoBitrate.match(/^\d+k$/)) {
      throw new Error(`Invalid video bitrate format: ${videoBitrate}. Expected format: 2500k`);
    }

    if (!audioBitrate.match(/^\d+k$/)) {
      throw new Error(`Invalid audio bitrate format: ${audioBitrate}. Expected format: 128k`);
    }
  }

  /**
   * Check if a path is a URL
   */
  private isUrl(path: string): boolean {
    try {
      const url = new URL(path);
      return ['http:', 'https:', 'rtmp:', 'rtmps:'].includes(url.protocol);
    } catch {
      return false;
    }
  }

  /**
   * Determine video source type and validate
   */
  private analyzeVideoSource(source: string): VideoSource {
    const isUrl = this.isUrl(source);
    const type = isUrl ? (source.includes('.m3u8') || source.includes('rtmp') ? 'stream' : 'url') : 'file';

    let isValid = false;
    if (isUrl) {
      isValid = true; // Assume URLs are valid, FFmpeg will handle validation
    } else {
      isValid = existsSync(source);
      if (!isValid) {
        this.logger.warn(`Video file not found: ${source}`);
      }
    }

    return { path: source, type, isValid };
  }

  /**
   * Set loop mode
   */
  public setLoop(loop: boolean): void {
    this.isLoop = loop;
    this.logger.info(`🔄 Loop mode: ${loop ? 'enabled' : 'disabled'}`);
  }

  /**
   * Load database and add videos to queue
   */
  public async loadDatabase(): Promise<void> {
    try {
      const database = new Database();
      await database.init();
      const shuffledData = await database.shuffleData();
      const videoPaths = Object.values(shuffledData).map(entry => entry.source);

      if (videoPaths.length > 0) {
        this.addToQueue(...videoPaths);
        this.logger.info(`📚 Loaded ${videoPaths.length} videos from database`);
      }
    } catch (error) {
      this.logger.error('Failed to load database:', error);
    }
  }

  /**
   * Add video sources to the streaming queue
   */
  public addToQueue(...videoPaths: string[]): void {
    const newSources = videoPaths
      .filter(path => !this.videoQueue.some(source => source.path === path))
      .map(path => this.analyzeVideoSource(path))
      .filter(source => source.isValid);

    if (newSources.length === 0) {
      this.logger.warn('No valid video sources to add');
      return;
    }

    this.videoQueue.push(...newSources);

    const stats = this.getQueueStatistics(newSources);
    this.logger.info(`📥 Added ${newSources.length} source(s) to queue ${stats}. Total: ${this.videoQueue.length}`);
  }

  /**
   * Get statistics about video sources
   */
  private getQueueStatistics(sources?: VideoSource[]): string {
    const sourcesToAnalyze = sources || this.videoQueue;
    const fileCount = sourcesToAnalyze.filter(s => s.type === 'file').length;
    const urlCount = sourcesToAnalyze.filter(s => s.type === 'url').length;
    const streamCount = sourcesToAnalyze.filter(s => s.type === 'stream').length;

    const parts = [];
    if (fileCount > 0) parts.push(`${fileCount} file(s)`);
    if (urlCount > 0) parts.push(`${urlCount} URL(s)`);
    if (streamCount > 0) parts.push(`${streamCount} stream(s)`);

    return parts.length > 0 ? `(${parts.join(', ')})` : '';
  }

  /**
   * Remove video from queue by index
   */
  public removeFromQueue(index: number): boolean {
    if (index < 0 || index >= this.videoQueue.length) {
      this.logger.warn(`Invalid queue index: ${index}`);
      return false;
    }

    const removed = this.videoQueue.splice(index, 1);
    if (removed.length > 0 && removed[0]) {
      this.logger.info(`🗑️ Removed from queue: ${removed[0].path}`);
      return true;
    }
    return false;
  }

  /**
   * Clear the entire queue
   */
  public clearQueue(): void {
    this.videoQueue.length = 0;
    this.videoQueueTemp.length = 0;
    this.logger.info('🧹 Queue cleared');
  }

  /**
   * Get the next video to stream
   */
  private getNextVideo(): string {
    if (this.videoQueueTemp.length > 0) {
      const nextVideo = this.videoQueueTemp.shift()!;
      this.totalStreamed++;
      return nextVideo.path;
    }

    if (this.isLoop && this.videoQueue.length > 0) {
      this.logger.info('🔄 Looping back to the first video');
      this.videoQueueTemp.push(...this.videoQueue);
      this.totalStreamed = 0;
      return this.getNextVideo();
    }

    return this.placeholderPath;
  }

  /**
   * Get current stream status with health information
   */
  public getStatus(): StreamStatus {
    const uptime = this.isActive ? Date.now() - this.startTime : 0;
    const health = this.determineHealth();

    return {
      isStreaming: this.isActive,
      currentFile: this.currentFile,
      queueCount: this.videoQueue.length,
      totalStreamed: this.totalStreamed,
      uptime,
      health
    };
  }

  /**
   * Determine stream health status
   */
  private determineHealth(): 'healthy' | 'warning' | 'error' {
    if (!this.isActive) return 'error';
    if (this.retryCount > 1) return 'warning';
    return 'healthy';
  }

  /**
   * Print detailed queue status
   */
  public printQueueStatus(): void {
    const status = this.getStatus();
    const stats = this.getQueueStatistics();

    this.logger.info('\n📊 Queue Status:');
    this.logger.info(`   Platform: ${this.getPlatformName()}`);
    this.logger.info(`   Status: ${this.isActive ? '🟢 Active' : '🔴 Inactive'}`);
    this.logger.info(`   Health: ${this.getHealthIcon(status.health)} ${status.health}`);
    this.logger.info(`   Currently streaming: ${this.currentFile || 'None'}`);
    this.logger.info(`   Videos in queue: ${this.videoQueue.length} ${stats}`);
    this.logger.info(`   Total streamed: ${this.totalStreamed}`);
    this.logger.info(`   Uptime: ${this.formatUptime(status.uptime)}`);

    if (this.videoQueue.length > 0) {
      this.logger.info('   Queue:');
      this.videoQueue.slice(0, 5).forEach((source, index) => {
        const icon = this.getSourceIcon(source.type);
        this.logger.info(`     ${index + 1}. ${icon} ${source.path}`);
      });

      if (this.videoQueue.length > 5) {
        this.logger.info(`     ... and ${this.videoQueue.length - 5} more`);
      }
    }
  }

  /**
   * Get health status icon
   */
  private getHealthIcon(health: string): string {
    switch (health) {
      case 'healthy': return '🟢';
      case 'warning': return '🟡';
      case 'error': return '🔴';
      default: return '⚪';
    }
  }

  /**
   * Get source type icon
   */
  private getSourceIcon(type: string): string {
    switch (type) {
      case 'file': return '📁';
      case 'url': return '🌐';
      case 'stream': return '📡';
      default: return '❓';
    }
  }

  /**
   * Format uptime in human-readable format
   */
  private formatUptime(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Build optimized FFmpeg command
   */
  private buildFFmpegCommand(inputFile: string): string[] {
    const preInputArgs: string[] = [
      "-hide_banner",
      "-loglevel", "warning",
      "-re"
    ];

    // Add headers before -i if needed
    if (this.isUrl(inputFile) && inputFile.includes('tiktok')) {
      this.logger.info("Adding tiktok headers");
      preInputArgs.push(
        "-headers",
        `Referer: https://www.tiktok.com/\r\nUser-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36\r\n`
      );
    }

    const inputArgs = [
      "-i", inputFile
    ];

    const postInputArgs = [
      "-c:v", this.config.videoCodec,
      "-c:a", this.config.audioCodec,
      "-b:v", this.config.videoBitrate,
      "-b:a", this.config.audioBitrate,
      "-s", this.config.resolution,
      "-r", this.config.framerate.toString(),
      "-g", Math.floor(this.config.framerate * 2).toString(),
      "-keyint_min", Math.floor(this.config.framerate).toString(),
      "-sc_threshold", "0",
      "-pix_fmt", "yuv420p",
      "-preset", "medium",
      "-tune", "zerolatency",
      "-threads", "0",
      "-flvflags", "no_duration_filesize",
      "-f", "flv",
      ...this.getStreamArgs()
    ];

    return [...preInputArgs, ...inputArgs, ...postInputArgs];
  }

  /**
   * Stream a single video with improved error handling
   */
  private async streamVideo(videoPath: string): Promise<void> {
    this.currentFile = videoPath;
    const isPlaceholder = videoPath === this.placeholderPath;

    if (isPlaceholder) {
      this.logger.info('🔄 Streaming placeholder (queue empty)');
    } else {
      this.logger.info(`▶️ Now streaming: ${videoPath}`);
    }

    const ffmpegArgs = this.buildFFmpegCommand(videoPath);

    try {
      this.currentStreamProcess = Bun.spawn(["ffmpeg", ...ffmpegArgs], {
        stdio: ["ignore", "pipe", "pipe"]
      });

      await this.handleStreamProcess(isPlaceholder, videoPath);

    } catch (error) {
      this.logger.error('❌ Failed to start FFmpeg:', error);
      await this.handleStreamError();
    }
  }

  /**
   * Handle stream process lifecycle
   */
  private async handleStreamProcess(isPlaceholder: boolean, videoPath: string): Promise<void> {
    if (!this.currentStreamProcess) return;

    // Handle stdout and stderr
    if (this.currentStreamProcess.stdout) {
      this.readStreamOutput(this.currentStreamProcess.stdout.getReader(), "stdout");
    }

    if (this.currentStreamProcess.stderr) {
      this.readStreamOutput(this.currentStreamProcess.stderr.getReader(), "stderr");
    }

    // Handle process completion
    try {
      const exitCode = await this.currentStreamProcess.exited;

      if (this.isActive) {
        if (exitCode === 0 || exitCode === 255) { // 255 is normal for terminated FFmpeg
          if (!isPlaceholder) {
            this.logger.info(`✅ Finished streaming: ${videoPath}`);
          }
          this.retryCount = 0; // Reset retry count on success
          await this.streamNext();
        } else {
          this.logger.error(`❌ FFmpeg error (exit code: ${exitCode})`);
          await this.handleStreamError();
        }
      }
    } catch (error) {
      this.logger.error('Error waiting for process exit:', error);
      await this.handleStreamError();
    }
  }

  /**
   * Handle streaming errors with retry logic
   */
  private async handleStreamError(): Promise<void> {
    this.retryCount++;

    if (this.retryCount <= this.MAX_RETRY_ATTEMPTS) {
      this.logger.warn(`🔄 Retrying... (${this.retryCount}/${this.MAX_RETRY_ATTEMPTS})`);
      await new Promise(resolve => setTimeout(resolve, 2000 * this.retryCount)); // Exponential backoff
      await this.streamNext();
    } else {
      this.logger.error('❌ Max retry attempts reached. Stopping stream.');
      await this.stop();
    }
  }

  /**
   * Read and process FFmpeg output streams
   */
  private async readStreamOutput(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    streamType: "stdout" | "stderr"
  ): Promise<void> {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = new TextDecoder().decode(value).trim();
        if (!text) continue;

        const lines = text.split('\n').filter(line => line.trim());

        for (const line of lines) {
          this.processFFmpegOutput(line, streamType);
        }
      }
    } catch (error) {
      if (this.isActive) {
        this.logger.error(`Error reading ${streamType}:`, error);
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // Reader may already be released
      }
    }
  }

  /**
   * Process and categorize FFmpeg output
   */
  private processFFmpegOutput(line: string, streamType: "stdout" | "stderr"): void {
    const lowercaseLine = line.toLowerCase();

    if (lowercaseLine.includes('error') || lowercaseLine.includes('failed')) {
      this.logger.error(`[FFmpeg] ${line}`);
    } else if (lowercaseLine.includes('warning') || lowercaseLine.includes('deprecated')) {
      this.logger.warn(`[FFmpeg] ${line}`);
    } else if (lowercaseLine.includes('frame=') || lowercaseLine.includes('fps=')) {
      this.logger.debug(`[FFmpeg] ${line}`);
    } else if (streamType === "stderr" && line.trim()) {
      this.logger.info(`[FFmpeg] ${line}`);
    }
  }

  /**
   * Continue streaming the next video
   */
  private async streamNext(): Promise<void> {
    if (!this.isActive) return;

    await new Promise(resolve => setTimeout(resolve, 1000));

    const nextVideo = this.getNextVideo();
    await this.streamVideo(nextVideo);
  }

  /**
   * Start the streaming process
   */
  public async start(): Promise<void> {
    if (this.isActive) {
      this.logger.warn('⚠️ Stream is already running');
      return;
    }

    try {
      await this.validatePlaceholder();

      this.logger.info(`🚀 Starting ${this.getPlatformName()} stream...`);
      this.printConfiguration();

      this.isActive = true;
      this.startTime = Date.now();
      this.retryCount = 0;
      this.videoQueueTemp.push(...this.videoQueue);

      const firstVideo = this.getNextVideo();
      await this.streamVideo(firstVideo);

    } catch (error) {
      this.logger.error('❌ Failed to start stream:', error);
      this.isActive = false;
      throw error;
    }
  }

  /**
   * Validate placeholder file existence
   */
  private async validatePlaceholder(): Promise<void> {
    const file = Bun.file(this.placeholderPath);
    const exists = await file.exists();

    if (!exists) {
      throw new Error(`Placeholder file not found: ${this.placeholderPath}`);
    }
  }

  /**
   * Print current configuration
   */
  private printConfiguration(): void {
    this.logger.info(`🔧 Configuration: ${this.config.resolution}@${this.config.framerate}fps`);
    this.logger.info(`📊 Bitrates: Video ${this.config.videoBitrate}, Audio ${this.config.audioBitrate}`);
    this.logger.info(`🎛️ Codecs: Video ${this.config.videoCodec}, Audio ${this.config.audioCodec}`);
  }

  /**
   * Stop the streaming process
   */
  public async stop(): Promise<void> {
    if (!this.isActive) {
      this.logger.warn('⚠️ Stream is not running');
      return;
    }

    this.logger.info('🛑 Stopping stream...');
    this.isActive = false;

    if (this.currentStreamProcess) {
      try {
        this.currentStreamProcess.kill();
        await new Promise(resolve => setTimeout(resolve, 1000)); // Give process time to exit
      } catch (error) {
        this.logger.warn('Error killing process:', error);
      }
      this.currentStreamProcess = null;
    }

    this.currentFile = null;
    this.retryCount = 0;
    this.logger.info('✅ Stream stopped');
  }

  /**
   * Restart the stream
   */
  public async restart(): Promise<void> {
    this.logger.info('🔄 Restarting stream...');
    await this.stop();
    await new Promise(resolve => setTimeout(resolve, 2000));
    await this.start();
  }

  /**
   * Get stream configuration
   */
  public getConfig(): Required<StreamConfig> {
    return { ...this.config };
  }

  /**
   * Update stream configuration (requires restart to take effect)
   */
  public updateConfig(newConfig: Partial<StreamConfig>): void {
    Object.assign(this.config, newConfig);
    this.validateConfig();
    this.logger.info('⚙️ Configuration updated (restart required)');
  }
} 