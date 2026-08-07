import React, { useEffect, useRef, useState } from 'react';

type NumberInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & {
  value: number;
  onValueChange: (value: number) => void;
};

export const NumberInput: React.FC<NumberInputProps> = ({ value, onValueChange, onBlur, onFocus, min, max, step, ...props }) => {
  const [draft, setDraft] = useState(String(value));
  const editing = useRef(false);
  const allowsDecimal = step === 'any' || (step !== undefined && String(step).includes('.'));
  const allowsNegative = min === undefined || Number(min) < 0;
  const validDraft = allowsDecimal
    ? allowsNegative ? /^-?\d*(?:\.\d*)?$/ : /^\d*(?:\.\d*)?$/
    : allowsNegative ? /^-?\d*$/ : /^\d*$/;

  useEffect(() => {
    if (!editing.current) setDraft(String(value));
  }, [value]);

  return <input
    {...props}
    type="text"
    inputMode={allowsDecimal ? 'decimal' : 'numeric'}
    min={min}
    max={max}
    step={step}
    value={draft}
    onFocus={event => {
      editing.current = true;
      onFocus?.(event);
    }}
    onChange={event => {
      const next = event.target.value.replace(',', '.');
      if (!validDraft.test(next)) return;
      setDraft(next);
      if (!next || next === '-' || next === '.' || next === '-.' || next.endsWith('.')) return;
      const parsed = Number(next);
      if (Number.isFinite(parsed)) onValueChange(parsed);
    }}
    onBlur={event => {
      editing.current = false;
      if (!draft || draft === '-' || draft === '.' || draft === '-.' || draft.endsWith('.') || !Number.isFinite(Number(draft))) {
        setDraft(String(value));
      }
      onBlur?.(event);
    }}
  />;
};
