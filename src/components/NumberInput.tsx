import React, { useEffect, useState } from 'react';

type NumberInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & {
  value: number;
  onValueChange: (value: number) => void;
};

export const NumberInput: React.FC<NumberInputProps> = ({ value, onValueChange, onBlur, ...props }) => {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  return <input
    {...props}
    type="number"
    value={draft}
    onChange={event => {
      const next = event.target.value;
      setDraft(next);
      if (next.trim() === '') return;
      const parsed = Number(next);
      if (Number.isFinite(parsed)) onValueChange(parsed);
    }}
    onBlur={event => {
      if (draft.trim() === '' || !Number.isFinite(Number(draft))) setDraft(String(value));
      onBlur?.(event);
    }}
  />;
};
