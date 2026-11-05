import { Injectable } from '@nestjs/common';
import { CourseQuestion } from './entities/course-question.entity';
import { CourseQuiz } from './entities/course-quiz.entity';
import { AttemptAnswer } from './entities/course-quiz-attempt.entity';

export interface RawAnswer {
  questionId: string;
  answer: string[] | string | number | null;
  timeTakenSec?: number;
}

export interface GradeResult {
  answers: AttemptAnswer[];
  score: number;
  baseScore: number;
  maxScore: number;
  percentage: number;
}

/**
 * Motor de puntaje del módulo Cursos.
 *
 * Centraliza la corrección por tipo de pregunta, el crédito parcial, la
 * penalización por error y el bonus por rapidez. No toca la base de datos:
 * recibe preguntas + respuestas crudas y devuelve el desglose puntuado, de modo
 * que sea determinista y testeable.
 */
@Injectable()
export class CursosScoringService {
  /**
   * Corrige un intento. Para cada pregunta calcula puntos (con crédito parcial
   * y penalización) y bonus por tiempo, respetando el límite por pregunta.
   */
  grade(
    questions: CourseQuestion[],
    rawAnswers: RawAnswer[],
    _quiz?: CourseQuiz,
  ): GradeResult {
    const byId = new Map(rawAnswers.map((a) => [a.questionId, a]));
    const graded: AttemptAnswer[] = [];
    let score = 0; // puntaje con bonus (para ranking/total)
    let baseScore = 0; // puntaje base acotado (para % y aprobación), nunca > maxScore
    let maxScore = 0;

    for (const q of questions) {
      maxScore += Number(q.points) || 0;
      const raw = byId.get(q.id);
      const timeTakenSec = Math.max(0, Math.round(raw?.timeTakenSec ?? 0));

      // Respuesta fuera de tiempo (límite por pregunta) => 0 puntos, sin bonus.
      const outOfTime =
        q.timeLimitSec != null && q.timeLimitSec > 0 && timeTakenSec > q.timeLimitSec;

      let fraction = 0; // 0..1 de los puntos base obtenidos
      let isCorrect = false;

      if (raw && raw.answer != null && !outOfTime) {
        fraction = this.gradeQuestion(q, raw.answer);
        isCorrect = fraction >= 1;
      }

      const base = (Number(q.points) || 0) * fraction;

      // Penalización por error (solo si respondió y falló por completo).
      let penalty = 0;
      if (raw && raw.answer != null && fraction === 0 && !outOfTime) {
        penalty = Number(q.negativeOnWrong) || 0;
      }

      // Bonus por rapidez (solo si acertó al 100% y hay límite de tiempo).
      let bonus = 0;
      if (isCorrect && q.timeBonus?.enabled && q.timeLimitSec && q.timeLimitSec > 0) {
        bonus = this.timeBonus(q, timeTakenSec);
      }

      // El puntaje base (para %) NO incluye el bonus y nunca supera los puntos
      // de la pregunta. El bonus solo suma al puntaje total (ranking).
      baseScore += Math.max(0, base - penalty);
      const pointsAwarded = this.round(base - penalty + bonus);
      score += pointsAwarded;

      graded.push({
        questionId: q.id,
        answer: raw?.answer ?? null,
        isCorrect,
        pointsAwarded,
        timeTakenSec,
        timeBonusAwarded: this.round(bonus),
      });
    }

    score = this.round(Math.max(0, score)); // puntaje total (con bonus)
    baseScore = this.round(Math.max(0, baseScore));
    maxScore = this.round(maxScore);
    // El porcentaje y la aprobación se basan en el puntaje BASE acotado a 100%.
    const percentage = maxScore > 0 ? this.round(Math.min(100, (baseScore / maxScore) * 100)) : 0;

    return { answers: graded, score, baseScore, maxScore, percentage };
  }

  /** Devuelve la fracción (0..1) de puntos base obtenida en una pregunta. */
  private gradeQuestion(q: CourseQuestion, answer: string[] | string | number): number {
    switch (q.type) {
      case 'single_choice':
      case 'true_false':
        return this.gradeSingleChoice(q, answer);
      case 'multiple_choice':
        return this.gradeMultipleChoice(q, answer);
      case 'short_text':
        return this.gradeShortText(q, answer);
      case 'numeric':
        return this.gradeNumeric(q, answer);
      case 'ordering':
        return this.gradeOrdering(q, answer);
      default:
        return 0;
    }
  }

  private gradeSingleChoice(q: CourseQuestion, answer: string[] | string | number): number {
    const selected = Array.isArray(answer) ? answer[0] : String(answer);
    const correct = q.options.find((o) => o.isCorrect);
    return correct && selected === correct.id ? 1 : 0;
  }

  private gradeMultipleChoice(q: CourseQuestion, answer: string[] | string | number): number {
    const selected = new Set(Array.isArray(answer) ? answer.map(String) : [String(answer)]);
    const correctIds = q.options.filter((o) => o.isCorrect).map((o) => o.id);
    const wrongIds = q.options.filter((o) => !o.isCorrect).map((o) => o.id);
    if (correctIds.length === 0) return 0;

    const correctSelected = correctIds.filter((id) => selected.has(id)).length;
    const wrongSelected = wrongIds.filter((id) => selected.has(id)).length;

    if (!q.partialCredit) {
      // Todo o nada: todas las correctas y ninguna incorrecta.
      return correctSelected === correctIds.length && wrongSelected === 0 ? 1 : 0;
    }

    // Crédito parcial: aciertos menos penalización por marcar incorrectas,
    // normalizado por el nº de opciones correctas, acotado a [0, 1].
    const fraction = (correctSelected - wrongSelected) / correctIds.length;
    return Math.max(0, Math.min(1, fraction));
  }

  private gradeShortText(q: CourseQuestion, answer: string[] | string | number): number {
    const given = this.normalizeText(Array.isArray(answer) ? answer[0] : answer);
    const expected: string[] = [];
    if (q.correctAnswer?.text != null) expected.push(this.normalizeText(q.correctAnswer.text));
    for (const v of q.correctAnswer?.acceptedValues ?? []) expected.push(this.normalizeText(v));
    return expected.includes(given) && given !== '' ? 1 : 0;
  }

  private gradeNumeric(q: CourseQuestion, answer: string[] | string | number): number {
    const given = parseFloat(String(Array.isArray(answer) ? answer[0] : answer));
    if (isNaN(given)) return 0;
    const tolerance = Number(q.correctAnswer?.tolerance ?? 0);
    const candidates: number[] = [];
    if (q.correctAnswer?.number != null) candidates.push(Number(q.correctAnswer.number));
    for (const v of q.correctAnswer?.acceptedValues ?? []) {
      const n = Number(v);
      if (!isNaN(n)) candidates.push(n);
    }
    return candidates.some((c) => Math.abs(c - given) <= tolerance) ? 1 : 0;
  }

  private gradeOrdering(q: CourseQuestion, answer: string[] | string | number): number {
    const given = Array.isArray(answer) ? answer.map(String) : [];
    const correct = q.correctAnswer?.order ?? q.options.map((o) => o.id);
    if (correct.length === 0) return 0;

    if (!q.partialCredit) {
      return given.length === correct.length && given.every((id, i) => id === correct[i]) ? 1 : 0;
    }
    // Crédito parcial: proporción de posiciones correctas.
    const matches = correct.filter((id, i) => given[i] === id).length;
    return matches / correct.length;
  }

  /** Bonus por rapidez según el tiempo restante y el modelo de decaimiento. */
  private timeBonus(q: CourseQuestion, timeTakenSec: number): number {
    const limit = q.timeLimitSec!;
    const max = Number(q.timeBonus?.maxBonusPoints) || 0;
    if (max <= 0 || limit <= 0) return 0;
    const remainingFraction = Math.max(0, (limit - timeTakenSec) / limit);
    if (q.timeBonus?.decayModel === 'step') {
      return remainingFraction >= 0.5 ? max : 0;
    }
    // linear (default)
    return max * remainingFraction;
  }

  private normalizeText(v: string | number): string {
    return String(v)
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''); // quita acentos
  }

  private round(n: number): number {
    return Math.round(n * 100) / 100;
  }
}
