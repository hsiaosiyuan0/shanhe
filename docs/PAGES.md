# GitHub Pages 在线版

[← 返回产品介绍](../README.md)

在线地址：**[hsiaosiyuan0.github.io/shanhe](https://hsiaosiyuan0.github.io/shanhe/)**。

打开即可创建故事、阅读地图与时间线、编辑事件和标记、保存快照，以及导入和导出 JSON。无需在电脑上启动山河后端。在线版专注于故事阅读与整理，AI 探索请使用[桌面版](DESKTOP.md)。

## 在线版与本地版

| 能力                     | Pages 在线版           | 本地 Web / macOS App   |
| ------------------------ | ---------------------- | ---------------------- |
| 故事、地图、时间线与编辑 | 支持                   | 支持                   |
| 保存、快照与 JSON 迁移   | 当前浏览器的 IndexedDB | 本机 SQLite            |
| 探索助手与演示指令       | 不显示对话与模型设置   | 支持                   |
| 模型 API 与地图工具调用  | 请使用桌面版           | 本地后端请求服务       |
| 本机 Codex / Ollama      | 请使用桌面版           | 支持                   |
| 跨设备自动同步           | 暂不支持，可导出再导入 | 暂不支持，可导出再导入 |

在线版的故事不会上传到 GitHub，也不会自动出现在其他设备或浏览器中。清除网站数据、使用临时浏览窗口，或浏览器回收存储，可能丢失本地故事；需要保留的内容请定期导出 JSON。首次访问会创建三个示例，删除示例后不会自动补回。

部署新版后，浏览器故事库继续沿用原来的数据。读取列表、打开故事和编辑前统一经过 Story schema 补齐新增字段（如自定义河道列表），恢复旧快照也经过相同校验。兼容处理不会在只读时改写存档或增加修订号；无需通过清除网站数据来升级。回归测试直接创建旧版本的 IndexedDB 记录，覆盖打开、地图渲染、导出、继续编辑与快照恢复。

两种版本共用故事格式、示例和地图编辑校验。在线版多标签页保存使用版本检查，恢复快照之前会自动备份。已有或导入的对话记录仍随故事保存、导出和恢复，不会因对话栏移除而丢失。

## 到桌面版继续探索

在线版右上角的「使用桌面版」提供 macOS 安装指引，也可以直接导出当前故事。在桌面版点击「导入故事」，即可带上事件、标记、路线和已有对话继续探索。

桌面安装指引提供 Apple Silicon / Intel 包的下载入口，也保留源码构建步骤。[查看安装步骤](DESKTOP.md)

已经安装桌面版的用户直接打开 App 即可。在线版无需配对本机，也不接收模型密钥或请求模型服务。桌面版和带本地后端的 Web 版保留本机 Codex、Ollama 与模型 API 连接能力。

## 自动部署

仓库的 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。

[部署工作流](../.github/workflows/pages.yml) 在推送 `main` 时自动执行测试、构建本地版和浏览器版，再将 **仅包含静态资源的 `dist-pages/`** 发布到 Pages。Pull Request 只检查与构建，不部署。

前端使用 `/shanhe/` 作为资源前缀；地图 GeoJSON、图标、manifest 和 Service Worker 均支持子目录。工作流会按仓库名设置 `PAGES_BASE_PATH`。使用自定义域名的根目录时，应将该值改为 `/`。

本地预览同一份部署产物：

```sh
npm ci
npm run build:pages
npm run preview:pages
```

打开 [127.0.0.1:4173/shanhe/](http://127.0.0.1:4173/shanhe/)。开发浏览器版可以运行 `npm run dev:pages`，端口为 5179。

网页外壳和已访问的同源资源会缓存；在线地形瓦片仍需要网络。Pages 不运行 Node 后端、SQLite 或本机程序。未来若需要云端账户或自动同步，还需要独立后端与访问控制，这些能力不属于当前静态部署。

参考：[GitHub Pages 的托管范围](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)、[Vite Pages 部署](https://vite.dev/guide/static-deploy.html#github-pages)。
