import { useRef } from 'react';

export default function RangeControl({
  id, outputId, label, value, min, max, step, output,
  onChange, onCommit, className = '', ends, ...inputProps
}) {
  const pendingCommit = useRef(false);

  function commit(event) {
    if (!pendingCommit.current) return;
    pendingCommit.current = false;
    onCommit?.(Number(event.currentTarget.value));
  }

  return (
    <>
      <div className={`range-label ${className}`.trim()}>
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id} id={outputId}>{output}</output>
      </div>
      <input
        {...inputProps}
        type="range"
        id={id}
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--pct': `${((value - min) / (max - min)) * 100}%` }}
        onChange={event => {
          pendingCommit.current = Boolean(onCommit);
          onChange(Number(event.currentTarget.value));
        }}
        onPointerUp={commit}
        onPointerCancel={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
      {ends && <div className="range-ends"><span>{ends[0]}</span><span>{ends[1]}</span></div>}
    </>
  );
}
