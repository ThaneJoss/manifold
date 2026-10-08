import { useShapeFlow } from './useShapeFlow.js';
import Icon from './components/Icons.jsx';
import ModelDialog from './components/ModelDialog.jsx';
import RangeControl from './components/RangeControl.jsx';

const resolutionPresets = [
  { value: 60, label: '流畅' },
  { value: 120, label: '标准' },
  { value: 240, label: '精细' },
  { value: 480, label: '极细' },
];

function PanelTitle({ color, children, closeId, closeLabel, onClose }) {
  return <div className="panel-title"><span><i className={color} />{children}</span><button type="button" id={closeId} className="icon-button" aria-label={closeLabel} onClick={onClose}><Icon name="close" /></button></div>;
}

export default function App() {
  const {
    canvasRef, workspaceRef, canvasProps, mode, playing, panel, selectedShape,
    selectedField, priorStrength, drawResolution, surfaceResolution, fieldResolution,
    newFieldStrength, newFieldRadius, referenceVisible, fieldsEnabled, flowVisible,
    metrics, time, status, toast, aboutOpen, cursor, actions,
  } = useShapeFlow();

  const isSurface = !selectedShape || selectedShape.kind === 'surface';
  const shapeMetrics = metrics?.shapes.find(shape => shape.id === selectedShape?.id);
  const fieldCount = metrics?.fieldCount ?? 0;
  const strength = selectedField?.strength ?? newFieldStrength;
  const radius = selectedField?.radius ?? newFieldRadius;

  return (
    <>
      <header className="app-header">
        <a className="brand" href="./" aria-label="形流实验室首页">
          <span className="brand-mark"><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M7 23C0 15 8 3 18 6s13 10 6 18S11 32 7 23Z" stroke="currentColor" strokeWidth="1.6" /><path d="M10 20C6 14 12 7 19 11s8 9 2 12-9 2-11-3Z" stroke="currentColor" strokeWidth="1.2" /></svg></span>
          <span>形<span className="brand-dot">·</span>流</span><span className="brand-separator" /><span className="brand-caption">SHAPE &amp; FLOW</span>
        </a>
        <div className="header-right"><span className="lab-label"><span /> 交互实验室 / 001</span><button type="button" className="text-button" id="aboutButton" onClick={actions.openAbout}><Icon name="info" />模型说明</button></div>
      </header>
      <main>
        <section className="intro">
          <div><div className="eyebrow">GEOMETRY IN MOTION</div><h1>让形状，随场而动<span>。</span></h1><p>绘制一个连通域，用局部速度场探索形变与先验之间的平衡。</p></div>
          <div className="intro-note"><span className="mini-diagram"><i /><Icon name="arrow" /><i /></span><span>自由变形<br /><b>保留形状的来处</b></span></div>
        </section>
        <section ref={workspaceRef} className={`workspace${mode === 'brush' ? ' brush-mode' : ''}${playing ? '' : ' paused'}`} aria-label="二维形状交互实验">
          <canvas ref={canvasRef} id="scene" style={{ cursor }} {...canvasProps} aria-label="形状画布。选择画笔拖动绘制闭合轮廓，选择箭头拖动添加局部速度场。">请使用支持 Canvas 的现代浏览器。</canvas>
          <div className="canvas-top">
            <div className="workspace-title"><span className="status-dot" /><span>二维实验场</span><span className="canvas-dimension">2D</span></div>
            <div className="legend"><span><i className="green" />表面张力</span><span><i className="blue" />KL 形状先验</span><span><i className="orange" />局部速度场</span></div>
          </div>
          <aside className="inspector" aria-label="形状与先验设置">
            <div className="inspector-caption">
              <span>当前观察对象</span>
              <button type="button" className="sample-count resolution-button" id="shapeResolution" aria-label={isSurface ? '调整初始形状分辨率' : '手绘轮廓采样点数'} aria-controls="surfacePanel" aria-expanded={panel === 'surface'} disabled={!isSurface} title={isSurface ? '点击调整初始圆盘分辨率' : '此手绘轮廓的实际采样点数；新轮廓在画笔设置中调整'} onClick={actions.toggleSurfacePanel}>{selectedShape?.pointCount ?? surfaceResolution} 点</button>
            </div>
            <div className="shape-title">
              <span className="shape-swatch" id="shapeSwatch" style={{ background: isSurface ? '#ccdebf' : '#d6e5f0', borderColor: isSurface ? '#719664' : '#7c9dbf' }} />
              <h2 id="shapeName">{isSurface ? '初始圆盘' : '手绘形状'}</h2><span className="shape-id" id="shapeId">{String((selectedShape?.index ?? 0) + 1).padStart(2, '0')}</span>
            </div>
            <div className="prior-badge" id="priorBadge" style={{ color: isSurface ? '#769067' : '#789ab5', background: isSurface ? '#eaf0e3' : '#eaf1f6' }}>{isSurface ? '表面张力 + 面积约束' : 'KL 散度 · 初始形状先验'}</div>
            <p className="prior-description" id="priorDescription">{isSurface ? '边界趋向平滑，在固定面积下回到圆形。' : '以初始边界为参考，抑制形变与位置偏移。'}</p>
            <div className="metric-pair">
              <div><label id="metricOneLabel">{isSurface ? '圆度' : 'KL 散度'}</label><strong id="metricOne">{(isSurface ? (shapeMetrics?.roundness ?? 1) : (shapeMetrics?.kl ?? 0)).toFixed(3)}</strong></div>
              <div><label id="metricTwoLabel">面积 / 初始</label><strong id="metricTwo">{((shapeMetrics?.areaRatio ?? 1) * 100).toFixed(1)}<span>%</span></strong></div>
            </div>
            <div className="inspector-divider" />
            <RangeControl id="priorStrength" outputId="priorOutput" label="全局先验强度" min={0} max={2} step={0.05} value={priorStrength} output={`${priorStrength.toFixed(1)}×`} onChange={actions.setPriorStrength} ends={['自由流动', '更强保持']} />
            <label className="switch-row"><span><Icon name="eye" />初始轮廓</span><input type="checkbox" id="referenceToggle" checked={referenceVisible} onChange={event => actions.setReferenceVisible(event.currentTarget.checked)} /><span className="switch" aria-hidden="true" /></label>
          </aside>
          <aside id="surfacePanel" className="field-panel surface-panel" aria-label="初始形状分辨率设置" hidden={panel !== 'surface'}>
            <PanelTitle color="green" closeId="closeSurfacePanel" closeLabel="收起初始形状设置" onClose={actions.closePanel}><b>初始形状分辨率</b></PanelTitle>
            <RangeControl id="surfaceResolution" outputId="surfaceResolutionOutput" label="圆盘边界采样" className="resolution-label" min={60} max={480} step={30} value={surfaceResolution} output={`${surfaceResolution} 点`} onChange={actions.setSurfaceResolution} onCommit={actions.applySurfaceResolution} ends={['流畅 · 60', '精细 · 480']} aria-describedby="surfaceResolutionHelp" aria-valuetext={`${surfaceResolution} 个边界采样点`} />
            <p className="resolution-help" id="surfaceResolutionHelp">松开滑杆，按当前形状重新采样圆盘边界并保持面积。点数越多，计算量越大。</p>
            <div className="resolution-scope">不清空已绘制形状和速度场</div>
          </aside>
          <div className="tool-dock" role="toolbar" aria-label="绘图工具">
            <button type="button" id="brushTool" className={`tool${mode === 'brush' ? ' active' : ''}`} aria-label="画笔：绘制连通域并调整分辨率" aria-pressed={mode === 'brush'} aria-controls="brushPanel" aria-expanded={panel === 'brush'} title="画笔与分辨率 · B" onClick={actions.toggleBrush}><Icon name="pen" /><span className="tool-label">画笔</span><kbd>B</kbd></button>
            <button type="button" id="arrowTool" className={`tool${mode === 'arrow' ? ' active' : ''}`} aria-label="箭头：添加速度场并调整强度" aria-pressed={mode === 'arrow'} aria-controls="fieldPanel" aria-expanded={panel === 'field'} title="速度场 · V" onClick={actions.toggleArrow}><Icon name="arrow" /><span className="tool-label">箭头</span><kbd>V</kbd></button>
            <span className="dock-divider" />
            <button type="button" id="resetButton" className="tool reset-tool" aria-label="垃圾桶：清空并恢复默认圆盘" title="清空并恢复默认场景" onClick={actions.reset}><Icon name="trash" /><span className="tool-label">重置</span></button>
          </div>
          <aside id="brushPanel" className="field-panel brush-panel" aria-label="画笔分辨率设置" hidden={panel !== 'brush'}>
            <PanelTitle color="blue" closeId="closeBrushPanel" closeLabel="收起画笔设置" onClose={actions.closePanel}><b>画笔设置</b></PanelTitle>
            <RangeControl id="drawResolution" outputId="resolutionOutput" label="轮廓分辨率" className="resolution-label" min={60} max={480} step={30} value={drawResolution} output={`${drawResolution} 点`} onChange={actions.setDrawResolution} ends={['流畅 · 60', '精细 · 480']} aria-describedby="resolutionHelp" aria-valuetext={`${drawResolution} 个边界采样点`} />
            <div className="resolution-presets" role="group" aria-label="分辨率预设">
              {resolutionPresets.map(preset => <button type="button" key={preset.value} data-resolution={preset.value} className={drawResolution === preset.value ? 'active' : ''} aria-pressed={drawResolution === preset.value} onClick={() => actions.setDrawResolution(preset.value)}>{preset.value}<span>{preset.label}</span></button>)}
            </div>
            <p className="resolution-help" id="resolutionHelp">增加边界点并减少平滑，保留更细的凹凸与转角。高分辨率会增加计算量。</p>
            <div className="resolution-scope">仅用于之后新绘制的轮廓</div>
          </aside>
          <aside id="fieldPanel" className="field-panel" aria-label="局部速度场设置" hidden={panel !== 'field'}>
            <PanelTitle color="orange" closeId="closeFieldPanel" closeLabel="收起速度场设置" onClose={actions.closePanel}><b id="fieldPanelTitle">{selectedField ? `速度场 ${String(selectedField.index + 1).padStart(2, '0')}` : '新建速度场'}</b></PanelTitle>
            <div className="arrow-preview"><svg viewBox="0 0 180 34" aria-hidden="true"><path id="strengthPreview" d="M15 17h145m-12-10 12 10-12 10" fill="none" stroke="currentColor" strokeWidth={1.5 + strength * 2} strokeLinecap="round" strokeLinejoin="round" /></svg></div>
            <RangeControl id="fieldStrength" outputId="strengthOutput" label="强度 · 箭头粗细" min={0.2} max={3} step={0.1} value={strength} output={`${strength.toFixed(1)}×`} onChange={actions.setFieldStrength} ends={['柔和', '强劲']} />
            <RangeControl id="fieldRadius" outputId="radiusOutput" label="影响半径" className="radius-label" min={60} max={220} step={5} value={radius} output={radius} onChange={actions.setFieldRadius} />
            <RangeControl id="fieldResolution" outputId="fieldResolutionOutput" label="场箭头分辨率" className="radius-label" min={12} max={60} step={6} value={fieldResolution} output={`${fieldResolution} 格`} onChange={actions.setFieldResolution} ends={['稀疏 · 12', '密集 · 60']} aria-describedby="fieldResolutionHelp" aria-valuetext={`画布短边 ${fieldResolution} 格`} />
            <p className="field-resolution-help" id="fieldResolutionHelp">按画布短边采样，实时调整全部场箭头的显示密度。解析速度场与强度不变。</p>
            <p className="field-panel-hint" id="fieldHint">{selectedField ? '拖动箭头移动位置；拖动端点调整方向。' : '在画布上拖动，设定位置与方向。'}</p>
            <button type="button" id="removeField" className="remove-field" hidden={!selectedField} onClick={actions.removeSelectedField}>移除此速度场</button>
          </aside>
          <div className="canvas-hint" id="canvasHint" hidden={mode === 'arrow' && fieldCount > 0}>
            <Icon name={mode === 'brush' ? 'pen' : 'arrow'} /><span>{mode === 'brush' ? `绘制闭合轮廓 · ${drawResolution} 个边界点 · 松手保存为 KL 参考` : '从圆盘边缘向外拖动，试试第一股流'}</span><span className="hint-shortcut">拖动绘制</span>
          </div>
          <div className="canvas-bottom">
            <span className="axis-note">x / y<span>二维欧氏空间</span></span>
            <div className="playback-controls">
              <button type="button" id="playButton" className="play-button" aria-label={playing ? '暂停演化' : '继续演化'} title="暂停 / 继续 · 空格" onClick={actions.togglePlaying}><Icon name={playing ? 'pause' : 'play'} /><span id="playLabel">{playing ? '暂停' : '继续'}</span></button>
              <span className="control-divider" />
              <label className="force-control"><input type="checkbox" id="forceToggle" checked={fieldsEnabled} onChange={event => actions.setFieldsEnabled(event.currentTarget.checked)} /><span className="small-switch" aria-hidden="true" />外力</label>
              <label className="force-control grid-control"><input type="checkbox" id="flowToggle" checked={flowVisible} onChange={event => actions.setFlowVisible(event.currentTarget.checked)} /><span className="small-switch" aria-hidden="true" />场线</label>
              <span className="control-divider" /><span className="time-display">t <output id="timeDisplay">{time.toFixed(1)}</output><small>s</small></span>
            </div>
            <span className="zoom-note">空间尺度 <b>1 : 1</b></span>
          </div>
          <div id="toast" className={toast ? 'visible' : ''} role="status" aria-live="polite">{toast}</div>
        </section>
        <footer className="experiment-footer">
          <div className="live-stats"><span><i className="status-dot" /><b id="simulationStatus">{status}</b></span><span>连通分量 <b>β₀ = <span id="componentCount">{metrics?.shapeCount ?? 1}</span></b></span><span>速度场 <b id="fieldCount">{fieldCount}</b></span></div>
          <span className="footer-note" id="footerNote">{metrics?.lastBlocked ? '已减小步长，保护边界不相交' : <>光滑局部场驱动 <i>·</i> 离散自交保护</>}</span>
        </footer>
      </main>
      <ModelDialog open={aboutOpen} onClose={actions.closeAbout} />
    </>
  );
}
