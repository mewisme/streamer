import { Logger } from "./logger.js";

export interface DatabaseEntry {
  url: string;
  source: string;
  addedAt: number;
  lastUsed?: number;
  useCount?: number;
}

export type DatabaseData = Record<string, string | DatabaseEntry>;

export class Database {
  private readonly databasePath = "data.json";
  private data: DatabaseData = {};
  private readonly logger: Logger;
  private isInitialized = false;

  constructor() {
    this.logger = new Logger("DATABASE");
  }

  /**
   * Initialize the database
   */
  async init(): Promise<void> {
    if (this.isInitialized) {
      this.logger.debug("Database already initialized");
      return;
    }

    try {
      const file = Bun.file(this.databasePath);
      const exists = await file.exists();

      if (!exists) {
        this.logger.info("Creating new database file");
        await this.save();
      } else {
        await this.load();
      }

      this.isInitialized = true;
      this.logger.info(`Database initialized with ${Object.keys(this.data).length} entries`);
    } catch (error) {
      this.logger.error("Failed to initialize database:", error);
      throw error;
    }
  }

  /**
   * Load data from database file
   */
  private async load(): Promise<void> {
    try {
      const file = Bun.file(this.databasePath);
      const content = await file.text();

      if (!content.trim()) {
        this.data = {};
        return;
      }

      const parsed = JSON.parse(content);

      // Handle legacy format (string values) and new format (object values)
      if (Array.isArray(parsed)) {
        // Very old format - convert to object
        this.data = {};
      } else if (typeof parsed === 'object' && parsed !== null) {
        this.data = parsed;
        // Migrate legacy string values to new object format
        this.migrateLegacyData();
      } else {
        throw new Error("Invalid database format");
      }
    } catch (error) {
      this.logger.error("Failed to load database:", error);
      this.data = {}; // Fall back to empty database
    }
  }

  /**
   * Migrate legacy string values to new object format
   */
  private migrateLegacyData(): void {
    let migrated = 0;

    for (const [key, value] of Object.entries(this.data)) {
      if (typeof value === 'string') {
        this.data[key] = {
          url: key,
          source: value,
          addedAt: Date.now(),
          useCount: 0
        };
        migrated++;
      }
    }

    if (migrated > 0) {
      this.logger.info(`Migrated ${migrated} legacy entries to new format`);
      this.save(); // Save migrated data
    }
  }

  /**
   * Add a new entry to the database
   */
  async add(url: string, urlSource: string): Promise<void> {
    if (!this.isInitialized) {
      throw new Error("Database not initialized. Call init() first.");
    }

    if (!url || !urlSource) {
      throw new Error("URL and source are required");
    }

    if (!this.data[url]) {
      this.data[url] = {
        url,
        source: urlSource,
        addedAt: Date.now(),
        useCount: 0
      };

      await this.save();
      this.logger.info(`Added new entry: ${url}`);
    } else {
      this.logger.debug(`Entry already exists: ${url}`);
    }
  }

  /**
   * Remove an entry from the database
   */
  async remove(url: string): Promise<boolean> {
    if (!this.isInitialized) {
      throw new Error("Database not initialized. Call init() first.");
    }

    if (this.data[url]) {
      delete this.data[url];
      await this.save();
      this.logger.info(`Removed entry: ${url}`);
      return true;
    }

    return false;
  }

  /**
   * Update usage statistics for an entry
   */
  async updateUsage(url: string): Promise<void> {
    if (!this.isInitialized) {
      throw new Error("Database not initialized. Call init() first.");
    }

    const entry = this.data[url];
    if (entry && typeof entry === 'object') {
      entry.lastUsed = Date.now();
      entry.useCount = (entry.useCount || 0) + 1;
      await this.save();
    }
  }

  /**
   * Save data to database file
   */
  async save(): Promise<void> {
    try {
      const file = Bun.file(this.databasePath);
      await file.write(JSON.stringify(this.data));
    } catch (error) {
      this.logger.error("Failed to save database:", error);
      throw error;
    }
  }

  /**
   * Get all data
   */
  getData(): DatabaseData {
    if (!this.isInitialized) {
      throw new Error("Database not initialized. Call init() first.");
    }
    return { ...this.data };
  }

  /**
   * Set all data (replaces existing data)
   */
  async setData(data: DatabaseData): Promise<void> {
    if (!this.isInitialized) {
      throw new Error("Database not initialized. Call init() first.");
    }

    this.data = { ...data };
    await this.save();
    this.logger.info(`Database replaced with ${Object.keys(this.data).length} entries`);
  }

  /**
   * Update data (merges with existing data)
   */
  async updateData(data: DatabaseData): Promise<void> {
    if (!this.isInitialized) {
      throw new Error("Database not initialized. Call init() first.");
    }

    this.data = { ...this.data, ...data };
    await this.save();
    this.logger.info(`Database updated with ${Object.keys(data).length} entries`);
  }

  /**
   * Get shuffled data as URLs only
   */
  async shuffleData(): Promise<Record<string, DatabaseEntry>> {
    if (!this.isInitialized) {
      throw new Error("Database not initialized. Call init() first.");
    }

    return this.shuffleObject<DatabaseEntry>(this.data as Record<string, DatabaseEntry>);
  }

  /**
   * Get statistics about the database
   */
  getStats(): {
    totalEntries: number;
    recentEntries: number;
    mostUsed: { url: string; count: number }[];
  } {
    if (!this.isInitialized) {
      throw new Error("Database not initialized. Call init() first.");
    }

    const entries = Object.values(this.data).filter(entry => typeof entry === 'object') as DatabaseEntry[];
    const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

    const recentEntries = entries.filter(entry => entry.addedAt > weekAgo).length;

    const mostUsed = entries
      .filter(entry => entry.useCount && entry.useCount > 0)
      .sort((a, b) => (b.useCount || 0) - (a.useCount || 0))
      .slice(0, 10)
      .map(entry => ({ url: entry.url, count: entry.useCount || 0 }));

    return {
      totalEntries: Object.keys(this.data).length,
      recentEntries,
      mostUsed
    };
  }

  /**
   * Clean up old or unused entries
   */
  async cleanup(options: {
    removeUnused?: boolean;
    olderThanDays?: number;
  } = {}): Promise<number> {
    if (!this.isInitialized) {
      throw new Error("Database not initialized. Call init() first.");
    }

    const { removeUnused = false, olderThanDays } = options;
    let removedCount = 0;

    const cutoffDate = olderThanDays ? Date.now() - (olderThanDays * 24 * 60 * 60 * 1000) : null;

    for (const [key, entry] of Object.entries(this.data)) {
      if (typeof entry === 'object') {
        let shouldRemove = false;

        if (removeUnused && (!entry.useCount || entry.useCount === 0)) {
          shouldRemove = true;
        }

        if (cutoffDate && entry.addedAt < cutoffDate) {
          shouldRemove = true;
        }

        if (shouldRemove) {
          delete this.data[key];
          removedCount++;
        }
      }
    }

    if (removedCount > 0) {
      await this.save();
      this.logger.info(`Cleaned up ${removedCount} entries`);
    }

    return removedCount;
  }

  /**
   * Shuffle an object's entries
   */
  private shuffleObject<T>(obj: Record<string, T>): Record<string, T> {
    const keys = Object.keys(obj);
    const shuffledKeys = [...keys];

    // Fisher-Yates shuffle for keys
    for (let i = shuffledKeys.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = shuffledKeys[i];
      shuffledKeys[i] = shuffledKeys[j] as string;
      shuffledKeys[j] = temp as string;
    }

    // Rebuild object with shuffled keys
    const result: Record<string, T> = {};
    for (const key of shuffledKeys) {
      result[key] = obj[key] as T;
    }

    return result;
  }

  /**
   * Search entries by URL or source
   */
  search(query: string): DatabaseEntry[] {
    if (!this.isInitialized) {
      throw new Error("Database not initialized. Call init() first.");
    }

    const lowercaseQuery = query.toLowerCase();
    const results: DatabaseEntry[] = [];

    for (const entry of Object.values(this.data)) {
      if (typeof entry === 'object') {
        if (entry.url.toLowerCase().includes(lowercaseQuery) ||
          entry.source.toLowerCase().includes(lowercaseQuery)) {
          results.push(entry);
        }
      }
    }

    return results;
  }
}

// Singleton instance for backward compatibility
export default new Database();
