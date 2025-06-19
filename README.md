# 🎮 《魔女：终末旅途》数据分析仪表板

这是一个用于游戏《魔女：终末旅途》的静态网页数据可视化仪表板。项目基于 HTML、CSS 和 JavaScript 构建，无需后端服务，适用于部署在静态托管平台（如 GitHub Pages、Vercel、Netlify 等）。

## 🧠 项目介绍

本仪表板主要用于分析玩家在游戏过程中对 **卡牌（Cards）**、**遗物（Relics）** 和 **祝福（Blessings）** 的选取行为。数据来源于 Supabase 实时数据库，并通过多维度图表和表格进行可视化呈现，帮助开发者或玩家更好地理解游戏内物品的使用偏好。

## ✨ 功能特性

- 📊 卡牌/遗物/祝福的选择率、购买率、热门度分析
- ⏰ 时间分析（按小时、天、星期）
- 👥 玩家活跃情况统计
- 🔍 层数分布与趋势分析
- 📥 数据导出功能（CSV 格式）
- 🔐 登录系统，支持 Supabase Auth
- 📱 响应式设计，适配手机端

## 🗂️ 项目结构

├── index.html # 主页面，包含登录框与数据展示框架
├── style.css # 页面样式（深色卡片风格）
├── script.js # 主逻辑脚本，含数据加载、可视化、交互逻辑
├── config.js # 可选配置文件（如 API Key 等）
└── assets/ # 图标、字体、图像资源（如有）

## ⚙️ 使用方法

1. **克隆仓库**

```bash
git clone https://github.com/DLSinnocence/apocalypse-journey-dashboard.git
```
2. 配置 Supabase
编辑 config.js（或在 script.js 中直接配置）：
```
const BASE_URL = "https://your-project.supabase.co";
const API_KEY = "your-public-anon-key";
const TABLE_NAME = "save_selection";
```
3. 部署方式（任选其一）

本地打开 index.html 查看效果（需联网）

上传到静态托管平台（如 GitHub Pages、Netlify、Vercel）

## 🔒 安全提示
所有敏感数据必须由 Supabase 端控制访问，建议启用 RLS（行级安全）；

前端已实现本地缓存与加密机制，提升加载性能与数据安全；

本项目使用 Supabase Auth 验证登录，避免前端绕过访问。

## 📃 许可证

本项目使用 MIT License。
