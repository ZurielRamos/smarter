import { useEffect, useState } from "react";
import { Loader2, Trophy, Medal, Award } from "lucide-react";
import { getCursoLeaderboard, getCursoAnalytics, type Leaderboard, type CourseAnalytics } from "@/services/cursos";

function fmtTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

const RANK_ICON = [Trophy, Medal, Award];
const RANK_COLOR = ["text-yellow-500", "text-gray-400", "text-amber-700"];

export function RankingTab({ courseId }: { courseId: string }) {
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [analytics, setAnalytics] = useState<CourseAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getCursoLeaderboard(courseId), getCursoAnalytics(courseId)])
      .then(([b, a]) => {
        setBoard(b);
        setAnalytics(a);
      })
      .finally(() => setLoading(false));
  }, [courseId]);

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-5 space-y-5">
      {analytics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Participantes" value={analytics.enrollments} />
          <Stat label="Completados" value={`${analytics.completionRate}%`} />
          <Stat label="Aprobados" value={`${analytics.passRate}%`} />
          <Stat label="Puntaje medio" value={analytics.avgWeightedScore.toFixed(1)} />
        </div>
      )}

      {board && board.prizes.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Premios</h4>
          <div className="flex flex-wrap gap-2">
            {board.prizes.map((p) => (
              <span key={p.rank} className="text-xs px-2.5 py-1 rounded-lg bg-brand-50 dark:bg-brand-700/30 text-brand-700 dark:text-brand-200">
                #{p.rank} · {p.label}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 font-medium w-14">#</th>
              <th className="text-left px-3 py-2 font-medium">Participante</th>
              <th className="text-right px-3 py-2 font-medium">Puntaje</th>
              <th className="text-right px-3 py-2 font-medium">Aciertos</th>
              <th className="text-right px-3 py-2 font-medium">Tiempo</th>
            </tr>
          </thead>
          <tbody>
            {!board || board.entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-xs text-muted-foreground">
                  Aún no hay resultados en el ranking.
                </td>
              </tr>
            ) : (
              board.entries.map((e) => {
                const Icon = RANK_ICON[e.rank - 1];
                return (
                  <tr key={e.enrollmentId} className="border-t border-border">
                    <td className="px-3 py-2">
                      {Icon ? (
                        <Icon className={`h-4 w-4 ${RANK_COLOR[e.rank - 1]}`} />
                      ) : (
                        <span className="text-muted-foreground">{e.rank}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-medium">{e.participant}</td>
                    <td className="px-3 py-2 text-right font-semibold">{e.weightedScore.toFixed(1)}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{e.accuracyPct.toFixed(0)}%</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{fmtTime(e.totalTimeSpentSec)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-lg font-bold text-foreground mt-0.5">{value}</p>
    </div>
  );
}
