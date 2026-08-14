import { inputCls, labelCls } from "./shared";

interface Props {
  props: Record<string, any>;
  onChange: (props: Record<string, any>) => void;
}

export function HtmlProperties({ props: p, onChange }: Props) {
  const update = (key: string, value: any) => onChange({ ...p, [key]: value });

  return (
    <div className="space-y-3">
      <div>
        <label className={labelCls}>Codigo HTML</label>
        <textarea value={p.code} onChange={(e) => update("code", e.target.value)} rows={8} className={inputCls + " font-mono resize-y"} />
      </div>
    </div>
  );
}
