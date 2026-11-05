import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Loader2, GraduationCap, Lock } from "lucide-react";
import { getPublicCourse } from "@/services/cursos";
import { CourseRunner } from "./CourseRunner";

/**
 * Página standalone de un curso (/c/:slug?t=token). El acceso normal es a
 * través del portal del tenant (/academy/:tenantSlug), que entrega el token de
 * inscripción. Aquí solo:
 *  - con token válido: renderiza el runner del curso.
 *  - sin token: redirige al portal del tenant.
 */
export function PublicCourse() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const token = params.get("t") || "";

  const [state, setState] = useState<"loading" | "ready" | "no-token" | "error">("loading");
  const [tenantSlug, setTenantSlug] = useState<string | null>(null);
  const [courseName, setCourseName] = useState("");
  const [primary, setPrimary] = useState("#0f766e");

  useEffect(() => {
    if (!slug) return;
    // Resolvemos el curso (sin token) para saber el tenant y poder redirigir.
    getPublicCourse(slug, token)
      .then((d: any) => {
        setTenantSlug(d.course.tenantSlug);
        setCourseName(d.course.name);
        setPrimary(d.course.theme?.primary || "#0f766e");
        setState(token && d.enrollment ? "ready" : "no-token");
      })
      .catch(() => setState("error"));
  }, [slug, token]);

  if (state === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (state === "error") {
    return (
      <Centered>
        <GraduationCap className="h-8 w-8 text-slate-300 mx-auto mb-2" />
        <h1 className="text-lg font-semibold text-slate-800">Curso no disponible</h1>
        <p className="text-sm text-slate-500 mt-1">El enlace no es válido o el curso no está activo.</p>
      </Centered>
    );
  }

  if (state === "no-token") {
    return (
      <Centered>
        <Lock className="h-8 w-8 text-slate-300 mx-auto mb-2" />
        <h1 className="text-lg font-semibold text-slate-800">{courseName}</h1>
        <p className="text-sm text-slate-500 mt-1 mb-4 max-w-sm mx-auto">
          Para acceder a este curso, entra al portal de formación.
        </p>
        {tenantSlug && (
          <a
            href={`/academy/${tenantSlug}`}
            style={{ backgroundColor: primary }}
            className="inline-flex items-center justify-center px-4 py-2 rounded-xl text-white text-sm font-semibold"
          >
            Ir al portal
          </a>
        )}
      </Centered>
    );
  }

  return <CourseRunner slug={slug!} accessToken={token} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6 text-center">
      <div>{children}</div>
    </div>
  );
}
