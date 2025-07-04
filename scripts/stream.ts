import { Logger, Server, YouTubeStream } from "../dist";

const logger = new Logger("Stream");

const streamKey = Bun.env.YOUTUBE_STREAM_KEY;
const port = Bun.env.PORT || 7777;

if (!streamKey) {
  logger.error("❌ YOUTUBE_STREAM_KEY is not set");
  process.exit(1);
}

const stream = new YouTubeStream({
  streamKey: streamKey,
  resolution: "720x1280",
  framerate: 30,
  audioBitrate: "64k",
  useCRF: true
});

const server = new Server({ port: port });

try {
  await server.start();
  server.addStream("youtube", stream);
} catch (error) {
  logger.error("❌ Server failed:", error);
  process.exit(1);
}

try {
  stream.setLoop(true);
  await stream.loadDatabase();
  await stream.start();
} catch (error) {
  console.log(error);
  logger.error("❌ Stream failed:", error);
  process.exit(1);
}

process.on('SIGINT', async () => {
  logger.warn('🛑 Stopping stream...');
  await stream.stop();
  process.exit(0);
});