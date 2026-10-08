import { useEffect, useRef } from 'react';
import Icon from './Icons.jsx';

export default function ModelDialog({ open, onClose }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function closeOnBackdrop(event) {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      id="aboutDialog"
      aria-labelledby="aboutTitle"
      onCancel={event => { event.preventDefault(); onClose(); }}
      onClose={onClose}
      onClick={closeOnBackdrop}
    >
      <div className="dialog-top">
        <span className="eyebrow">BEHIND THE SHAPES</span>
        <button type="button" className="icon-button" id="closeAbout" aria-label="关闭模型说明" onClick={onClose}><Icon name="close" /></button>
      </div>
      <h2 id="aboutTitle">形状，如何随场演化？</h2>
      <p className="dialog-lead">局部速度场施加变形，先验提供回复倾向。两者共同决定边界的运动。</p>
      <div className="model-block">
        <span className="model-index">01</span>
        <div>
          <h3>圆盘 · 表面张力</h3>
          <p>以曲率流平滑边界，并通过每步面积校正保持初始面积。无外力时，边界趋向等面积圆盘；单独表面张力并不能保证面积。</p>
          <div className="formula">E = γ · Length(∂Ω) &nbsp; subject to &nbsp; Area(Ω) = A₀</div>
        </div>
      </div>
      <div className="model-block">
        <span className="model-index">02</span>
        <div>
          <h3>手绘 · KL 形状先验</h3>
          <p>将对应边界点建模为相同方差的高斯分布，参考点固定为初始轮廓。此 KL 先验鼓励恢复原始形状与位置，强度为零时关闭回复力。</p>
          <div className="formula">pᵢ = N(qᵢ, σ²I), &nbsp; pᵢ⁰ = N(qᵢ⁰, σ²I)<br />D<sub>KL</sub> = Σᵢ ‖qᵢ − qᵢ⁰‖² / (2Nσ²)</div>
          <p className="fine-print">这里采用边界对应点的高斯 KL，并非二值区域之间的 KL。KL 是软先验，不是形状不变的硬约束。</p>
        </div>
      </div>
      <div className="model-block">
        <span className="model-index">03</span>
        <div>
          <h3>箭头 · 局部速度场</h3>
          <p>拖动设定方向与作用中心，粗细表示速度强度，虚线圆表示影响尺度。多个高斯场相加，距中心越远，作用越弱。叠加后进行平滑限速，以避免极端速度。场箭头分辨率只改变显示采样密度，边界运动仍直接计算解析速度场。</p>
          <div className="formula">v_raw(x) = Σⱼ sⱼ uⱼ exp(−‖x − cⱼ‖² / 2rⱼ²)</div>
        </div>
      </div>
      <div className="model-footnote">
        <Icon name="info" />
        <p>这是二维数值教学模型，并未实现神经网络反向传播。采用边界积分与离散相交保护，不能作为全局微分同胚的数学证明。H₀ 描述连通性；这里以 β₀ 记录连通区域的个数。画笔仅接受互不相交、无孔的简单闭合轮廓。</p>
      </div>
      <button type="button" id="aboutDone" className="primary-button" onClick={onClose}>开始探索 <Icon name="arrow" /></button>
    </dialog>
  );
}
