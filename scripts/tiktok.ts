import { Logger } from "../src/utils/logger.js";
import { TiktokCrawler } from "../src/utils/tiktok.js";

const logger = new Logger("Tiktok");

const usernames: string[] = [
  "poppyyy0101",
  "patoo.204",
  "xiaonai707",
  "himehien",
  "yenam_real",
  "diine_203",
  "p_nhi5",
  "httruc._",
  "thunoss",
  "bbicuaaiii_",
  "thuy_lcc",
  "kanyh258",
  "thuy__lcc",
  "_bongyeuoi.07",
  "tal0_7207",
  "_clouddom"
]

try {
  const tiktok = new TiktokCrawler();
  await tiktok.init();
  for (let i of usernames) {
    await tiktok.loadPage(i);
    await tiktok.waitCaptcha();
    await tiktok.fetchListVideoURLs();
  }
  await tiktok.fetchVideoStreamURLs();
  await tiktok.close();

} catch (error) {
  console.log(error);
  logger.error("❌ Get video stream URLs failed:", error);
  process.exit(1);
}