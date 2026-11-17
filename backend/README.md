# 统一后端（本地原型）

需要 Node.js。无需安装额外 npm 包。

```powershell
node server.mjs
```

默认监听 `127.0.0.1:8791`。主要接口见 `server.mjs`，包括 `/health`、`/api/mobile/bootstrap`、`/api/ar/analyze`、`/api/ar/display/latest`、档案、候选池和照护记录。

## AI 提供方

未配置云端模型时，后端使用 mock 规则为 UI 联调提供可运行结果。mock 输出不能用于证明识别质量。

如需接入兼容 OpenAI API 的模型，可在当前终端设置：

```powershell
$env:LLM_BASE_URL="你的兼容 API 地址"
$env:LLM_API_KEY="你的密钥"
$env:LLM_MODEL="支持视觉输入的模型名"
node server.mjs
```

不要将密钥、用户图片或个人数据提交到公共仓库。当前服务面向本机原型，**没有账号、鉴权、限流和生产级存储**；不要直接暴露到公网。

## 身份路由

`adapters/petFaceAdapter.mjs` 是接入预留。仓库不包含 PetFace 权重；默认身份路由依赖请求元数据和演示档案，不等于视觉个体识别。

## 数据

`data/` 中的宠物档案和照护历史均为虚构演示数据，不对应真实宠物或主人；候选池和 AR 最新状态初始为空。服务会修改这些 JSON 文件；重复演示前可从 Git 恢复。候选池 → 今日记录 → 长期记录是 demo 链路，不具备生产环境的并发、权限或备份能力。
