# 形 · 流 / Manifold

基于 **React + Vite** 的二维边界演化实验。绘制闭合形状，叠加局部速度场，观察表面张力与 KL 形状先验如何影响边界。

## 运行

使用 Node.js 24 LTS（CI 固定版本见 `.node-version`）和 npm 11：

```sh
npm ci
npm run dev
```

访问终端显示的本地地址。

```sh
npm run build    # 生成 dist/ 静态网页
npm run preview  # 预览构建结果
```

界面延续 [Web Apps](https://github.com/ThaneJoss/webapps) 的灰白底、蓝色强调、字体与焦点样式；画布中的绿 / 蓝 / 橙仍分别表示表面张力、KL 先验和局部速度场。

## 操作

- **画笔（B）**：拖动绘制闭合轮廓，松手后保存为 KL 参考形状。
- **箭头（V）**：拖动添加局部速度场；选中后调整强度和作用半径，拖动箭头移动位置，拖动端点改变方向。
- **垃圾桶**：恢复默认圆盘、参数和分辨率。
- **空格**：暂停或继续；关闭“外力”观察先验回复，开启“初始轮廓”对比形变。
- **Delete / Backspace**：删除选中的速度场；**Esc**：取消当前操作。
- **减少动态效果**：遵循系统偏好，首次打开和重置后保持暂停，可手动点击“继续”。
- 控件支持键盘焦点及原生滑杆方向键；自由绘制和箭头拖动仍需要鼠标、触控或指针设备。自动无障碍检查不代表画布操作已完整支持屏幕阅读器。

| 分辨率 | 范围 / 默认 | 作用 |
| --- | --- | --- |
| 画笔轮廓 | 60–480 点 / 120 点 | 控制新绘制边界的采样点数；已有手绘形状不变。 |
| 初始圆盘 | 60–480 点 / 120 点 | 点击左侧点数设置；重新采样当前圆盘并保持面积。 |
| 场箭头 | 12–60 格 / 24 格 | 调整速度场显示密度；解析速度场和强度不变。 |

## 模型

- **圆盘**：半隐式曲率流与逐步面积校正，趋向等面积圆盘。
- **手绘形状**：对应边界点采用同方差高斯分布，KL 回复先验为 `Σᵢ ‖qᵢ − qᵢ⁰‖² / (2Nσ²)`。这是形状和位置的软先验，并非二值区域分布的 KL。
- **速度场**：多个局部高斯方向场叠加并平滑限速。边界运动直接计算解析场值。
- **连通性**：以 `β₀` 记录连通区域数；防自交和区域碰撞属于仿真功能。离散模型不构成全局微分同胚的数学证明，也不包含神经网络反向传播。

## 结构

| 路径 | 职责 |
| --- | --- |
| `src/App.jsx` | React 页面与控制面板 |
| `src/components/` | 复用的界面组件 |
| `src/useShapeFlow.js` | React 状态、交互和动画生命周期 |
| `src/renderScene.js` | Canvas 绘制 |
| `src/physics.js` | 边界、先验、速度场和数值演化 |
| `src/styles.css` | 响应式样式 |
| `vite.config.js` | Vite 构建配置 |
| `src/physics.test.js` | 无外部服务的物理核心回归测试 |
| `tests/e2e/` | 桌面和手机 Chromium 交互与 axe 检查 |
| `.github/workflows/ci.yml` | PR 和 main 分支质量检查 |

构建产物 `dist/` 不纳入源码提交，可部署到静态网页托管服务。

## 检查与 CI

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

浏览器检查使用已构建的 `dist/`，自动启动本地预览服务。Linux 环境首次运行若缺少系统库，使用 `npx playwright install --with-deps chromium`。

每次 PR（含 draft）及 `main` push 均执行上述 lint、类型检查、物理单元测试、构建和桌面 / 手机浏览器检查。浏览器报告、失败截图与 trace 保留 7 天；不依赖凭据，不运行部署、线上写入或外部付费服务。

类型门禁通过 TypeScript 的 `checkJs` 检查现有 JavaScript / JSX、配置和测试，保留 JavaScript 项目结构；当前未启用严格空值和隐式 any 检查。控件参数及核心几何类型使用 JSDoc，复杂交互仍由浏览器测试覆盖。TypeScript 暂用 6.x，以兼容 ESLint React 插件的编译器 API；依赖按锁文件安装，升级时一起提交 `package.json` 和 `package-lock.json`。

单元测试覆盖碰撞保护、非法轮廓拒绝、分辨率变更与回滚、面积守恒及 KL 回复。浏览器测试覆盖分辨率键盘提交、场的增删、模型对话框焦点、减少动态效果、320px 窄屏开关和 axe 扫描。CI 不含 GPU、数据集下载或长时数值实验；没有全局微分同胚证明或长期稳定性保证。
