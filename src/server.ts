import { BaseStream } from "./base/BaseStream.js";
import { Logger } from "./utils/logger.js";
import cors from "cors";
import express from "express";

const logger = new Logger("SERVER");

export interface ServerConfig {
  port?: number;
  cors?: boolean;
  maxStreams?: number;
}

export interface ApiResponse<T = any> {
  status: 'success' | 'error';
  data?: T;
  message?: string;
  timestamp: number;
}

export class Server {
  private readonly app: express.Application;
  private readonly port: number;
  private readonly activeStreams: Map<string, BaseStream> = new Map();
  private readonly maxStreams: number;
  private server: any = null;

  constructor(config: ServerConfig = {}) {
    this.app = express();
    this.port = config.port || 3000;
    this.maxStreams = config.maxStreams || 10;

    this.setupMiddleware(config.cors ?? true);
    this.setupRoutes();
    this.setupErrorHandling();
    this.setupShutdown();
  }

  /**
   * Start the server
   */
  public start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.port, () => {
          logger.info(`🚀 Server running on port ${this.port}`);
          logger.info(`📊 Max streams: ${this.maxStreams}`);
          resolve();
        });

        this.server.on('error', (error: Error) => {
          logger.error('Server error:', error);
          reject(error);
        });
      } catch (error) {
        logger.error('Failed to start server:', error);
        reject(error);
      }
    });
  }

  /**
   * Stop the server gracefully
   */
  public async stop(): Promise<void> {
    logger.info('🛑 Shutting down server...');

    // Stop all active streams
    const stopPromises = Array.from(this.activeStreams.values()).map(stream =>
      stream.stop().catch(error => logger.error('Error stopping stream:', error))
    );

    await Promise.all(stopPromises);
    this.activeStreams.clear();

    // Close server
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          logger.info('✅ Server stopped');
          resolve();
        });
      });
    }
  }

  public getApp(): express.Application {
    return this.app;
  }

  public getPort(): number {
    return this.port;
  }

  public getActiveStreams(): Map<string, BaseStream> {
    return new Map(this.activeStreams);
  }

  public addStream(id: string, stream: BaseStream): boolean {
    if (this.activeStreams.has(id)) {
      logger.warn(`Stream with ID ${id} already exists`);
      return false;
    }

    if (this.activeStreams.size >= this.maxStreams) {
      logger.warn(`Maximum number of streams (${this.maxStreams}) reached`);
      return false;
    }

    this.activeStreams.set(id, stream);
    logger.info(`➕ Added stream: ${id}`);
    return true;
  }

  public removeStream(id: string): boolean {
    const removed = this.activeStreams.delete(id);
    if (removed) {
      logger.info(`➖ Removed stream: ${id}`);
    }
    return removed;
  }

  public getStream(id: string | undefined): BaseStream | undefined {
    if (!id) {
      return undefined;
    }
    return this.activeStreams.get(id);
  }

  public getStreamCount(): number {
    return this.activeStreams.size;
  }

  /**
   * Create standardized API response
   */
  private createResponse<T>(
    status: 'success' | 'error',
    data?: T,
    message?: string
  ): ApiResponse<T> {
    return {
      status,
      data,
      message,
      timestamp: Date.now()
    };
  }

  /**
   * Validate stream ID parameter
   */
  private validateStreamId(id: string | undefined): string | null {
    if (!id || typeof id !== 'string' || id.trim() === '') {
      return 'Invalid stream ID';
    }
    return null;
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json(this.createResponse('success', {
        server: 'healthy',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        activeStreams: this.activeStreams.size,
        maxStreams: this.maxStreams
      }));
    });

    // Get all streams status
    this.app.get('/', (req, res) => {
      const streams = Array.from(this.activeStreams.entries()).map(([id, stream]) => ({
        id,
        ...stream.getStatus()
      }));

      res.json(this.createResponse('success', {
        streams,
        totalStreams: streams.length,
        maxStreams: this.maxStreams
      }));
    });

    // Get specific stream status
    this.app.get('/stream/:id', ((req, res) => {
      const { id } = req.params;
      const validationError = this.validateStreamId(id);

      if (validationError) {
        return res.status(400).json(this.createResponse('error', null, validationError));
      }

      const stream = this.getStream(id);
      if (!stream) {
        return res.status(404).json(this.createResponse('error', null, 'Stream not found'));
      }

      res.json(this.createResponse('success', {
        id,
        ...stream.getStatus()
      }));
    }) as express.RequestHandler);

    // Add videos to stream queue
    this.app.post('/stream/:id/queue', ((req, res) => {
      const { id } = req.params;
      const { videos } = req.body;

      const validationError = this.validateStreamId(id);
      if (validationError) {
        return res.status(400).json(this.createResponse('error', null, validationError));
      }

      if (!videos || !Array.isArray(videos) || videos.length === 0) {
        return res.status(400).json(this.createResponse('error', null, 'Videos array is required'));
      }

      const stream = this.getStream(id);
      if (!stream) {
        return res.status(404).json(this.createResponse('error', null, 'Stream not found'));
      }

      try {
        stream.addToQueue(...videos);
        res.json(this.createResponse('success', {
          id,
          addedVideos: videos.length,
          ...stream.getStatus()
        }));
      } catch (error) {
        res.status(500).json(this.createResponse('error', null, `Failed to add videos: ${error}`));
      }
    }) as express.RequestHandler);

    // Remove video from stream queue
    this.app.delete('/stream/:id/queue/:index', ((req, res) => {
      const { id, index } = req.params;
      const validationError = this.validateStreamId(id);

      if (validationError) {
        return res.status(400).json(this.createResponse('error', null, validationError));
      }

      if (!index || typeof index !== 'string') {
        return res.status(400).json(this.createResponse('error', null, 'Invalid queue index'));
      }

      const videoIndex = parseInt(index, 10);
      if (isNaN(videoIndex) || videoIndex < 0) {
        return res.status(400).json(this.createResponse('error', null, 'Invalid queue index'));
      }

      const stream = this.getStream(id);
      if (!stream) {
        return res.status(404).json(this.createResponse('error', null, 'Stream not found'));
      }

      try {
        const removed = stream.removeFromQueue(videoIndex);
        if (removed) {
          res.json(this.createResponse('success', {
            id,
            removedIndex: videoIndex,
            ...stream.getStatus()
          }));
        } else {
          res.status(400).json(this.createResponse('error', null, 'Invalid queue index or queue empty'));
        }
      } catch (error) {
        res.status(500).json(this.createResponse('error', null, `Failed to remove video: ${error}`));
      }
    }) as express.RequestHandler);

    // Clear stream queue
    this.app.delete('/stream/:id/queue', ((req, res) => {
      const { id } = req.params;
      const validationError = this.validateStreamId(id);

      if (validationError) {
        return res.status(400).json(this.createResponse('error', null, validationError));
      }

      const stream = this.getStream(id);
      if (!stream) {
        return res.status(404).json(this.createResponse('error', null, 'Stream not found'));
      }

      try {
        stream.clearQueue();
        res.json(this.createResponse('success', {
          id,
          ...stream.getStatus()
        }));
      } catch (error) {
        res.status(500).json(this.createResponse('error', null, `Failed to clear queue: ${error}`));
      }
    }) as express.RequestHandler);

    // Start stream
    this.app.post('/stream/:id/start', (async (req, res) => {
      const { id } = req.params;
      const validationError = this.validateStreamId(id);

      if (validationError) {
        return res.status(400).json(this.createResponse('error', null, validationError));
      }

      const stream = this.getStream(id);
      if (!stream) {
        return res.status(404).json(this.createResponse('error', null, 'Stream not found'));
      }

      try {
        await stream.start();
        res.json(this.createResponse('success', {
          id,
          ...stream.getStatus()
        }));
      } catch (error) {
        res.status(500).json(this.createResponse('error', null, `Failed to start stream: ${error}`));
      }
    }) as express.RequestHandler);

    // Stop stream
    this.app.post('/stream/:id/stop', (async (req, res) => {
      const { id } = req.params;
      const validationError = this.validateStreamId(id);

      if (validationError) {
        return res.status(400).json(this.createResponse('error', null, validationError));
      }

      const stream = this.getStream(id);
      if (!stream) {
        return res.status(404).json(this.createResponse('error', null, 'Stream not found'));
      }

      try {
        await stream.stop();
        res.json(this.createResponse('success', {
          id,
          ...stream.getStatus()
        }));
      } catch (error) {
        res.status(500).json(this.createResponse('error', null, `Failed to stop stream: ${error}`));
      }
    }) as express.RequestHandler);

    // Get stream configuration
    this.app.get('/stream/:id/config', ((req, res) => {
      const { id } = req.params;
      const validationError = this.validateStreamId(id);

      if (validationError) {
        return res.status(400).json(this.createResponse('error', null, validationError));
      }

      const stream = this.getStream(id);
      if (!stream) {
        return res.status(404).json(this.createResponse('error', null, 'Stream not found'));
      }

      res.json(this.createResponse('success', {
        id,
        config: stream.getConfig()
      }));
    }) as express.RequestHandler);

    // Print queue status
    this.app.post('/stream/:id/queue/status', ((req, res) => {
      const { id } = req.params;
      const validationError = this.validateStreamId(id);

      if (validationError) {
        return res.status(400).json(this.createResponse('error', null, validationError));
      }

      const stream = this.getStream(id);
      if (!stream) {
        return res.status(404).json(this.createResponse('error', null, 'Stream not found'));
      }

      try {
        stream.printQueueStatus();
        res.json(this.createResponse('success', {
          id,
          message: 'Queue status printed to console'
        }));
      } catch (error) {
        res.status(500).json(this.createResponse('error', null, `Failed to print queue status: ${error}`));
      }
    }) as express.RequestHandler);
  }

  /**
   * Setup middleware
   */
  private setupMiddleware(enableCors: boolean): void {
    // Request logging
    this.app.use((req, res, next) => {
      logger.debug(`${req.method} ${req.url}`);
      next();
    });

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // CORS
    if (enableCors) {
      this.app.use(cors({
        origin: true,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization']
      }));
    }

    // Security headers
    this.app.use((req, res, next) => {
      res.header('X-Content-Type-Options', 'nosniff');
      res.header('X-Frame-Options', 'DENY');
      res.header('X-XSS-Protection', '1; mode=block');
      next();
    });
  }

  /**
   * Setup error handling
   */
  private setupErrorHandling(): void {
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json(this.createResponse('error', null, `Route not found: ${req.method} ${req.url}`));
    });

    // Global error handler
    this.app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      logger.error('Server error:', err);

      const status = err.status || err.statusCode || 500;
      const message = err.message || 'Internal server error';

      res.status(status).json(this.createResponse('error', null, message));
    });
  }

  /**
   * Setup graceful shutdown
   */
  private setupShutdown(): void {
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      try {
        await this.stop();
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', error);
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection at:', promise, 'reason:', reason);
      shutdown('unhandledRejection');
    });
  }
}

export default Server;
