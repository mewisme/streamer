# 🎬 Bun FFmpeg Streamer

A powerful, TypeScript-first video streaming library built with Bun and FFmpeg that supports streaming to multiple live platforms simultaneously.

## 🚀 Features

- **🎯 Multi-Platform Support**: Stream to YouTube, Twitch, Facebook, Kick, TikTok, and custom RTMP servers
- **📁 Queue Management**: Dynamically add/remove videos, files, URLs, and streams without interrupting playback
- **🌐 Multiple Source Types**: Support for local files, HTTP/HTTPS URLs, HLS streams (.m3u8), DASH streams, and RTMP streams
- **🔄 Continuous Streaming**: Automatic looping through video queue with seamless transitions
- **📊 Health Monitoring**: Real-time stream health status with automatic retry mechanisms
- **🎛️ Quality Control**: CRF and bitrate encoding options for optimal quality/performance balance
- **🔧 Database Integration**: Built-in video database with shuffling and usage statistics
- **📈 Stream Analytics**: Detailed progress monitoring with fps, bitrate, and timing information
- **🛠️ Debug Logging**: Comprehensive FFmpeg output logging for troubleshooting
- **🎪 Multi-Streaming**: Stream to multiple platforms simultaneously
- **✨ TypeScript**: Fully typed codebase with comprehensive interfaces

## 📋 Prerequisites

- [Bun](https://bun.sh/) runtime (latest version recommended)
- [FFmpeg](https://ffmpeg.org/) installed and available in system PATH
- Valid stream keys for your target platforms

## 🛠️ Installation

```bash
# Clone this repository
git clone https://github.com/mewisme/streamer.git
cd streamer

# Install dependencies
bun install

# Build the project
bun run build

# Build the crawler
bun run build:crawler
```

## 🎯 Quick Start

### Basic Streaming Example

```typescript
import { YouTubeStream } from "./dist/index.js";

const stream = new YouTubeStream({
  streamKey: "your-youtube-stream-key-here",
  resolution: "1920x1080",
  framerate: 30,
  videoBitrate: "2500k"
});

// Add videos to queue
stream.addToQueue("video1.mp4", "video2.mp4");

// Enable looping
stream.setLoop(true);

// Start streaming
await stream.start();
```

### Multi-Platform Streaming

```typescript
import { YouTubeStream, TwitchStream, KickStream } from "./dist/index.js";

// Create multiple platform streams
const youtube = new YouTubeStream({ streamKey: "youtube-key" });
const twitch = new TwitchStream({ streamKey: "twitch-key" });
const kick = new KickStream({ streamKey: "kick-key" });

const streams = [youtube, twitch, kick];

// Configure all streams
streams.forEach(stream => {
  stream.addToQueue("intro.mp4", "main-content.mp4", "outro.mp4");
  stream.setLoop(true);
});

// Start all streams simultaneously
await Promise.all(streams.map(stream => stream.start()));
```

### Using Database for Video Management

```typescript
import { YouTubeStream } from "./dist/index.js";

const stream = new YouTubeStream({
  streamKey: "your-key",
  resolution: "720x1280",  // Vertical format
  framerate: 30
});

// Load videos from database and start streaming
stream.setLoop(true);
await stream.loadDatabase();  // Loads and shuffles videos from data.json
await stream.start();
```

## 📚 Available Streaming Platforms

| Platform | Class | Required Config |
|----------|-------|----------------|
| **YouTube Live** | `YouTubeStream` | `streamKey` |
| **Twitch** | `TwitchStream` | `streamKey` |
| **Facebook Live** | `FacebookStream` | `streamKey` |
| **Kick** | `KickStream` | `streamKey` |
| **TikTok Live** | `TikTokStream` | `streamKey` |
| **Custom RTMP** | `CustomRTMPStream` | `rtmpUrl`, `streamKey` |

## 🔧 Configuration Options

### StreamConfig Interface

```typescript
interface StreamConfig {
  resolution?: string;      // Default: "1080x1920"
  framerate?: number;       // Default: 30, Range: 1-120
  videoBitrate?: string;    // Default: "2500k", Format: "2500k"
  audioBitrate?: string;    // Default: "128k", Format: "128k"
  videoCodec?: string;      // Default: "libx264"
  audioCodec?: string;      // Default: "aac"
  useCRF?: boolean;        // Default: false, Use CRF instead of bitrate
}
```

### Platform-Specific Configurations

```typescript
// YouTube with backup server
const youtube = new YouTubeStream({
  streamKey: "your-key",
  rtmpUrl: "rtmp://a.rtmp.youtube.com/live2",  // Optional: custom server
  enableBackup: true,                          // Enable backup server
  backupRtmpUrl: "rtmp://b.rtmp.youtube.com/live2"
});

// Custom RTMP server
const custom = new CustomRTMPStream({
  rtmpUrl: "rtmp://your-server.com/live",
  streamKey: "your-key",
  platformName: "My Custom Server",  // Optional: for logging
  resolution: "1920x1080",
  useCRF: true  // Use CRF for better quality
});
```

## 🎮 Queue Management

### Adding Video Sources

```typescript
// Multiple source types supported
stream.addToQueue(
  "local-video.mp4",                          // Local file
  "https://cdn.example.com/video.mp4",        // HTTP/HTTPS URL
  "https://example.com/stream.m3u8",          // HLS stream
  "https://example.com/manifest.mpd",         // DASH stream
  "rtmp://source.example.com/stream"          // RTMP stream
);

// Sources are automatically validated and categorized
// Invalid sources (missing files, broken URLs) are filtered out
```

### Queue Operations

```typescript
// Remove video by index
stream.removeFromQueue(0);

// Clear entire queue
stream.clearQueue();

// Print current queue status
stream.printQueueStatus();
```

## 📊 Stream Monitoring

### Getting Stream Status

```typescript
const status = stream.getStatus();

interface StreamStatus {
  isStreaming: boolean;
  currentFile: string | null;
  queueCount: number;
  totalStreamed: number;
  uptime: number;
  health: 'healthy' | 'warning' | 'error';
}

console.log(`Status: ${status.health}`);
console.log(`Currently playing: ${status.currentFile}`);
console.log(`Queue size: ${status.queueCount}`);
console.log(`Uptime: ${status.uptime}ms`);
```

### Health Monitoring

The library automatically monitors stream health:
- **Healthy**: Stream running normally
- **Warning**: Stream recovered from errors (retry count > 1)
- **Error**: Stream not active or failed

## 🛠️ Advanced Usage

### Stream Lifecycle Management

```typescript
// Start streaming
await stream.start();

// Stop streaming
await stream.stop();

// Restart streaming (stop + start)
await stream.restart();

// Update configuration without restarting
stream.updateConfig({
  resolution: "1920x1080",
  framerate: 60
});
```

### Debug Logging

```typescript
// Enable debug logging via environment variable
Bun.env.DEBUG = "true";

// Or programmatically when creating streams
const stream = new YouTubeStream({
  streamKey: "your-key"
});

// Debug output includes:
// - FFmpeg command and arguments
// - Process lifecycle events
// - Stream progress (fps, bitrate, time)
// - Error details and retry attempts
```

### Custom RTMP Features

```typescript
const customStream = new CustomRTMPStream({
  rtmpUrl: "rtmp://example.com/live",
  streamKey: "initial-key",
  platformName: "Custom Platform"
});

// Update stream settings without restarting
customStream.updateStreamKey("new-key");
customStream.updateRtmpUrl("rtmp://new-server.com/live");
customStream.updatePlatformName("Updated Platform");

// Get stream information
const info = customStream.getStreamInfo();
console.log(info.rtmpUrl);     // Current RTMP URL
console.log(info.keyMasked);   // Masked stream key (first 8 + ... + last 4)
console.log(info.platformName); // Platform name
```

## 🗄️ Database Integration

### Video Database Management

The library includes a built-in JSON database for managing video collections:

```typescript
import { Database } from "./dist/index.js";

const db = new Database();
await db.init();

// Add videos to database
await db.add("https://example.com/video.mp4", "local-copy.mp4");

// Load and shuffle database videos into stream
await stream.loadDatabase();

// Database features:
// - Automatic migration from legacy formats
// - Usage statistics tracking
// - Search functionality
// - Cleanup utilities
```

## 📝 Example Scripts

The repository includes example scripts in the `scripts/` directory:

- `stream.ts` - Basic YouTube streaming with database integration
- `tiktok.ts` - TikTok video URL extraction utility

## ⚡ Performance Tips

1. **Resolution**: Use `1080x1920` (portrait) for mobile platforms, `1920x1080` (landscape) for desktop
2. **Bitrate**: Start with `2500k` video / `128k` audio, adjust based on platform requirements
3. **CRF Mode**: Enable `useCRF: true` for better quality at variable bitrates
4. **Queue Management**: Pre-load videos to avoid streaming interruptions
5. **Health Monitoring**: Monitor `stream.getStatus().health` for automatic issue detection

## 🔍 Troubleshooting

### Common Issues

1. **FFmpeg not found**: Ensure FFmpeg is installed and in system PATH
2. **Stream key invalid**: Verify stream keys are correct and active
3. **File not found**: Check file paths and permissions
4. **Network issues**: URLs and streams need stable internet connection

### Debug Information

Enable debug logging to see detailed FFmpeg output:

```bash
DEBUG=true bun run your-script.ts
```

This provides:
- Complete FFmpeg commands
- Real-time encoding progress
- Error messages and retry attempts
- Stream health status changes

## 📄 License

[MIT](LICENSE) Copyright 2025 mewisme

## 🤝 Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.