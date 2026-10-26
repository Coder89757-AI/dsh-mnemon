---
"dsh-mnemon": patch
---

Allow the DeepSeek official model directory six seconds to finish DSH 0.2.1-rc.3's network-backed lookup, so a response within DSH's default five-second request budget can populate the task Agent model selector on its first load. Other Providers keep their three-second bound.

DeepSeek 官方模型目录等待上限改为六秒，让 DSH 0.2.1-rc.3 在默认五秒请求预算内返回的联网目录能首次填充任务 Agent 模型选择列表。其他 Provider 保持三秒上限。
