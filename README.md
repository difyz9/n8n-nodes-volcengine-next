# @difyz/n8n-nodes-volcengine

[![npm version](https://img.shields.io/npm/v/@difyz/n8n-nodes-volcengine)](https://www.npmjs.com/package/@difyz/n8n-nodes-volcengine)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

火山方舟（Volcengine Ark）的 n8n 社区节点，提供豆包 Chat、Seedream 图片生成、Seedance 视频生成和 Files API 文件管理。

## 环境要求

- n8n `>= 1.82.0`
- Node.js `>= 22.16`
- 火山方舟 API Key，以及相应模型或推理接入点的访问权限

## 安装

在 n8n 的 **Settings → Community Nodes** 中安装：

```text
@difyz/n8n-nodes-volcengine
```

自托管环境也可以执行：

```bash
npm install @difyz/n8n-nodes-volcengine
```

## 凭据配置

新建 **Volcengine Ark API (Next)** 凭据：

| 字段     | 说明                                                                  |
| -------- | --------------------------------------------------------------------- |
| API Key  | 在火山方舟控制台的 API Key 管理页面获取                               |
| Base URL | 默认 `https://ark.cn-beijing.volces.com/api/v3`；代理或其他区域可修改 |

凭据测试会请求 `GET /models`。Base URL 不要包含末尾 `/`。

## 节点概览

| 节点                              | 类型              | 用途                                      |
| --------------------------------- | ----------------- | ----------------------------------------- |
| Volcengine Ark Chat Model (Next)  | AI Language Model | 连接 n8n AI Agent 或 AI Chain             |
| Volcengine Ark Image Model (Next) | Regular Node      | Seedream 文生图、参考图生图和组图         |
| Volcengine Ark Video Model (Next) | Regular Node      | Seedance 文生视频、关键帧和多模态参考视频 |
| Volcengine Ark File (Next)        | Regular Node      | 上传、列出、读取、下载和删除文件          |

模型选项从 `/models` 动态加载，并按节点类型过滤已知模型名称。`ep-*` 等无法判断能力的自定义 Endpoint 会保留；也可以直接填写自定义模型或 Endpoint ID。接口不可达时使用内置列表。

## Chat Model

将节点的 **Model** 输出连接到 AI Agent 或 AI Chain。主要选项：

| 选项                       |      默认值 | 说明                                             |
| -------------------------- | ----------: | ------------------------------------------------ |
| Thinking Mode              |    Disabled | 为支持的模型发送 `thinking: { type: "enabled" }` |
| Stream                     |      `true` | AI Agent 场景建议保持开启                        |
| Parallel Tool Calls        |     `false` | 是否允许模型在单轮并行调用工具                   |
| Temperature                |       `0.7` | 采样温度，范围 0–2                               |
| Top P                      |         `1` | 核采样阈值，范围 0–1                             |
| Maximum Number of Tokens   |        `-1` | `-1` 表示不发送限制，使用服务端默认值            |
| Response Format            |        Text | JSON Object 模式通常要求 Prompt 包含 `json`      |
| Timeout                    | `360000` ms | 单次请求超时                                     |
| Max Retries                |         `2` | LangChain 请求重试次数                           |
| Additional Model Arguments |          空 | 浅合并到 Ark 请求的额外模型参数                  |

Thinking 模式下，多轮工具调用会尝试把上一轮 `reasoning_content` 注入后续请求。Thinking 关闭时，节点会将只有 `reasoning_content` 的流式增量映射为普通 assistant text，以便 n8n AI Agent 聚合输出。

## Image Model

输入每个 n8n item，节点生成一个或多个输出 item。成功下载时，图片写入 binary；JSON 中同时保留临时 URL、索引和 `revised_prompt`。下载失败时仍返回 URL，并设置 `downloadFailed: true`。

### 输入方式

- **No Image**：文生图。
- **Image URL**：公开可访问的参考图 URL。
- **Binary Data**：读取输入 item 的 binary 属性，并使用该属性的真实 MIME 类型生成 Data URL。

### 常用选项

- Size：`2K`、`3K`、`4K` 或自定义 `宽x高`。
- Output Format：JPEG；PNG 仅适用于服务端支持的模型版本。
- Watermark：是否添加水印。
- Sequential Image Generation：`auto` 允许模型根据提示生成组图，`disabled` 关闭组图。
- Number of Images：仅文生图时发送；具体上限仍受所选模型约束。
- Output Property Name：默认 `image`。

不同 Seedream 版本支持的尺寸、格式、组图和参数并不完全相同。遇到 400 参数错误时，请先核对所选模型的官方文档。

## Video Model

节点调用 `POST /contents/generations/tasks` 创建异步任务，随后轮询任务状态。成功后下载 `content.video_url` 到 binary 属性，同时保留 task ID 和 URL。

| 模式                        | 必需输入                                                  |
| --------------------------- | --------------------------------------------------------- |
| Text to Video               | Prompt                                                    |
| First Frame to Video        | Prompt + 一张首帧图片                                     |
| First + Last Frame to Video | Prompt + 首帧图片 + 尾帧图片                              |
| Multi-Modal Reference       | Prompt 或参考媒体；仅音频无效，音频必须搭配参考图片或视频 |

图片、视频和音频均支持 URL 或输入 item 的 binary 属性。多模态模式最多读取 9 张图片、3 个视频和 3 个音频；超出的输入不会发送。

主要输出选项包括宽高比、分辨率、时长、水印、生成音轨、轮询间隔和总超时。默认每 5 秒轮询，最多等待 10 分钟。超时错误中会保留 task ID，可使用官方任务查询接口继续查询；节点当前不提供独立的“恢复已有任务”操作。

## File

| Operation        | 输入                             | 输出                                             |
| ---------------- | -------------------------------- | ------------------------------------------------ |
| Upload           | binary 属性、可选文件名、purpose | 文件元数据和 file ID                             |
| List             | 可选 purpose                     | 每个文件一个输出 item；空列表返回 `{ data: [] }` |
| Get Info         | file ID                          | 文件元数据                                       |
| Download Content | file ID、输出 binary 属性名      | 文件 metadata 和 binary 内容                     |
| Delete           | file ID                          | 删除结果                                         |

Upload 默认读取 binary 属性 `data`，Download Content 默认写入 `file`。文件有效期由火山方舟服务端策略决定，节点不声明或发送自定义有效期。

## 常见问题

### 下拉列表中没有我的 Endpoint

确认凭据测试可访问 `/models`，也可以在 Model 字段直接输入 Endpoint ID。请确保 Endpoint 的能力与节点类型一致。

### 图片或视频任务返回参数错误

Seedream/Seedance 不同版本的尺寸、时长、分辨率、音频和参考媒体限制不同。节点提供通用参数集合，但不能让服务端不支持的参数变为可用。

### 生成成功但下载失败

节点仍会返回临时资源 URL 和 `downloadFailed: true`。检查 n8n 所在网络能否访问该 URL，并在 URL 过期前下载。

### 二进制属性不存在

确认上游节点确实输出 binary 数据，并让属性名与本节点配置一致。n8n 中 JSON 字段和 binary 属性是两套数据。

## 开发验证

```bash
npm run lint
npm test
npm run pack:check
npm run release:check
```

## 官方文档

- [火山方舟文档](https://www.volcengine.com/docs/82379/1099475)
- [Chat OpenAI 兼容接口](https://www.volcengine.com/docs/82379/1330626)
- [图片生成 API](https://www.volcengine.com/docs/82379/1541523)
- [视频生成 API](https://www.volcengine.com/docs/82379/1520757)
- [Files API](https://www.volcengine.com/docs/82379/1885708)
- [API Key 管理](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey)

## License

MIT
