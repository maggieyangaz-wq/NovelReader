# 在线小说阅读器

一个使用 **Vite、TypeScript 和独立 CSS** 开发的加密小说阅读器。构建后是静态网站，解密与阅读完全在浏览器中完成，无需后端服务。

## 功能特性

- 📚 在线浏览加密小说列表
- 🔐 密钥保护 - 需要输入正确的密钥才能解密并阅读小说
- 🎨 字体大小调整（12px-24px）
- 🌙 日间/夜间主题切换
- 💾 自动保存阅读进度（按字符位置保存，调整每页字数也不会丢失位置）
- 🔖 按字符位置保存书签，兼容旧版本页码书签
- 🔒 小说文件使用 AES-256-GCM 加密（带认证，能可靠检测密码错误）
- 📱 响应式设计，支持移动设备

## 项目结构

| 文件 / 目录 | 作用 |
| --- | --- |
| `index.html` | 页面结构，无内联脚本和静态样式 |
| `src/main.ts`、`src/app.ts` | 入口、事件绑定和界面状态 |
| `src/reader.ts` | 分页、字符位置和章节识别 |
| `src/bookmarks.ts`、`src/storage.ts` | 书签迁移、阅读记录、设置持久化 |
| `src/catalog.ts`、`src/crypto.ts` | 书库校验、文件加载、NVL2 解密 |
| `src/ui.ts` | 使用 DOM API 安全生成列表 |
| `src/styles/` | 基础、书库、阅读页、弹窗和主题 CSS |
| `novels/` | 原有小说索引和加密文件 |
| `encrypt-novel.js` | 本地加密工具，命令和文件格式兼容旧版 |
| `tests/` | 分页、存储、加密兼容和 DOM 交互测试 |
| `vite.config.ts` | 构建配置；仅复制小说索引和加密资源 |
| `dist/` | 构建产物，不提交到 Git |

## 本地开发与验证

使用 **Node.js 24.15+（24 LTS）**；仓库中的 `.nvmrc` 和 GitHub Actions 均选择 Node 24。

```bash
npm ci
npm run dev
```

打开终端给出的本地地址。源代码中的 TypeScript 需要通过 Vite 运行，不再直接双击 `index.html`。

```bash
npm test            # Node 测试运行器 + jsdom，包含真实加密/解密兼容测试
npm run typecheck   # 严格 TypeScript 检查
npm run build       # 类型检查通过后构建到 dist/
npm run preview     # 查看构建后的页面
```

依赖版本固定在 `package-lock.json`。测试使用自动生成的普通文本和专用测试密码，不需要真实小说密钥。

## 使用方法

### 加密并添加小说

1. 原始 TXT/MD 小说文件放在**仓库目录之外**（或项目根目录，`.gitignore` 已阻止明文入库）
2. 运行加密脚本，密钥通过环境变量传入，**不要写进任何文件**：
   ```bash
   NOVEL_PASSWORD=你的密钥 node encrypt-novel.js /path/to/your-novel.txt
   ```
3. 加密后的文件会生成在 `novels/` 目录下
4. 更新 `novels/index.json`，添加小说信息：
   ```json
   {
     "novels": [
       {
         "id": "novel-1",
         "title": "小说标题",
         "filename": "your-novel.txt.encrypted"
       }
     ]
   }
   ```
5. 启动 `npm run dev` 或发布构建后的站点，点击小说，输入密钥后即可阅读

### 在线部署

- **GitHub Pages**：push 到 `main` 后，工作流运行 `npm ci`、测试和构建，再发布 `dist/`。`READER_BASE_PATH` 自动设为 `/<仓库名>/`，适配当前 `/SP-Novel-Reader/` 地址。分支和 PR 会运行 `.github/workflows/check.yml` 验证构建。
- **Cloudflare Workers**：安装依赖后运行 `wrangler deploy`；`wrangler.jsonc` 会先执行构建，然后只上传 `dist/`。默认构建路径为 `/`，适用于域名根路径。此配置使用 Wrangler 的[自定义构建步骤](https://developers.cloudflare.com/workers/wrangler/configuration/#custom-builds)。
- **产物范围**：`index.html`、构建生成的 JS/CSS、`.nojekyll`、`novels/index.json` 和 `.encrypted` 文件；加密工具、源码、测试和原始明文不进入构建产物。

如果需要在本地验证 GitHub Pages 子路径，构建和预览时使用相同的环境变量：

```bash
# Bash / macOS / Linux
READER_BASE_PATH=/SP-Novel-Reader/ npm run build
READER_BASE_PATH=/SP-Novel-Reader/ npm run preview
```

```powershell
# Windows PowerShell
$env:READER_BASE_PATH = '/SP-Novel-Reader/'
npm run build
npm run preview
```

## 旧数据兼容

- 沿用 `reader_pos_<小说ID>`、`reader_page_<小说ID>`、`reader_fontSize`、`reader_lineHeight`、`reader_charsPerPage`、`reader_darkMode` 和 `bookmarks_<小说ID>`，在同一浏览器、同一网站地址下继续读取原有记录。
- 新书签保存 UTF-16 字符位置，与 JavaScript 字符串及已有阅读进度保持一致。调整每页字数时保留位置，再计算其所在页。
- 首次打开小说时，旧页码书签优先用原有文字摘录定位；重复摘录选择最接近估算页码的位置。原始记录先备份到 `bookmarks_legacy_<小说ID>`，再转换。若摘录已被修改或不存在，只能按旧页码与当前每页字数估算位置。
- 字号与行距在启动时立即应用。存储不可用时显示提示，仍可继续阅读。

## 密钥管理

- 密钥**只存在于使用者的记忆/密码管理器中**，仓库和部署产物里都没有
- 加密脚本通过环境变量 `NOVEL_PASSWORD` 接收密钥
- 更换密钥：用新密钥重新加密所有原始文件并替换 `novels/` 下的 `.encrypted` 文件即可
- ⚠️ 一旦遗忘密钥，加密文件无法恢复

## 技术细节

### 加密文件格式

```
NVL2(4字节魔数) | salt(16字节) | IV(12字节) | 密文 | GCM认证标签(16字节)
```

### 加密流程
1. 每个文件生成随机的 16 字节 salt 和 12 字节 IV
2. 使用 PBKDF2-SHA256 从密钥派生 AES-256 密钥（300000 次迭代）
3. 使用 AES-256-GCM 加密小说文本（自带完整性认证）

### 解密流程
1. 前端读取加密文件，解析文件头中的 salt 和 IV
2. 用户输入密钥，浏览器 WebCrypto API 派生密钥
3. AES-GCM 解密；格式错误会单独提示。认证失败时提示“密码错误或小说文件已损坏”，因为仅凭认证失败无法区分这两种情况。

### 安全须知
- 密文在公开仓库中是安全的，但**密钥本身绝不能出现在仓库的任何历史版本中**
- 如果密钥泄露，应视为所有用旧密钥加密的密文已经泄露：必须换新密钥重新加密，且旧密文不能再留在公开的地方（包括 git 历史）
- 前端解密，无需信任服务器

## 浏览器兼容性

使用支持 ES Modules、WebCrypto API 和现代 CSS 的 Chrome、Edge、Firefox 或 Safari。在线解密需要 HTTPS；本地开发使用 localhost。Node.js 只用于开发、测试和构建，读者无需安装。

## 注意事项

1. **备份**：加密前务必备份原始小说文件（保存在仓库之外）
2. **密钥遗忘**：一旦遗忘密钥，无法恢复加密文件内容
3. **文件编码**：确保小说文件为 UTF-8 编码
4. **大文件**：大型小说文件解密可能需要几秒钟
