export interface ILogger {
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
}

export class ConsoleLogger implements ILogger {
  info(message: string, ...args: any[]): void {
    console.log(message, ...args);
  }
  warn(message: string, ...args: any[]): void {
    console.warn(message, ...args);
  }
  error(message: string, ...args: any[]): void {
    console.error(message, ...args);
  }
}

export class NoOpLogger implements ILogger {
  info(message: string, ...args: any[]): void {}
  warn(message: string, ...args: any[]): void {}
  error(message: string, ...args: any[]): void {}
}

export class LoggerFactory {
  private static instance: ILogger;

  static getLogger(): ILogger {
    if (!this.instance) {
      const isTestEnv = process.env.NODE_ENV === 'test';
      const enableLogging = !isTestEnv && process.env.ENABLE_LOGGING !== 'false';
      
      if (enableLogging) {
        this.instance = new ConsoleLogger();
      } else {
        this.instance = new NoOpLogger();
      }
    }
    return this.instance;
  }
  
  static setLogger(logger: ILogger) {
    this.instance = logger;
  }
}

export const logger = LoggerFactory.getLogger();
