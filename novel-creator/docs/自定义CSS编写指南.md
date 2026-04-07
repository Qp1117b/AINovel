# 自动化小说创作系统 自定义CSS指南

本文档详细说明如何通过编写自定义CSS文件，完全覆盖系统的UI样式，实现个性化视觉定制。无论您是希望调整颜色、修改布局，还是彻底改变界面风格，本指南都将提供全面的技术支持和最佳实践。

---

## 1. 概述

自动化小说创作系统（以下简称“系统”）的界面由大量以 `nc-` 开头的CSS类定义。这些类控制着面板、按钮、卡片、进度条等所有可见元素的样式。系统通过油猴脚本动态注入默认样式（`<style id="nc-styles">`），同时允许用户加载外部CSS文件来覆盖这些默认样式。

通过自定义CSS，您可以：
- 修改主题色、背景、边框、阴影等视觉属性。
- 调整元素尺寸、间距、布局（需谨慎，可能影响响应式）。
- 为不同状态的元素（如Agent按钮的运行/完成/错误）设置专属配色。
- 实现深色模式、高对比度、个性化品牌风格等。

---

## 2. 基本用法

1. **打开主面板**：点击浮动按钮“📚 创作”。
2. **加载CSS文件**：在面板底部左侧，点击 **🎨 加载配色CSS** 按钮。
3. **选择CSS文件**：在弹出的文件选择器中，选择一个扩展名为 `.css` 的本地文件。
4. **立即生效**：文件加载成功后，样式会立即应用。您可以随时通过刷新页面恢复默认样式。

**注意**：
- 加载的CSS仅作用于当前浏览器标签页，刷新页面后自定义样式消失（除非您通过浏览器扩展或其他方式持久化）。
- 若加载的CSS文件有语法错误，系统会弹出错误提示，但不会影响原有样式。

---

## 3. CSS覆盖原理

### 3.1 优先级规则
- 默认样式通过 `<style id="nc-styles">` 注入，位于文档头部。
- 自定义样式通过 `<style id="nc-custom-styles">` 注入，位于默认样式之后。
- 相同选择器的规则，后面的会覆盖前面的（层叠原则）。
- **内联样式**（通过 `style` 属性直接写在元素上）优先级最高，需要使用 `!important` 才能覆盖。

### 3.2 如何覆盖内联样式
部分元素（如Agent状态按钮）的样式由JavaScript动态计算并以内联方式设置。要覆盖它们，必须在自定义CSS中使用 **`!important`** 标记，例如：
```css
.nc-workflow-agent-btn[data-state="running"] {
    background: linear-gradient(135deg, #ff8c00, #ff4500) !important;
    border-color: #ff8c00 !important;
}
```

### 3.3 选择器建议
- 优先使用**类选择器**（如 `.nc-panel`），这是最安全的方式。
- 对于特定状态，使用**属性选择器**（如 `[data-state="completed"]`）。
- 避免过度使用 `!important`，仅在必须覆盖内联样式时使用。

---

## 4. 可定制元素详解

下表列出了系统中最常用的样式类及其默认关键样式。您可以根据需要覆盖它们。

| 类名 | 作用 | 默认样式（关键属性） |
|------|------|----------------------|
| `.nc-overlay` | 遮罩层 | `background: rgba(0,0,0,0.25); backdrop-filter: blur(4px);` |
| `.nc-panel` | 主面板容器 | `background: linear-gradient(145deg, #1a1a3e 0%, #16213e 50%, #0f3460 100%);`<br>`border-radius: 16px;`<br>`box-shadow: 0 25px 80px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.1);` |
| `.nc-panel-title-text` | 面板标题文字 | `background: linear-gradient(90deg,#667eea,#764ba2); -webkit-background-clip: text;`（文字渐变） |
| `.nc-card` | 通用卡片容器 | `background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08);` |
| `.nc-card--accent` | 高亮卡片（左侧树形菜单） | `border-color: rgba(102,126,234,.3); background: rgba(102,126,234,.06);` |
| `.nc-card-title` | 卡片标题 | `color: #667eea;` |
| `.nc-btn` | 基础按钮 | `border: none; border-radius: 8px;`（字体、内边距等） |
| `.nc-btn-primary` | 主要按钮 | `background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;` |
| `.nc-btn-danger` | 危险按钮 | `background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%);` |
| `.nc-btn-secondary` | 次要按钮 | `background: rgba(255,255,255,.1); color: white; border: 1px solid rgba(255,255,255,.15);` |
| `.nc-tree-header` | 树形菜单头部 | `background: rgba(255,255,255,.05);`<br>悬浮：`background: rgba(255,255,255,.08); border-color: rgba(102,126,234,.3);` |
| `.nc-tree-header.active` | 激活的树形头部 | `background: rgba(102,126,234,.2); border-color: rgba(102,126,234,.5);` |
| `.nc-tree-child-item` | 树形菜单子项 | `background: rgba(255,255,255,.03);`<br>悬浮：`background: rgba(255,255,255,.06);`<br>选中：`background: rgba(102,126,234,.25); border: 1px solid rgba(102,126,234,.5);` |
| `.nc-agent-checkbox` | Agent复选框容器 | `background: rgba(255,255,255,.03);`<br>悬浮：`background: rgba(255,255,255,.06);` |
| `.nc-agent-checkbox.required` | 必选Agent复选框 | `background: rgba(40, 167, 69, 0.1); border: 1px solid rgba(40, 167, 69, 0.25);` |
| `.nc-required-badge` | 必选标记 | `background: linear-gradient(135deg, #28a745, #218838); color: white;` |
| `.nc-workflow-agent-btn` | 工作流Agent按钮 | `background: rgba(102,126,234,.15); color: #667eea; border: 1px solid rgba(102,126,234,.4);` |
| `.nc-workflow-agent-btn.nc-discard-btn` | 废章按钮 | 基础样式与上同，有废章时添加 `.has-discard` 类 |
| `.nc-workflow-agent-btn[data-state="running"]` | 运行中状态 | 内联样式：`background: linear-gradient(135deg, #10b981, #059669);` 等 |
| `.nc-workflow-agent-btn[data-state="completed"]` | 完成状态 | 内联样式：`background: linear-gradient(135deg, #06b6d4, #0891b2);` |
| `.nc-workflow-agent-btn[data-state="error"]` | 错误状态 | 内联样式：`background: linear-gradient(135deg, #ef4444, #dc2626);` |
| `.nc-workflow-agent-btn[data-state="pending"]` | 等待依赖 | 内联样式：`background: rgba(147,51,234,.15); border: #9333ea; color: #c084fc;` |
| `.nc-workflow-agent-btn[data-state="waiting_input"]` | 等待输入 | 内联样式：`background: rgba(245,158,11,.15); border: #f59e0b; color: #fbbf24;` |
| `.nc-workflow-agent-btn[data-state="reflow_processing"]` | 回流处理中 | 内联样式：`background: linear-gradient(135deg, #ec4899, #db2777);` |
| `.nc-workflow-agent-btn[data-state="reflow_waiting"]` | 回流等待 | 内联样式：`background: rgba(251,113,133,.12); border: rgba(251,113,133,.5); color: #fb7185;` |
| `.nc-progress-content` | 进度日志区域 | `background: rgba(0,0,0,.2);` |
| `.nc-state-item` | 状态条目项 | `background: rgba(255,255,255,.04); border-left: 3px solid #667eea;` |
| `.nc-state-header` | 状态条目头部 | `background: rgba(0,0,0,.2);`<br>打开时：`background: rgba(102,126,234,.2);` |
| `.nc-token-display` | Token统计容器 | `background: rgba(0,0,0,.25);` |
| `.nc-token-value` | Token数值 | `color: #667eea;` |
| `.nc-toolbar-btn` | 工具栏按钮 | `background: rgba(102,126,234,.15); color: #a0a0ff; border: 1px solid rgba(102,126,234,.3);` |
| `.nc-chapter-item` | 历史章节列表项 | `background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.06);` |
| `.nc-modal` | 模态框 | `background: #3a3a3a;` |
| `.nc-modal-body` | 模态框主体 | `background: #0f172a; border: 1px solid black;` |

> **说明**：上表仅列出关键类，实际可能有更多衍生类。建议使用浏览器开发者工具查看具体元素的类名。

---

## 5. Agent状态按钮的完全覆盖

Agent状态按钮的样式由 `CONFIG.AGENT_STATUS_COLORS` 定义，并通过内联样式动态设置。要完全覆盖，必须使用 `!important` 并结合 `[data-state]` 属性选择器。

### 5.1 基础覆盖示例
```css
/* 覆盖所有状态按钮的基础样式（可选） */
.nc-workflow-agent-btn {
    border-radius: 20px !important; /* 改变圆角 */
    font-weight: bold !important;
}

/* 运行中状态 */
.nc-workflow-agent-btn[data-state="running"] {
    background: linear-gradient(135deg, #ff8c00, #ff4500) !important;
    border-color: #ff8c00 !important;
    color: white !important;
    box-shadow: 0 0 20px rgba(255, 140, 0, 0.5) !important;
}

/* 完成状态 */
.nc-workflow-agent-btn[data-state="completed"] {
    background: linear-gradient(135deg, #2ecc71, #27ae60) !important;
    border-color: #2ecc71 !important;
    color: white !important;
    box-shadow: none !important;
}

/* 错误状态 */
.nc-workflow-agent-btn[data-state="error"] {
    background: linear-gradient(135deg, #e74c3c, #c0392b) !important;
    border-color: #e74c3c !important;
    color: white !important;
    box-shadow: 0 0 15px #e74c3c !important;
}

/* 等待依赖 */
.nc-workflow-agent-btn[data-state="pending"] {
    background: rgba(138, 43, 226, 0.2) !important;
    border-color: #8a2be2 !important;
    color: #da70d6 !important;
    box-shadow: 0 0 10px #8a2be2 !important;
}

/* 等待输入 */
.nc-workflow-agent-btn[data-state="waiting_input"] {
    background: rgba(255, 215, 0, 0.2) !important;
    border-color: #ffd700 !important;
    color: #ffd700 !important;
    box-shadow: none !important;
}

/* 回流处理中 */
.nc-workflow-agent-btn[data-state="reflow_processing"] {
    background: linear-gradient(135deg, #ff69b4, #c71585) !important;
    border-color: #ff69b4 !important;
    color: white !important;
}

/* 回流等待 */
.nc-workflow-agent-btn[data-state="reflow_waiting"] {
    background: rgba(255, 99, 71, 0.15) !important;
    border-color: #ff6347 !important;
    color: #ffa07a !important;
}
```

### 5.2 废章按钮特殊状态
当存在废章时，废章按钮会添加 `.has-discard` 类：
```css
.nc-workflow-agent-btn.nc-discard-btn.has-discard {
    background: linear-gradient(135deg, #8b0000, #b22222) !important;
    border-color: #8b0000 !important;
    color: white !important;
}
```

---

## 6. 布局自定义

您可以修改任何影响布局的CSS属性（如 `width`、`height`、`margin`、`padding`、`display`、`flex`、`grid` 等）。但需要注意系统的响应式设计。

### 6.1 示例：调整面板尺寸和卡片间距
```css
.nc-panel {
    width: 90vw;
    max-height: 85vh;
}
.nc-panel-body {
    gap: 20px;
}
.nc-card {
    padding: 20px;
}
```

### 6.2 示例：修改工作流按钮排列方式
```css
.nc-workflow-agents {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 8px;
}
.nc-workflow-agent-btn {
    width: 100%;
}
```

### 6.3 响应式注意事项
系统内置了针对不同屏幕尺寸的媒体查询。如果您修改了布局，请确保同时覆盖或适配这些媒体查询，以免在小屏幕上出现显示问题。例如：

```css
/* 自定义手机端样式 */
@media (max-width: 768px) {
    .nc-panel-body {
        grid-template-columns: 1fr; /* 强制单列 */
    }
    .nc-workflow-agent-btn {
        font-size: 14px;
        padding: 12px;
    }
}
```

---

## 7. 响应式适配深度定制

系统默认的媒体查询断点及主要调整如下：

| 断点 | 主要变化 |
|------|----------|
| ≤ 1400px | 四栏布局变为三栏（最后一栏移至下方） |
| ≤ 1200px | 变为两栏布局 |
| ≤ 1024px | 树形菜单默认折叠，点击头部展开；按钮、条目增大点击区域 |
| ≤ 768px | 面板全屏，内边距减小；某些描述文字隐藏 |
| ≤ 600px | Agent复选框单列，工作流按钮单列 |
| ≤ 400px | 进一步压缩内边距和字号 |

如果您希望完全重写响应式逻辑，可以针对这些断点编写自己的媒体查询覆盖默认规则。例如，让所有设备都保持桌面布局：

```css
@media (max-width: 1200px) {
    .nc-panel-body {
        grid-template-columns: 240px 1fr 1fr 320px !important; /* 强制四栏 */
    }
    .nc-tree-children {
        display: block !important; /* 始终展开 */
    }
}
```

---

## 8. 最佳实践

- **使用浏览器开发者工具**：在Chrome/Firefox中右键点击元素 → “检查”，查看当前应用的样式和内联样式，找到需要覆盖的类名。
- **渐进式覆盖**：从一个简单修改开始（如改变主色），逐步增加，避免一次编写过多规则导致难以调试。
- **保持布局功能正常**：避免修改可能导致功能异常的属性（如 `display: none` 隐藏必要元素）。
- **测试所有状态**：覆盖Agent状态按钮后，执行一次工作流，观察各状态是否显示正确。
- **注释您的CSS**：为每个覆盖块添加注释，方便日后维护。
- **使用CSS变量（可选）**：虽然系统未使用CSS变量，您可以在自定义CSS中定义自己的变量，提高可维护性。例如：
  ```css
  :root {
      --primary: #ff8c00;
      --primary-dark: #ff4500;
      --success: #2ecc71;
      --danger: #e74c3c;
  }
  .nc-btn-primary {
      background: linear-gradient(135deg, var(--primary), var(--primary-dark));
  }
  ```

---

## 9. 高级技巧

### 9.1 动态加载多个CSS文件
系统每次加载新CSS会替换之前的自定义样式。如果您需要组合多个文件，可以先合并为一个文件再加载。

### 9.2 使用 `!important` 的替代方案
如果不想用 `!important`，可以通过提高选择器特异性来覆盖内联样式，例如：
```css
body .nc-workflow-agent-btn[data-state="running"] {
    background: linear-gradient(135deg, #ff8c00, #ff4500); /* 不需要!important？实际上内联样式优先级仍高，仍需!important */
}
```
但由于内联样式的特殊性，目前必须使用 `!important`。这是唯一可靠的方法。

### 9.3 通过油猴脚本持久化自定义样式
如果您希望每次打开页面自动加载某个CSS文件，可以编写一个简单的油猴脚本：
```javascript
// ==UserScript==
// @name         自动加载小说系统配色
// @namespace    http://tampermonkey.net/
// @match        http://127.0.0.1:8000/
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function() {
    'use strict';
    const cssUrl = 'https://your-server.com/your-theme.css';
    GM_xmlhttpRequest({
        method: 'GET',
        url: cssUrl,
        onload: function(res) {
            const style = document.createElement('style');
            style.id = 'nc-custom-styles-persist';
            style.textContent = res.responseText;
            document.head.appendChild(style);
        }
    });
})();
```

### 9.4 调试技巧
- 在自定义CSS中添加一条醒目的规则（如 `body { outline: 2px solid red; }`）以确认文件已加载。
- 使用浏览器控制台查看是否有CSS解析错误。

---

## 10. 常见问题与解答

**Q：为什么我的某些规则没有生效？**  
A：可能原因：
- 选择器特异性不够，或被内联样式覆盖（需加 `!important`）。
- 自定义CSS文件未正确加载（检查网络面板或控制台错误）。
- 规则语法错误（如缺少分号、括号不匹配）。

**Q：修改布局后，手机端显示错乱怎么办？**  
A：您需要针对手机断点编写额外的媒体查询来覆盖默认的响应式规则。或者考虑只修改颜色等不影响布局的属性。

**Q：如何恢复默认样式？**  
A：刷新页面即可清除自定义样式标签。如果需要重新加载另一个CSS，直接点击按钮加载新文件即可。

**Q：能否同时使用多个CSS文件？**  
A：系统每次加载都会替换之前的，因此不能同时加载多个。您可以将多个文件的内容合并为一个。

**Q：是否支持CSS中的 `@import`？**  
A：可以，但需确保 `@import` 规则位于文件顶部，且引用的路径可访问（注意CORS限制）。

**Q：自定义CSS会影响所有用户吗？**  
A：不会，只影响当前浏览器标签页，且刷新后失效。它是本地的、临时的。

---

<!-- 新增内容开始 -->

## 11. 按钮图标自定义示例

通过CSS，您可以完全替换按钮上的图标和文字，实现个性化界面风格。以下是一个完整的示例，将所有主要按钮的图标和文字替换为自定义内容。您可以将此代码保存为 `.css` 文件，并通过 **🎨 加载配色CSS** 按钮加载，无需修改脚本代码。

### 11.1 完整CSS示例

```css
/* ==================== 按钮图标自定义 ==================== */
/* 隐藏所有按钮原始内容，为伪元素留出空间 */
#nc-history-btn,
#nc-export-data-btn,
#nc-start-btn,
#nc-stop-btn,
#nc-close-btn,
#nc-view-requirement,
#nc-clear-input,
.nc-toolbar-btn {
    font-size: 0 !important;           /* 隐藏原文字和图标 */
    position: relative !important;
    padding-left: 32px !important;      /* 为新图标和文字预留水平空间 */
    min-width: 90px !important;         /* 保证所有按钮有足够宽度 */
    text-align: left !important;        /* 文字左对齐，与图标协调 */
}

/* 统一伪元素样式（图标+文字） */
#nc-history-btn::before,
#nc-export-data-btn::before,
#nc-start-btn::before,
#nc-stop-btn::before,
#nc-close-btn::before,
#nc-view-requirement::before,
#nc-clear-input::before,
.nc-toolbar-btn::before {
    content: "";                        /* 具体内容由各按钮单独定义 */
    font-size: 13px !important;          /* 恢复字体大小 */
    position: absolute !important;
    left: 10px !important;
    top: 50% !important;
    transform: translateY(-50%) !important;
    white-space: nowrap !important;
    color: inherit !important;           /* 继承按钮文字颜色 */
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Microsoft YaHei', sans-serif !important;
}

/* ==================== 各按钮单独定义 ==================== */

/* 历史章节按钮 */
#nc-history-btn::before {
    content: "📖 历史章节" !important;
}

/* 数据导出按钮 */
#nc-export-data-btn::before {
    content: "📦 数据导出" !important;
}

/* 启动按钮 */
#nc-start-btn::before {
    content: "🚀 启动" !important;
}

/* 中断按钮 */
#nc-stop-btn::before {
    content: "⏸️ 中断" !important;
}

/* 关闭按钮 */
#nc-close-btn::before {
    content: "❌ 关闭" !important;
}

/* 查看要求按钮 */
#nc-view-requirement::before {
    content: "📋 要求" !important;
}

/* 清空输入按钮 */
#nc-clear-input::before {
    content: "🗑️ 清空" !important;
}

/* 工具栏按钮（查看章节内容/状态） */
.nc-toolbar-btn::before {
    content: "🔍 查看" !important;       /* 可根据需要分别定制，这里统一处理 */
}

/* 如需为不同工具栏按钮设置不同图标，可使用更精确的选择器 */
#nc-view-chapter-content::before {
    content: "📄 文章" !important;
}
#nc-view-chapter-status::before {
    content: "📊 状态" !important;
}
```

### 11.2 使用说明

1. 将上述代码保存为一个 `.css` 文件（例如 `my-icons.css`）。
2. 打开小说创作系统主面板。
3. 点击底部 **🎨 加载配色CSS** 按钮。
4. 选择该文件，图标和文字将立即更新为您在 `content` 中定义的内容。

### 11.3 自定义方法

- **修改图标**：直接更改伪元素 `content` 中的 emoji 或文字，例如将 `📖` 改为 `📘`。
- **调整间距**：修改 `padding-left` 的值以适应更宽的图标。
- **单独修改某个按钮**：仅需更改对应按钮的选择器中的 `content`，不影响其他按钮。
- **使用字体图标**：如果您已加载了字体图标库（如 Font Awesome），可以将 `content` 改为对应的 Unicode 字符，并设置 `font-family`。例如：
  ```css
  #nc-history-btn::before {
      font-family: "Font Awesome 5 Free";
      font-weight: 900;
      content: "\f0c7";
  }
  ```
  但需确保页面已加载该字体库。

### 11.4 注意事项

- 加载此CSS后，按钮原始文字将被完全隐藏，只显示伪元素中的内容。如需修改文字，直接编辑 `content` 即可。
- 部分按钮（如启动、中断）在运行时会有状态变化，但伪元素内容不会动态变化，因此您可能不希望替换这些按钮的文字（如“启动”变为“▶️ 启动”是可行的）。若需保留原有文字功能，请仅修改图标而不隐藏文字，但这需要更复杂的CSS技巧。本方案以简洁为原则。
- 如果按钮宽度不足导致文字换行，请适当调整 `min-width` 或 `padding` 值。

<!-- 新增内容结束 -->

---

## 12. 结语

通过本指南，您应该能够自由地定制自动化小说创作系统的外观，从简单的颜色调整到复杂的布局重构。请始终以用户体验为核心，确保修改后的界面清晰易用。如果您遇到任何问题，欢迎在社区交流。

Happy Theming! 🎨