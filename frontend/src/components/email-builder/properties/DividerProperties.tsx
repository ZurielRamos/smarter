import { inputCls, labelCls, ColorPicker } from "./shared";

interface Props {
  props: Record<string, any>;
  onChange: (props: Record<string, any>) => void;
}

export function DividerProperties({ props: p, onChange }: Props) {
  const update = (key: string, value: any) => onChange({ ...p, [key]: value });

  return (
    <div className="space-y-3">
      <div>
        <label className={labelCls}>Color</label>
        <ColorPicker value={p.color} onChange={(v) => update("color", v)} fullWidth />
      </div>
      <div>
        <label className={labelCls}>Grosor</label>
        <input type="text" value={p.thickness} onChange={(e) => update("thickness", e.target.value)} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Margen</label>
        <input type="text" value={p.margin} onChange={(e) => update("margin", e.target.value)} className={inputCls} />
      </div>
    </div>
  );
}
