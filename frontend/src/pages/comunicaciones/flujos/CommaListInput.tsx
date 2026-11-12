import { useEffect, useState } from "react";

interface Props {
  value: string[];
  onChange: (value: string[]) => void;
  max: number;
  maxLength: number;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
  id?: string;
}

/**
 * Lista de palabras separadas por comas. Se edita como texto libre y se guarda
 * al salir del campo (o con Enter), para poder escribir la coma sin que se pierda.
 */
export function CommaListInput({ value, onChange, max, maxLength, placeholder, className, id, ...rest }: Props) {
  const joined = value.join(", ");
  const [text, setText] = useState(joined);
  useEffect(() => setText(joined), [joined]);
  const commit = () => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const raw of text.split(",")) {
      const v = raw.trim().slice(0, maxLength);
      const key = v.toLowerCase();
      if (!v || seen.has(key)) continue;
      seen.add(key);
      list.push(v);
      if (list.length >= max) break;
    }
    onChange(list);
    setText(list.join(", "));
  };
  return (
    <input
      id={id}
      aria-label={rest["aria-label"]}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      placeholder={placeholder}
      className={className}
    />
  );
}
