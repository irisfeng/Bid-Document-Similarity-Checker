# 重启续做记录

更新时间: 2026-03-02

## 当前备份

- 备份目录: `C:\Users\tonif\Downloads\bid-checker-desktop\backups\20260302-112339`
- 已备份文件:
  - `main.js`
  - `package.json`
  - `preload.js`
  - `renderer/index.html`
  - `renderer/styles.css`
  - `renderer/app.js`

## 当前已完成

- 后端已从简单总分结果改为结构化输出:
  - `overview`
  - `textAnomalies`
  - `metadataWarnings`
  - `keywordMatches`
- 文本对比已改为更适合中文的归一化 + 2-gram token 相似度方案。
- 文档读取已改为异步 `fs/promises`。
- PDF 解析已改为 `pdfjs-dist/legacy/build/pdf.js` 并使用 `disableWorker: true`。
- 前端已拆分为:
  - `renderer/index.html`
  - `renderer/styles.css`
  - `renderer/app.js`
- UI 已重构为三栏工作台:
  - 顶部操作区
  - 结果概览卡片
  - Tab 模式切换
  - 左侧异常目录
  - 中右双栏证据面板
- 图片对比 Tab 目前仅为占位入口，尚未实现真实能力。
- 已移除 `package.json` 中对缺失 `icon.ico` 的强依赖。
- `main.js` 已改为仅在 `icon.ico` 存在时才设置窗口图标。

## 已知现状

- `node -c main.js` 已通过。
- `node -c renderer/app.js` 已通过。
- 尚未实际启动 Electron 做完整交互验证。
- 当前“双栏证据”仍是段落级展示，不是 PDF 页面渲染高亮。
- DOCX 元数据仍未做深度提取，当前主要依赖 PDF 元数据和文件时间。

## 重启后优先待办

1. 启动应用做首轮联调
   - 运行 `npm start`
   - 验证文件选择、解析、比对、Tab 切换是否正常
   - 检查控制台是否有 Electron / PDF 解析报错

2. 修复 UI 与交互细节
   - 校验三栏布局在 1366px 和更宽分辨率下的表现
   - 检查长文件名、空结果、报错状态是否显示正常
   - 处理 `alert()` 的粗糙提示，替换为页面内提示条

3. 落地真正的 PDF 页面预览
   - 新增页面渲染 IPC（按页获取 PDF 渲染结果）
   - 中右面板改为页面预览容器
   - 点击异常项后跳转到对应页
   - 后续再补矩形高亮框

4. 细化文本定位
   - 现在是段落级异常
   - 下一步要把异常收敛到句子/短语
   - 为每条异常补更精准的摘要与命中片段

5. 完善元数据能力
   - DOCX 读取 `docProps/core.xml`
   - 增加 `createdAt / modifiedAt / creator / producer` 的更准规则
   - 区分“确实相同”和“仅时间接近”

6. 补图片对比
   - 先做 PDF 页面截图
   - 再做图块 hash 比对
   - 最后接到“图片对比结果” Tab

7. 增加报告导出
   - 先导出 HTML
   - 内容包含: 总览、异常列表、元数据、关键字、证据片段

## 如果需要回滚

- 可直接从备份目录复制回以下文件:
  - `main.js`
  - `package.json`
  - `preload.js`
  - `renderer/index.html`
  - `renderer/styles.css`
  - `renderer/app.js`
