import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";

const [url, outputDirectory] = process.argv.slice(2);

if (!url || !outputDirectory) {
  throw new Error("Usage: node create-qr.mjs <url> <output-directory>");
}

await mkdir(outputDirectory, { recursive: true });
const qrOptions = {
  errorCorrectionLevel: "H",
  margin: 2,
  width: 560,
  color: {
    dark: "#1f4d3b",
    light: "#fffdf8",
  },
};

const qrDataUrl = await QRCode.toDataURL(url, qrOptions);
await QRCode.toFile(path.join(outputDirectory, "ipad-install-qr.png"), url, qrOptions);
await writeFile(path.join(outputDirectory, "ipad-install-url.txt"), url, "utf8");

const escapedUrl = url
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");
const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>复习搭子 · iPad 离线安装</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 28px;
        color: #25322b;
        background: #f4f0e7;
        font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
      }
      main {
        width: min(960px, 100%);
        display: grid;
        grid-template-columns: minmax(280px, 430px) 1fr;
        gap: 42px;
        align-items: center;
        padding: 38px;
        border: 1px solid #dedbd1;
        border-radius: 28px;
        background: #fffdf8;
        box-shadow: 0 24px 70px rgba(46, 61, 51, .14);
      }
      .qr {
        width: 100%;
        display: block;
        border-radius: 22px;
        background: #fffdf8;
      }
      .eyebrow { color: #dc795b; font-size: 14px; font-weight: 700; }
      h1 { margin: 12px 0 10px; font-size: clamp(30px, 4vw, 48px); line-height: 1.15; }
      .lead { color: #68736d; line-height: 1.75; }
      ol { margin: 24px 0; padding-left: 24px; line-height: 2; }
      li::marker { color: #276149; font-weight: 800; }
      .ready {
        padding: 14px 16px;
        border-radius: 14px;
        color: #1f4d3b;
        background: #e6efe9;
        font-size: 14px;
        line-height: 1.65;
      }
      .url {
        margin-top: 16px;
        padding: 11px 13px;
        overflow-wrap: anywhere;
        border-radius: 10px;
        color: #68736d;
        background: #f3f1eb;
        font-size: 12px;
      }
      @media (max-width: 760px) {
        main { grid-template-columns: 1fr; padding: 24px; }
        .qr { max-width: 420px; margin: auto; }
      }
    </style>
  </head>
  <body>
    <main>
      <img class="qr" src="${qrDataUrl}" alt="iPad 扫码安装二维码" />
      <section>
        <div class="eyebrow">iPad / iPhone 离线版</div>
        <h1>扫码安装，之后断网也能用</h1>
        <p class="lead">请用 iPad 相机扫码，并在 Safari 中完成一次离线缓存。</p>
        <ol>
          <li>扫码后使用 Safari 打开。</li>
          <li>等待右上角显示“离线准备完成”。</li>
          <li>点击“分享”→“添加到主屏幕”→“添加”。</li>
          <li>从桌面图标打开一次，即可关闭电脑并断网使用。</li>
        </ol>
        <div class="ready">资料识别、答题和批改均在 iPad 本机完成。二维码地址只用于首次下载安装应用文件。</div>
        <div class="url">${escapedUrl}</div>
      </section>
    </main>
  </body>
</html>`;

await writeFile(path.join(outputDirectory, "ipad-install.html"), html, "utf8");
console.log(path.join(outputDirectory, "ipad-install.html"));
