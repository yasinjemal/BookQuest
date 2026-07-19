"use client";

import { useState } from "react";

export default function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  hint,
  required = true,
  minLength,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  hint?: string;
  required?: boolean;
  minLength?: number;
}) {
  const [visible, setVisible] = useState(false);
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div>
      <label htmlFor={id} className="field-label">{label}</label>
      <span className="relative mt-2 block">
        <input
          id={id}
          name={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
          aria-describedby={hintId}
          className="field pr-20"
        />
        <button type="button" onClick={() => setVisible((current) => !current)} className="absolute inset-y-1 right-1 min-w-16 rounded-lg px-3 text-xs font-bold text-primary-deep hover:bg-paper" aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}>
          {visible ? "Hide" : "Show"}
        </button>
      </span>
      {hint && <span id={hintId} className="field-hint">{hint}</span>}
    </div>
  );
}
