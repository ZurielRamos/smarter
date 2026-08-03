import { useParams, useNavigate } from "react-router-dom";
import { InboxSettingsContent } from "@/components/InboxSettingsContent";

export function CanalDetail() {
  const { slug, inboxId } = useParams();
  const navigate = useNavigate();

  if (!inboxId) return null;

  return (
    <InboxSettingsContent
      inboxId={inboxId}
      onDeleted={() => navigate(`/${slug}/comunicaciones/canales`, { replace: true })}
    />
  );
}
