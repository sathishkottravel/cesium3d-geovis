import { useState } from "react";

/** Secret text field: hidden like a password, with a show/hide toggle. */
export function SecretInput(props: {
  id: string;
  value: string;
  placeholder?: string;
  onChange(value: string): void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="secret-input">
      <input
        id={props.id}
        type={visible ? "text" : "password"}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
      <button type="button" onClick={() => setVisible((v) => !v)} aria-pressed={visible}>
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
}
