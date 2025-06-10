import chalk from "chalk";

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface LoggerConfig {
  level?: LogLevel;
  useColors?: boolean;
  timestamp?: boolean;
}

export class Logger {
  private readonly label: string;
  private readonly config: Required<LoggerConfig>;

  private readonly levels = {
    error: { priority: 0, color: chalk.red, prefix: "ERR" },
    warn: { priority: 1, color: chalk.yellow, prefix: "WRN" },
    info: { priority: 2, color: chalk.green, prefix: "INF" },
    debug: { priority: 3, color: chalk.blue, prefix: "DBG" },
  } as const;

  private readonly currentLevel: number;

  constructor(label: string, config: LoggerConfig = {}) {
    this.label = label;

    const defaultLevel = Bun.env.DEBUG === "true" ? 'debug' : 'info';

    this.config = {
      level: config.level || (Bun.env.LOG_LEVEL as LogLevel) || defaultLevel,
      useColors: config.useColors ?? true,
      timestamp: config.timestamp ?? true,
    };

    this.currentLevel = this.levels[this.config.level].priority;

    // Log debug mode status if debug is enabled
    if (this.config.level === 'debug') {
      // Use console.log directly to avoid infinite recursion
      const timestamp = new Date().toISOString();
      const message = `[${timestamp}] [${this.label}] ${chalk.blue('DBG')} 🐛 Debug logging enabled (level: ${this.config.level})`;
      console.log(message);
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levels[level].priority <= this.currentLevel;
  }

  private formatMessage(level: LogLevel, args: unknown[]): string {
    const levelInfo = this.levels[level];
    const timestamp = this.config.timestamp ? new Date().toISOString() : '';
    const levelText = this.config.useColors ? levelInfo.color(levelInfo.prefix) : levelInfo.prefix;
    const labelText = this.config.useColors ? chalk.cyan(`[${this.label}]`) : `[${this.label}]`;

    const parts = [];
    if (timestamp) parts.push(chalk.gray(`[${timestamp}]`));
    parts.push(labelText);
    parts.push(levelText);
    parts.push(args.join(" "));

    return parts.join(" ");
  }

  private log(level: LogLevel, ...args: unknown[]): void {
    if (!this.shouldLog(level)) return;

    const message = this.formatMessage(level, args);

    // Use appropriate console method
    switch (level) {
      case 'error':
        console.error(message);
        break;
      case 'warn':
        console.warn(message);
        break;
      default:
        console.log(message);
    }
  }

  public error(...args: unknown[]): void {
    this.log("error", ...args);
  }

  public warn(...args: unknown[]): void {
    this.log("warn", ...args);
  }

  public info(...args: unknown[]): void {
    this.log("info", ...args);
  }

  public debug(...args: unknown[]): void {
    this.log("debug", ...args);
  }

  /**
   * Set log level dynamically
   */
  public setLevel(level: LogLevel): void {
    (this.config as any).level = level;
    (this as any).currentLevel = this.levels[level].priority;
  }

  /**
   * Get current log level
   */
  public getLevel(): LogLevel {
    return this.config.level;
  }

  /**
   * Create a child logger with the same configuration
   */
  public child(childLabel: string): Logger {
    return new Logger(`${this.label}:${childLabel}`, this.config);
  }

  /**
   * Performance timing utility
   */
  public time(label: string): void {
    console.time(`[${this.label}] ${label}`);
  }

  public timeEnd(label: string): void {
    console.timeEnd(`[${this.label}] ${label}`);
  }
}
