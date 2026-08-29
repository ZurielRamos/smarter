import { looksLikeNonAnswer } from './flow-answer.util';

describe('looksLikeNonAnswer', () => {
  describe('non-answers (must be rejected)', () => {
    const nonAnswers = [
      'donde estan ubicados?',
      '¿Dónde están ubicados?',
      'no entiendo la pregunta',
      'no entiendo',
      'no te entiendo',
      'no se',
      'no sé',
      'no',
      'que?',
      '¿qué?',
      'como asi',
      'a que te refieres',
      'ni idea',
      'no tengo idea',
      'explicame',
      'no quiero',
      '   ', // whitespace only
      '',
      'cual es el horario', // question word start, no '?'
      'cuanto cuesta el envio?',
      'por que necesitas eso?',
    ];

    it.each(nonAnswers)('rejects %p', (msg) => {
      expect(looksLikeNonAnswer(msg)).toBe(true);
    });
  });

  describe('real answers (must be accepted)', () => {
    const answers = [
      'Victor Ramos',
      'Victor',
      'Juan Carlos Pérez',
      'vzurielr@gmail.com',
      '3137082992',
      'Strategee Group',
      'mi nombre es Victor', // contains a real answer, no question/confusion markers
      'iPhone 16 Pro Max',
      'Calle 123 #45-67',
      'Bogotá',
    ];

    it.each(answers)('accepts %p', (msg) => {
      expect(looksLikeNonAnswer(msg)).toBe(false);
    });
  });
});
