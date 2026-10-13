import { useRef } from 'react';

/**
 * @param {Omit<import('react').InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'min' | 'max' | 'step'> & {
 *   id: string, outputId: string, label: string, value: number,
 *   min: number, max: number, step: number, output: import('react').ReactNode,
 *   onChange: (value: number) => void, onCommit?: (value: number) => void,
 *   ends?: string[]
 * }} props
 */
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
        style={/** @type {import('react').CSSProperties} */ ({ '--pct': `${((value - min) / (max - min)) * 100}%` })}
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
