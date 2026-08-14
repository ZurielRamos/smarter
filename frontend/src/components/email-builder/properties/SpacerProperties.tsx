import { inputCls, labelCls } from "./shared";

interface Props {
  props: Record<string, any>;
  onChange: (props: Record<string, any>) => void;
}

export function SpacerProperties({ props: p, onChange }: Props) {
  const update = (key: string, value: any) => onChange({ ...p, [key]: value });

  return (
    <div className="space-y-3">
      <div>
        <label className={labelCls}>Altura</label>
        <input type="text" value={p.height} onChange={(e) => update("height", e.target.value)} className={inputCls} />
      </div>
    </div>
  );
}
