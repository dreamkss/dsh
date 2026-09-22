# DeepSeek Harness 核实模式

一个 DSH **Agent preset**：在发行版 `standard` 之上只改一处 —— 给系统提示的 persona
加一段约束，要求**结论必须先经本会话核实，未经验证的内容须显式标注**。

面向的问题是语言模型的"幻觉式断言"：把记忆里的东西当成刚验证过的事实说出来。这段
约束不增加任何工具，只改变**报告纪律**。

```text
You are a coding agent powered by the {{model}} model. Distinguish what you
actually ran or read from what you assert from memory. Before reporting a
version, a measurement, a file's content, or a behavior as fact, verify it in
this session. State plainly when something is inferred, unverified, or not
checked rather than presenting a guess as a result. If you cannot obtain
evidence, say so instead of inventing details.
```

`{{model}}` 是 DSH 的占位符，由 agent 自己的路由解析；原文那句
`You are a coding agent powered by the {{model}} model.` 保留在前，新约束紧随其后。

## 快速导入

把 `preset/` 整个目录复制到 `<dshHome>/.agent-presets/verified/`：

```powershell
# dshHome 默认是 ~/.dsh，可用 $env:DSH_HOME 覆盖
$dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { "$env:USERPROFILE\.dsh" }
$dest = Join-Path $dshHome '.agent-presets\verified'

New-Item -ItemType Directory -Path $dest -Force | Out-Null
Copy-Item .\preset\* $dest -Force
```

目录名 `verified` 就是 preset 的 `id`，**不要改名** —— 除非你同时改掉所有引用。

复制后**新建一个会话**，在 preset 选择器里选「核实模式」。详见
[`docs/导入方法.md`](docs/导入方法.md)。

## 校验

```powershell
node verify-preset.cjs
```

脚本会断言：组合文件结构完整、**除 persona 外每一行都与发行版 `standard` 逐字节相同**、
YAML 折叠标量解析成预期的单个段落、以及元数据与编码正确。

它需要找到发行版的 `standard` 作为比对基准；路径不对时用环境变量指定：

```powershell
$env:DSH_INSTALL = '<...>\node_modules\@deepseek-ai\dsh-agent-presets'
node verify-preset.cjs
```

脚本自带一个针对本文件子集的最小 YAML 读取器，**不依赖任何 npm 包**，所以在没有
`node_modules` 的目录里也能跑。

## 发布到 GitHub

本目录已是一个带历史的 git 仓库（分支 `master`）。推送到 `https://github.com/<user>/dsh`：

```powershell
# 1) 先在 GitHub 上建一个空仓库（不要勾选 README/LICENSE，否则首推会冲突）
#    需要凭据；若本机可访问 GitHub 网页，也可直接在网页建。

# 2) 配置 remote 并推送
cd C:\Users\dream\dsh-verify-preset
git remote add origin https://github.com/<user>/dsh.git
git push -u origin master
```

首次推送会触发 Git Credential Manager 的登录（该凭据助手已随 MinGit 提供，
`credential.helper = manager` 也已配置）。**GitHub 已不接受密码认证**，需要用
PAT 或浏览器登录流程。

### 本机无法直连 GitHub 时的替代路径

若本机到 `github.com` 不通（本机实测过连续超时），可以在**任意能上网的机器**上用
随附的 bundle 还原整个仓库，再从那台机器推送：

```bash
git clone dsh-verify-preset.bundle dsh
cd dsh
git remote set-url origin https://github.com/<user>/dsh.git
git push -u origin master
```

bundle 含完整历史（`git bundle verify` 报 `complete history`）。这个路径**不需要**
本机有 GitHub 凭据，也不需要本机能访问 GitHub。

## 目录内容

```
preset/
  agent.cordis.yml   组合文件（发行版 standard 的完整副本 + 一处 persona 改动）
  preset.yml         元数据：显示名与描述
docs/
  导入方法.md         安装位置、机制、生效条件、卸载、常见问题
verify-preset.cjs    自包含校验脚本
```

## 已知边界

- **只在一台机器上验证过**：ASUS TUF FA608UM / Windows 11 25H2 / DSH 0.1.5-rc.2
  （npx 安装）。组合文件引用的是发行版包名，跨版本可能失配。
- **挂载校验通过，但未在真实会话中确认工具列表**。`standingKeyFor` 证明它能挂载，
  不证明它产出的 agent 符合预期。见 [`docs/导入方法.md`](docs/导入方法.md) 的
  「验证状态」。
- **不增加工具**。它只改 persona 文本，能力集与 `standard` 完全一致。

## 许可与来源

组合文件派生自 DeepSeek Harness 发行版自带的 `standard` preset。本项目仅记录对其
persona 的一处追加。
