# 划词翻译 · 英中 (browser-translate-ext)

一款轻量的 Chromium 浏览器扩展（Chrome / Edge / 360 / QQ 等均可用）：在网页上**选中英文，松开即弹出翻译卡片**。

- 单个单词 → 显示音标、词性（名词/动词/形容词/副词…）、每种词性的常见中文释义与英文例句
- 短语 / 整句 → 直接给出流畅的中文译文
- 选中中文 → 反向翻译为英文
- 右键菜单「翻译选中内容」作为备选触发方式

## 安装（无需打包，开发者模式加载即可）

1. 打开浏览器扩展管理页：
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - 360 / QQ 等浏览器：菜单 → 扩展管理（同样地址）
2. 打开右上角 **开发者模式**
3. 点击 **加载已解压的扩展程序**，选择本仓库目录（含 `manifest.json` 的文件夹）
4. 完成。之后在任意网页选中英文即可自动弹出翻译

## 使用

- **划词**：鼠标选中英文文本，松开后自动在选区旁弹出翻译卡
- **关闭卡片**：点卡片右上角 ×、按 `Esc`、或点击页面其他位置
- **右键菜单**：选中文字后右键 →「翻译选中内容」

## 翻译引擎

扩展内置两种引擎，可在扩展「选项」页切换：

| 引擎 | 质量 | 配置 |
|------|------|------|
| 免费引擎（默认） | 高 | 无需任何配置，开箱即用 |
| 大模型 (LLM) | 最高 | 需填写 OpenAI 兼容 API Key |

- **免费引擎**：单词走 [Free Dictionary API](https://dictionaryapi.dev)（Wiktionary 数据，自带词性与例句），释义自动机翻为中文；句子走 Google 翻译接口。
- **大模型引擎**：支持任意 OpenAI 兼容接口（DeepSeek / OpenAI / Moonshot 等），单词释义与句子翻译全部由大模型完成，词性分组、中文释义、例句质量最佳。密钥仅保存在本地浏览器。

示例（DeepSeek）：
- API 地址：`https://api.deepseek.com/v1`
- 模型：`deepseek-chat`

## 文件结构

```
├── manifest.json    # 扩展配置（Manifest V3）
├── content.js       # 内容脚本：划词检测 + 翻译卡片渲染
├── background.js    # 后台服务：词典/翻译请求、LLM 调用、右键菜单
├── options.html     # 设置页
└── options.js       # 设置页逻辑
```

## 隐私

- 划词文本仅发送给你所选的翻译服务（词典 / 谷歌翻译 / 你自己配置的 LLM 服务商）
- API Key 仅存储在本地浏览器 `chrome.storage.local`，不上传到任何第三方

## License

[MIT](LICENSE)
