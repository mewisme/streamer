# 🎬 Bun FFmpeg Streamer

A powerful video streaming library built with Bun and TypeScript that supports streaming to multiple live platforms simultaneously using FFmpeg.

## 🚀 Features

- **Multi-Platform Support**: Stream to YouTube, Twitch, Facebook, Kick, TikTok, and custom RTMP endpoints
- **Queue Management**: Add/remove videos dynamically without interrupting the stream
- **URL Support**: Stream from HTTP/HTTPS URLs, HLS streams, DASH streams, and more
- **Continuous Streaming**: Automatically loops through your video queue
- **Placeholder Video**: Auto-generates a placeholder when queue is empty
- **Multi-Streaming**: Stream to multiple platforms simultaneously
- **TypeScript**: Fully typed codebase for better development experience
- **Simple API**: Easy to import and use in your projects

## 📋 Prerequisites

- [Bun](https://bun.sh/) runtime installed
- [FFmpeg](https://ffmpeg.org/) installed and available in PATH
- Stream keys for your target platforms

## 🛠️ Installation

1. Clone or download this project
2. Install dependencies:
   ```bash
   bun install
   ```

## 🎯 Usage

### Basic Example

Create a file (e.g., `my-stream.ts`) and import the streaming classes:

```typescript
import { YouTubeStream } from "./src/index.js";

// Create a stream instance
const stream = new YouTubeStream({
  streamKey: "your-youtube-stream-key-here"
});

// Add videos to queue
stream.addToQueue("video1.mp4", "video2.mp4");

// Start streaming
await stream.start();
```

### Multi-Platform Streaming

```typescript
import { YouTubeStream, TwitchStream, FacebookStream } from "./src/index.js";

// Create multiple streams
const youtube = new YouTubeStream({ streamKey: "youtube-key" });
const twitch = new TwitchStream({ streamKey: "twitch-key" });
const facebook = new FacebookStream({ streamKey: "facebook-key" });

// Add videos to all streams
[youtube, twitch, facebook].forEach(stream => {
  stream.addToQueue("video1.mp4", "video2.mp4");
});

// Start all streams simultaneously
await Promise.all([
  youtube.start(),
  twitch.start(),
  facebook.start()
]);
```

### Custom Configuration

```typescript
import { YouTubeStream } from "./src/index.js";

const stream = new YouTubeStream({
  streamKey: "your-key",
  resolution: "1920x1080",
  framerate: 60,
  videoBitrate: "6000k",
  audioBitrate: "320k",
  videoCodec: "libx264",
  audioCodec: "aac"
});
```

### Dynamic Queue Management

```typescript
import { TwitchStream } from "./src/index.js";

const stream = new TwitchStream({ streamKey: "your-key" });

// Start with initial videos
stream.addToQueue("intro.mp4", "main-content.mp4");
await stream.start();

// Add more videos while streaming (no interruption)
setTimeout(() => {
  stream.addToQueue("outro.mp4", "bonus-content.mp4");
}, 60000);

// Remove video from queue
stream.removeFromQueue(0); // Remove first video

// Clear entire queue
stream.clearQueue();

// Check status
const status = stream.getStatus();
console.log(`Currently streaming: ${status.currentFile}`);
console.log(`Videos in queue: ${status.queueCount}`);
```

### Custom RTMP Server

```typescript
import { CustomRTMPStream } from "./src/index.js";

const stream = new CustomRTMPStream({
  rtmpUrl: "rtmp://your-server.com/live",
  streamKey: "your-stream-key",
  platformName: "My Custom Server"
});
```

### Video Sources Support

You can add various types of video sources to your stream:

```typescript
import { YouTubeStream } from "./src/index.js";

const stream = new YouTubeStream({ streamKey: "your-key" });

// 1. Local video files
stream.addToQueue("video.mp4", "movie.avi", "clip.mov");

// 2. HTTP/HTTPS video URLs
stream.addToQueue("https://example.com/video.mp4");

// 3. HLS streams (.m3u8)
stream.addToQueue("https://example.com/stream.m3u8");

// 4. DASH streams
stream.addToQueue("https://example.com/manifest.mpd");

// 5. RTMP streams
stream.addToQueue("rtmp://example.com/stream");

// 6. Mix local files and URLs
stream.addToQueue(
  "intro.mp4",                           // Local file
  "https://cdn.example.com/main.mp4",    // HTTP URL
  "outro.mp4"                            // Local file
);

await stream.start();
```

## 📚 Available Classes

- `YouTubeStream` - Stream to YouTube Live
- `TwitchStream` - Stream to Twitch
- `FacebookStream` - Stream to Facebook Live  
- `KickStream` - Stream to Kick
- `TikTokStream` - Stream to TikTok Live
- `CustomRTMPStream` - Stream to any RTMP server

## 🔧 Configuration Options

All stream classes accept these configuration options:

```typescript
interface StreamConfig {
  resolution?: string;      // "1920x1080", "1280x720", etc.
  framerate?: number;       // 30, 60, etc.
  videoBitrate?: string;    // "2500k", "6000k", etc.
  audioBitrate?: string;    // "128k", "320k", etc.
  videoCodec?: string;      // "libx264", "libx265", etc.
  audioCodec?: string;      // "aac", "mp3", etc.
}
```

## 🔄 Stream Management

### Methods Available on All Stream Classes:

```typescript
// Queue management
stream.addToQueue(...videoPaths: string[]): void
stream.removeFromQueue(index: number): boolean
stream.clearQueue(): void

// Stream control
await stream.start(): Promise<void>
await stream.stop(): Promise<void>
await stream.restart(): Promise<void>

// Status and info
stream.getStatus(): StreamStatus
stream.printQueueStatus(): void
```

## 🏃‍♂️ Quick Start

1. Copy `simple-example.ts` or `example.ts`
2. Replace `"your-youtube-stream-key-here"` with your actual stream key
3. Replace `"video1.mp4"` with your actual video files
4. Run: `bun run simple-example.ts`

## 🎥 Video Queue Management

- **Dynamic Addition**: Add videos while streaming without interruption
- **Automatic Looping**: Continuously streams from your queue
- **Placeholder Fallback**: Shows "No video in queue" when empty
- **Real-time Updates**: Queue changes take effect immediately

## 🔍 Troubleshooting

### Common Issues

1. **FFmpeg not found**
   - Ensure FFmpeg is installed and in your PATH
   - Test with: `ffmpeg -version`

2. **Stream connection failed**
   - Verify your stream keys are correct
   - Check your internet connection
   - Ensure the RTMP URLs are correct for your region

3. **Video format issues**
   - Use common video formats (MP4, MOV, AVI)
   - Ensure videos are not corrupted

4. **Performance issues**
   - Lower the bitrate in configuration
   - Ensure sufficient CPU and bandwidth

## 🚀 Development

### Building

```bash
# Build the project
bun run build

# Run the example
bun run example

# Run simple example
bun run simple-example.ts
```

### CLI Tool (Optional)

If you want to use the CLI tool:

```bash
# Use the interactive CLI
bun run cli interactive

# Or direct commands
bun run cli start youtube
```

## 📝 License

This project is open source. Feel free to use, modify, and distribute according to your needs.

## ⚠️ Disclaimer

- Ensure you have the right to stream your content
- Respect platform terms of service
- Use appropriate stream keys and keep them secure
- Test thoroughly before going live

Happy Streaming! 🎉
