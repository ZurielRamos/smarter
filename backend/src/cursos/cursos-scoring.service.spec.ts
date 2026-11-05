import { CursosScoringService, RawAnswer } from './cursos-scoring.service';
import { CourseQuestion } from './entities/course-question.entity';

/**
 * Pruebas del motor de puntaje: corrección por tipo, crédito parcial,
 * penalización, tiempo límite y bonus por rapidez.
 */
describe('CursosScoringService', () => {
  let scoring: CursosScoringService;

  beforeEach(() => {
    scoring = new CursosScoringService();
  });

  const q = (overrides: Partial<CourseQuestion>): CourseQuestion =>
    ({
      id: 'q1',
      type: 'single_choice',
      prompt: '¿?',
      options: [],
      correctAnswer: null,
      points: 10,
      negativeOnWrong: 0,
      partialCredit: false,
      timeLimitSec: null,
      timeBonus: null,
      ...overrides,
    }) as CourseQuestion;

  it('puntúa correctamente una opción única acertada', () => {
    const question = q({
      options: [
        { id: 'a', text: 'A', isCorrect: true },
        { id: 'b', text: 'B', isCorrect: false },
      ],
    });
    const answers: RawAnswer[] = [{ questionId: 'q1', answer: ['a'] }];
    const res = scoring.grade([question], answers);
    expect(res.score).toBe(10);
    expect(res.maxScore).toBe(10);
    expect(res.percentage).toBe(100);
    expect(res.answers[0].isCorrect).toBe(true);
  });

  it('aplica penalización por respuesta incorrecta', () => {
    const question = q({
      negativeOnWrong: 4,
      options: [
        { id: 'a', text: 'A', isCorrect: true },
        { id: 'b', text: 'B', isCorrect: false },
      ],
    });
    const res = scoring.grade([question], [{ questionId: 'q1', answer: ['b'] }]);
    // base 0 - penalización 4, pero el total se acota a >= 0
    expect(res.score).toBe(0);
    expect(res.answers[0].pointsAwarded).toBe(-4);
  });

  it('da crédito parcial en opción múltiple', () => {
    const question = q({
      type: 'multiple_choice',
      partialCredit: true,
      points: 10,
      options: [
        { id: 'a', text: 'A', isCorrect: true },
        { id: 'b', text: 'B', isCorrect: true },
        { id: 'c', text: 'C', isCorrect: false },
      ],
    });
    // marca 1 de 2 correctas, ninguna incorrecta => 0.5 => 5 pts
    const res = scoring.grade([question], [{ questionId: 'q1', answer: ['a'] }]);
    expect(res.score).toBe(5);
    expect(res.answers[0].isCorrect).toBe(false);
  });

  it('penaliza opciones incorrectas en crédito parcial', () => {
    const question = q({
      type: 'multiple_choice',
      partialCredit: true,
      points: 10,
      options: [
        { id: 'a', text: 'A', isCorrect: true },
        { id: 'b', text: 'B', isCorrect: true },
        { id: 'c', text: 'C', isCorrect: false },
      ],
    });
    // 2 correctas + 1 incorrecta => (2-1)/2 = 0.5 => 5 pts
    const res = scoring.grade([question], [{ questionId: 'q1', answer: ['a', 'b', 'c'] }]);
    expect(res.score).toBe(5);
  });

  it('da 0 puntos si se responde fuera del tiempo límite', () => {
    const question = q({
      timeLimitSec: 10,
      options: [
        { id: 'a', text: 'A', isCorrect: true },
        { id: 'b', text: 'B', isCorrect: false },
      ],
    });
    const res = scoring.grade([question], [{ questionId: 'q1', answer: ['a'], timeTakenSec: 15 }]);
    expect(res.score).toBe(0);
  });

  it('otorga bonus lineal por responder rápido', () => {
    const question = q({
      timeLimitSec: 10,
      timeBonus: { enabled: true, maxBonusPoints: 5, decayModel: 'linear' },
      options: [
        { id: 'a', text: 'A', isCorrect: true },
        { id: 'b', text: 'B', isCorrect: false },
      ],
    });
    // responde en 2s de 10 => quedan 8/10 => bonus 0.8*5 = 4 => 10 + 4 = 14
    const res = scoring.grade([question], [{ questionId: 'q1', answer: ['a'], timeTakenSec: 2 }]);
    expect(res.answers[0].timeBonusAwarded).toBe(4);
    expect(res.score).toBe(14);
  });

  it('corrige preguntas numéricas con tolerancia', () => {
    const question = q({
      type: 'numeric',
      correctAnswer: { number: 100, tolerance: 2 },
    });
    expect(scoring.grade([question], [{ questionId: 'q1', answer: 101 }]).score).toBe(10);
    expect(scoring.grade([question], [{ questionId: 'q1', answer: 105 }]).score).toBe(0);
  });

  it('corrige texto corto ignorando mayúsculas y acentos', () => {
    const question = q({
      type: 'short_text',
      correctAnswer: { text: 'Bogotá' },
    });
    expect(scoring.grade([question], [{ questionId: 'q1', answer: 'bogota' }]).score).toBe(10);
  });

  it('no puntúa preguntas sin responder', () => {
    const question = q({
      options: [
        { id: 'a', text: 'A', isCorrect: true },
        { id: 'b', text: 'B', isCorrect: false },
      ],
    });
    const res = scoring.grade([question], []);
    expect(res.score).toBe(0);
    expect(res.maxScore).toBe(10);
    expect(res.percentage).toBe(0);
  });
});
