import { Browser, Page } from "puppeteer-core";

import { Database } from "./database";
import { Logger } from "./logger";
import puppeteer from "puppeteer-core";

export class Tiktok {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private logger = new Logger("Tiktok");
  private listVideoURLs: string[] = [];
  private database: Database;
  private username: string = "";

  constructor() {
    this.database = new Database();
  }

  async init() {
    await this.database.init();
    this.browser = await puppeteer.launch({
      args: ['--mute-audio'],
      headless: false,
      executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    });
    this.page = await this.browser.newPage();
    await this.readCache();
  }

  async loadPage(username: string) {
    this.username = username;
    await this.page?.goto(`https://www.tiktok.com/@${username}`);
    await this.page?.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });
      // @ts-ignore
      window.chrome = {
        runtime: {},
      };

      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });

      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
    });

    await this.page?.waitForNetworkIdle({
      timeout: 10000,
      concurrency: 2
    })
  }

  async waitCaptcha() {
    const hasCaptcha = await this.page?.$('.captcha-verify-container') !== null;
    if (hasCaptcha) {
      this.logger.info('Captcha detected, waiting for it to be hidden...');

      await this.page?.waitForFunction(() => {
        // @ts-ignore
        const el = document.querySelector('.captcha-verify-container');
        if (!el) return true; // Nếu bị xoá khỏi DOM thì cũng coi là ẩn
        // @ts-ignore
        const style = window.getComputedStyle(el);
        return style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0';
      }, { timeout: 60000 }); // timeout 60s, bạn có thể điều chỉnh

      this.logger.info('Captcha is now hidden!');
    } else {
      this.logger.info('No captcha found, continuing...');
    }
    await this.page?.waitForNetworkIdle({
      timeout: 10000,
      concurrency: 2
    })
  }

  async fetchListVideoURLs(start: number = 0, end: number = Infinity) {
    let list: string[] = [];
    let previousLength = 0;
    let scrollAttempts = 0;
    let maxScrollAttempts = 30;

    if (await this.isFinish(this.username)) {
      this.logger.info("🔍 Already finished:", this.username);
      return [];
    }

    while (list.length < end && scrollAttempts < maxScrollAttempts) {
      // Get current videos
      try {
        // check if has 'data-e2e="user-post-item-list"'
        const hasDataE2E = await this.page?.$('[data-e2e="user-post-item-list"]');
        if (!hasDataE2E) {
          this.logger.error('No data-e2e="user-post-item-list" found');
          break;
        }
        list = (await this.page?.$eval('[data-e2e="user-post-item-list"]', (el) => {
          return Array.from(el.querySelectorAll('a'))
            .map((a: any) => a.href)
            .filter((url: string) => url.includes('/video/'))
            .filter((url: string) => !url.includes('/photo/'));
        }) || []);

        this.logger.info(`Found ${list.length} video URLs so far`);

        if (list.length >= end || (list.length === previousLength && scrollAttempts > 0)) {
          break;
        }

        previousLength = list.length;

        if (this.page) {
          await this.page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
          scrollAttempts++;
        }
      } catch (error) {
        this.logger.error(error);
      } finally {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Get the videos in the desired range
    const rangedList = list.slice(start, end).filter((url: string) => !Object.keys(this.database.getData()).includes(url));
    this.logger.info(`Returning ${rangedList.length} video URLs (from index ${start} to ${end})`);
    this.listVideoURLs = [...new Set([...this.listVideoURLs, ...rangedList])];
    await this.writeCache();
    await this.setFinish(this.username);
    this.logger.info("🔍 Finished:", this.username);
    return this.listVideoURLs;
  }

  async fetchVideoStreamURLs() {
    const browser = this.page?.browser();
    const MAX_CONCURRENCY = 5;
    let data: Record<string, string> = {};
    let removedUrls: string[] = [];

    const processUrl = async (url: string) => {
      const page = await browser?.newPage();
      try {
        await page?.goto(url, { timeout: 15000 });
        await page?.waitForNetworkIdle({ timeout: 10000, concurrency: 2 });

        const video = await page?.$eval('video', (el: any) => {
          const sources = Array.from(el.querySelectorAll('source'));
          return (sources[2] as any)?.src || null;
        });
        if (video) {
          this.logger.info(`Adding video to database: ${url}`);
          data[url] = video;
          removedUrls.push(url);
        }
      } catch (err) {
        this.logger.error(`Error processing ${url}: ${err}`);
      } finally {
        await page?.close();
      }
    };

    const queue = [...this.listVideoURLs];
    const running: Promise<any>[] = [];

    while (queue.length > 0) {
      while (running.length < MAX_CONCURRENCY && queue.length > 0) {
        const url = queue.shift()!;
        const p = processUrl(url);
        running.push(p);
        p.finally(() => {
          running.splice(running.indexOf(p), 1);
        });
      }
      await this.removeCache(removedUrls);
      await new Promise(resolve => setTimeout(resolve, 100));
      await this.database.updateData(data);
      await new Promise(resolve => setTimeout(resolve, 100));
      await Promise.race(running); // chờ một cái hoàn tất trước khi thêm cái khác
      removedUrls = [];
    }

    await Promise.all(running); // chờ tất cả hoàn tất
    this.logger.info("🔍 Get video stream URLs successfully");
  }

  async writeCache() {
    let file = Bun.file("cache.json");
    let exists = await file.exists();
    if (!exists) {
      await file.write("[]");
    } else {
      let data = await file.json();
      data = [...new Set([...data, ...this.listVideoURLs])].filter((url: string) => url.includes('/video/'));
      await file.write(JSON.stringify(data, null, 2));
      this.logger.info("🔍 Write cache successfully");
    }
  }

  async readCache() {
    let file = Bun.file("cache.json");
    let exists = await file.exists();
    if (!exists) {
      await file.write("[]");
    }
    let data = await file.json();
    this.listVideoURLs = [...new Set([...this.listVideoURLs, ...data])].filter((url: string) => url.includes('/video/'));
    this.logger.info("🔍 Read cache successfully");
  }

  async removeCache(urls: string[]) {
    let file = Bun.file("cache.json");
    let exists = await file.exists();
    if (!exists) {
      await file.write("[]");
    }
    let data = await file.json();
    data = data.filter((item: string) => urls.includes(item));
    await file.write(JSON.stringify(data, null, 2));
    this.logger.info("🔍 Remove cache successfully");
  }

  async setFinish(username: string) {
    let file = Bun.file("finish.json");
    let exists = await file.exists();
    let data: string[] = [];
    if (!exists) {
      await file.write("[]");
    } else {
      data = await file.json();
    }
    data = [...new Set([...data, username])];
    await file.write(JSON.stringify(data, null, 2));
    this.logger.info("🔍 Set finish successfully");
  }

  async getFinish() {
    let file = Bun.file("finish.json");
    let exists = await file.exists();
    let data: string[] = [];
    if (!exists) {
      await file.write("[]");
    } else {
      data = await file.json();
    }
    return data;
  }

  async isFinish(username: string) {
    const finish = await this.getFinish();
    return finish.includes(username);
  }

  async close() {
    await this.browser?.close();
  }
}