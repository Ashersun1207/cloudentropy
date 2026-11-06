import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { launchVerificationServer, runControlOmb } from "./control-omb.ts";
import { fixtureApi, mountPreview, type MountedPreview } from "./testing/preview-fixture.ts";
import { openHeadlessChrome, type HeadlessPage } from "./testing/headless-chrome.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputAt = process.argv.indexOf("--output");
const output = outputAt < 0 ? join(root, "site/assets") : resolve(process.argv[outputAt + 1]!);
const scratch = mkdtempSync(join(tmpdir(), "entropybot-site-capture-"));
const reply = [
  "## 本周发布清单",
  "",
  "已按上线顺序整理好，发布前逐项确认即可。",
  "",
  "1. **功能验收** · 核对核心流程，确认遗留问题与负责人。",
  "2. **发布说明** · 汇总本次改动，补齐使用示例和更新文档。",
  "3. **上线准备** · 检查配置与回滚方案，约定发布时间。",
  "4. **发布后检查** · 验证关键页面，观察运行状态并记录反馈。",
  "",
  "**下一步：** 先确认验收结果，再把清单交给团队逐项勾选。",
].join("\n");
let fixture: Awaited<ReturnType<typeof launchVerificationServer>> | undefined;
let ui: MountedPreview | undefined;
let page: HeadlessPage | undefined;
try {
  fixture = await launchVerificationServer({
    ...process.env,
    FAKE_CLAUDE_REPLIES: JSON.stringify([reply, "发布说明草稿已准备好，等你确认。", "发布资料已按主题整理，方便团队查阅。"]),
    FAKE_CLAUDE_TOOL_CALLS: "[]",
    FAKE_CLAUDE_REPLY_STATE: join(scratch, "reply-cursor"),
  });
  const api = fixtureApi(fixture.info.url);
  const control = (args: string[]) => runControlOmb([...args, "--url", fixture!.info.url]);
  const { bots: initial } = await api("GET", "/api/bots");
  const botId = initial[0].id;
  await api("PATCH", "/api/config", { language: "zh-CN" });
  await api("PATCH", `/api/bots/${botId}/profile`, { name: "Entropybot" });
  await api("PATCH", `/api/bots/${botId}`, { welcomed: true, sidebarHidden: false });
  await control(["new-bot", "--name", "资料整理"]);
  await control(["new-bot", "--name", "写作搭档"]);
  await api("POST", `/api/bots/${botId}/tasks`, {});
  const sent = await control(["send", "--bot", botId, "--text", "帮我整理本周发布清单，列出关键步骤和下一步。"]);
  const settled = await control(["wait", "--bot", botId, "--timeout", "45"]);
  const messages = await control(["messages", "--bot", botId]);
  const { bots } = await api("GET", "/api/bots");
  const teammates = [];
  for (const name of ["写作搭档", "资料整理"]) {
    const peer = bots.find((bot: { name: string }) => bot.name === name);
    await api("POST", `/api/bots/${peer.id}/tasks`, {});
    const action = await control(["send", "--bot", peer.id, "--text", name === "写作搭档" ? "准备一份简短的发布说明草稿。" : "按主题整理本次发布资料。"]);
    const result = await control(["wait", "--bot", peer.id, "--timeout", "45"]);
    teammates.push({ action, result });
    await api("POST", `/api/bots/${peer.id}/read`, { threadId: (action as { taskId: string }).taskId });
  }
  await api("POST", `/api/bots/${botId}/read`, { threadId: (sent as { taskId: string }).taskId });
  writeFileSync(join(scratch, "evidence.json"), JSON.stringify({ server: fixture.info, sent, settled, messages, teammates }, null, 2));
  ui = await mountPreview(fixture, { entry: "/scripts/testing/site-screenshot-preview.tsx", route: "/__site-app.html", title: "Entropybot", logLevel: "warn" });
  page = await openHeadlessChrome(join(scratch, "chrome"));
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 2, mobile: false });
  mkdirSync(output, { recursive: true });
  for (const [skin, name] of [["midnight", "dark"], ["daylight", "light"]]) {
    await page.send("Page.navigate", { url: `${ui.previewUrl}?skin=${skin}` });
    await page.until(`document.querySelector('[data-sidebar-bot-row="${botId}"]')`);
    await delay(600);
    await page.evaluate(`document.querySelector('[data-sidebar-bot-row="${botId}"]').click()`);
    await page.until("document.body.innerText.includes('本周发布清单')");
    await page.evaluate("document.fonts.ready");
    await delay(1800);
    const state = await page.evaluate("({ language: document.documentElement.lang, skin: document.documentElement.dataset.skin, text: document.body.innerText })");
    if (!state.language.startsWith("zh")) throw new Error(`Expected Chinese UI: ${state.language}`);
    if (state.skin !== skin) throw new Error(`Expected ${skin}: ${state.skin}`);
    if (/fixture|debug|OpenMaus|Oh My|Grok Bot/i.test(state.text)) throw new Error("Unexpected verification or upstream branding in screenshot");
    writeFileSync(join(scratch, `${name}-ui.json`), JSON.stringify(state, null, 2));
    const { data } = await page.send("Page.captureScreenshot", { format: "webp", quality: 95 });
    writeFileSync(join(output, `app-${name}.webp`), Buffer.from(data, "base64"));
    console.log(join(output, `app-${name}.webp`));
  }
  copyFileSync(join(root, "electron/resources/app-icon.png"), join(output, "app-icon.png"));
  console.log(`Evidence: ${join(scratch, "evidence.json")}`);
} finally {
  page?.close();
  await ui?.close();
  await fixture?.close();
  await delay(400);
  rmSync(join(scratch, "chrome"), { recursive: true, force: true });
}
