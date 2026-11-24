import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building2 } from "lucide-react";
import { CONTACT_ROLE_LABELS, companiesApi, type ContactCompany } from "@/services/companies";
import { TypeBadge } from "./shared";

interface Props {
  slug: string;
  tenantId: string;
  recordId: string;
}

/**
 * Empresas a las que está vinculado un contacto, para la ficha del contacto.
 * Solo lectura: los vínculos se gestionan desde la ficha de la empresa. Si no
 * hay ninguna, no ocupa espacio.
 */
export function ContactCompanies({ slug, tenantId, recordId }: Props) {
  const [items, setItems] = useState<ContactCompany[]>([]);

  useEffect(() => {
    let alive = true;
    companiesApi
      .byContact(tenantId, recordId)
      .then((data) => alive && setItems(data))
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, [tenantId, recordId]);

  if (items.length === 0) return null;

  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Building2 className="h-4 w-4 text-muted-foreground" /> Empresas
      </h3>
      <ul className="divide-y divide-border">
        {items.map((c) => (
          <li key={c.linkId} className="flex items-center justify-between gap-3 py-2">
            <Link to={`/${slug}/empresas/${c.id}`} className="min-w-0">
              <span className="block truncate text-sm font-medium text-foreground hover:underline">{c.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {[CONTACT_ROLE_LABELS[c.role], c.city].filter(Boolean).join(" · ")}
              </span>
            </Link>
            <TypeBadge type={c.type} />
          </li>
        ))}
      </ul>
    </div>
  );
}
