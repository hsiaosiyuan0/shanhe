# GitHub Pages 在线版

[← 返回产品介绍](../README.md)

在线地址：**[hsiaosiyuan0.github.io/shanhe](https://hsiaosiyuan0.github.io/shanhe/)**。

打开即可创建故事、阅读地图与时间线、编辑事件和标记、执行演示指令、保存快照，以及导入和导出 JSON。无需在电脑上启动山河后端。

## 在线版与本地版

| 能力                     | Pages 在线版                           | 本地 Web / macOS App   |
| ------------------------ | -------------------------------------- | ---------------------- |
| 故事、地图、时间线与编辑 | 支持                                   | 支持                   |
| 保存、快照与 JSON 迁移   | 当前浏览器的 IndexedDB                 | 本机 SQLite            |
| 预设演示指令             | 支持                                   | 支持                   |
| 模型 API 与地图工具调用  | 浏览器直连 HTTPS 服务，服务须允许 CORS | 本地后端请求服务       |
| API Key                  | 仅当前页面内存；刷新或关闭即清除       | 权限受限的本机 SQLite  |
| 本机 Codex / Ollama      | 不支持                                 | 支持                   |
| 跨设备自动同步           | 暂不支持，可导出再导入                 | 暂不支持，可导出再导入 |

在线版的故事不会上传到 GitHub，也不会自动出现在其他设备或浏览器中。清除网站数据、使用临时浏览窗口，或浏览器回收存储，可能丢失本地故事；需要保留的内容请定期导出 JSON。首次访问会创建三个示例，删除示例后不会自动补回。

两种版本共用故事格式、示例、演示指令和模型工具校验。对话中的地图修改先暂存，最终回答完成后与聊天一起提交；失败、取消或版本冲突时，本轮不保存。多标签页保存使用版本检查，恢复快照之前会自动备份。

## 在线连接模型

打开「模型设置」，填写 HTTPS API 根地址、模型 ID 和自己的 API Key。服务须兼容 Chat Completions 工具调用协议，并允许来自 `https://hsiaosiyuan0.github.io` 的跨域请求。

只有点击发送时，当前故事和最近对话才会提交给这个服务。密钥不写入 IndexedDB、localStorage、导出文件或部署产物；刷新后需要重新输入。切换服务地址会清除旧地址的密钥。

如果出现 CORS 错误，需要由模型服务提供方允许该来源，无法通过修改前端绕过。不能配置 CORS 的服务、本机 Codex 或 Ollama，请通过[本地版](SETUP.md)使用。不要把个人密钥放进 `VITE_*` 环境变量或 GitHub Actions 构建参数中，前端构建内容对访问者公开。

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

网页外壳和已访问的同源资源会缓存；在线地形瓦片与远程模型仍需要网络。Pages 不运行 Node 后端、SQLite 或本机程序。未来若需要云端账户、自动同步或统一模型额度，还需要独立后端与访问控制，这些能力不属于当前静态部署。

参考：[GitHub Pages 的托管范围](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)、[Vite Pages 部署](https://vite.dev/guide/static-deploy.html#github-pages)、[浏览器跨域请求](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)。
