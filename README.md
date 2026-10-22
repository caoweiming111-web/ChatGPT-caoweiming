# MakeX Curriculum — Inspire · Explorer · Challenge

MakeX 机器人课程管理系统，支持课程创建、编辑、文档导出和多人协作。

## 直接使用

直接打开 index.html 即可使用（数据保存在浏览器本地存储中）。

## 多人协作

1. 安装依赖：
pm install
2. 启动服务器：双击 start-server.bat 或运行 
ode server.js
3. 浏览器打开 http://localhost:3456/

多人从同一地址打开即可实时同步数据。

## 功能

- 三个课程模块：Inspire / Explorer / Challenge
- 每个模块 48 个课程槽位
- 课程名称、副标题、器材、目标、流程的完整编辑
- 智能粘贴：从表格/文档粘贴自动识别填充字段
- 生成课程文档图片（复制到剪贴板或下载PNG）
- 数据自动保存到 localStorage
- 可选多人协作同步

## 技术栈

纯前端 HTML/CSS/JavaScript，无任何外部依赖。可选 Node.js 服务器用于多人协作。
