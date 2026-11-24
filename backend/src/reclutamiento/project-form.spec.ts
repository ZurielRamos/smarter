import { BadRequestException } from '@nestjs/common';
import { effectiveVerification, findSensitiveTopic, parseForm, parseVerification, readForm, validateAnswers } from './project-form';

const q = (extra: Record<string, unknown> = {}) => ({ type: 'short', label: '¿En qué ciudad vives?', required: false, ...extra });
const form = (...questions: Array<Record<string, unknown>>) => parseForm({ questions });
const bad = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(BadRequestException);
    return (e as BadRequestException).message;
  }
  throw new Error('Se esperaba un error');
};

describe('parseForm', () => {
  it('asigna identificadores estables y normaliza', () => {
    const f = form(q({ label: '  ¿En   qué ciudad vives? ' }), q({ id: 'edad', type: 'number', label: 'Tu edad', min: '18', max: 99 }), q({ label: 'Otra' }));
    expect(f.questions.map((x) => x.id)).toEqual(['q1', 'edad', 'q2']);
    expect(f.questions[0]).toMatchObject({ label: '¿En qué ciudad vives?', help: '', options: [], min: null, max: null, required: false });
    expect(f.questions[1]).toMatchObject({ min: 18, max: 99 });
  });

  it('no reutiliza un id ya existente al asignar los nuevos', () => {
    const f = form(q({ id: 'q1' }), q());
    expect(f.questions.map((x) => x.id)).toEqual(['q1', 'q2']);
  });

  it('valida tipos, textos y cantidades', () => {
    expect(() => form(q({ type: 'video' }))).toThrow(BadRequestException);
    expect(() => form(q({ label: 'ab' }))).toThrow(BadRequestException);
    expect(() => form(q({ label: 'x'.repeat(201) }))).toThrow(BadRequestException);
    expect(() => form(q({ label: 'Con\u0000control' }))).toThrow(BadRequestException);
    expect(() => form(q({ id: 'Mal Id' }))).toThrow(BadRequestException);
    expect(() => form(q({ id: 'a' }), q({ id: 'a' }))).toThrow(BadRequestException);
    expect(() => parseForm({ questions: Array.from({ length: 16 }, () => q()) })).toThrow(BadRequestException);
    expect(() => parseForm(null)).toThrow(BadRequestException);
    expect(() => parseForm({ questions: 'no' })).toThrow(BadRequestException);
    expect(parseForm({ questions: [] }).questions).toEqual([]);
  });

  it('las preguntas de opciones piden de 2 a 12 distintas', () => {
    expect(() => form(q({ type: 'single', options: ['Solo una'] }))).toThrow(BadRequestException);
    expect(() => form(q({ type: 'multi', options: Array.from({ length: 13 }, (_, i) => `o${i}`) }))).toThrow(BadRequestException);
    expect(() => form(q({ type: 'single', options: ['Sí', 'sí'] }))).toThrow(BadRequestException);
    expect(() => form(q({ type: 'single', options: ['A', ''] }))).toThrow(BadRequestException);
    expect(form(q({ type: 'single', options: ['Moto', 'Bicicleta'] })).questions[0].options).toEqual(['Moto', 'Bicicleta']);
    // Las opciones se ignoran en los demás tipos.
    expect(form(q({ options: ['x', 'y'] })).questions[0].options).toEqual([]);
  });

  it('el rango numérico es coherente', () => {
    expect(() => form(q({ type: 'number', min: 10, max: 5 }))).toThrow(BadRequestException);
    expect(() => form(q({ type: 'number', min: 'abc' }))).toThrow(BadRequestException);
  });

  it('rechaza preguntas de datos sensibles, con o sin tildes, en el texto, la ayuda y las opciones', () => {
    for (const label of ['¿Tienes alguna enfermedad crónica?', '¿Cuál es tu religión?', 'Etnia o RAZA', '¿Tu orientación sexual?', '¿Tienes antecedentes penales?', '¿A qué sindicato perteneces?', 'Huella dactilar', 'Tu estado de SALUD']) {
      expect(bad(() => form(q({ label })))).toMatch(/datos sensibles/);
    }
    expect(bad(() => form(q({ label: 'Cuéntanos de ti', help: 'Menciona si tienes alguna discapacidad' })))).toMatch(/datos sensibles/);
    expect(bad(() => form(q({ type: 'single', label: 'Elige una', options: ['Católica', 'Religión: otra'] })))).toMatch(/datos sensibles/);
  });

  it('no bloquea preguntas normales', () => {
    for (const label of ['¿Cuántas horas a la semana puedes trabajar?', '¿Tienes moto propia?', '¿Cuánta experiencia tienes con encuestas?', 'Saludos: ¿cómo te llamas?', '¿Eres una persona culta?']) {
      expect(() => form(q({ label }))).not.toThrow();
    }
    expect(findSensitiveTopic('disponibilidad de horario')).toBeNull();
  });
});

describe('validateAnswers', () => {
  const f = form(
    q({ id: 'ciudad', label: '¿En qué ciudad vives?', required: true }),
    q({ id: 'bio', type: 'long', label: 'Cuéntanos de ti' }),
    q({ id: 'transporte', type: 'single', label: '¿Cómo te mueves?', options: ['Moto', 'Bus', 'Bicicleta'] }),
    q({ id: 'idiomas', type: 'multi', label: 'Idiomas', options: ['Español', 'Inglés', 'Portugués'], required: true }),
    q({ id: 'moto', type: 'yesno', label: '¿Tienes moto?' }),
    q({ id: 'edad', type: 'number', label: 'Tu edad', min: 18, max: 99, required: true }),
  );
  const ok = { ciudad: ' Bogotá ', idiomas: ['Español', 'Inglés', 'Español'], edad: '25' };

  it('devuelve una copia con el texto de cada pregunta y valores normalizados', () => {
    const a = validateAnswers(f, { ...ok, moto: false, transporte: 'Bus', bio: 'Hola', sobrante: 'x' });
    expect(a.map((x) => x.id)).toEqual(['ciudad', 'bio', 'transporte', 'idiomas', 'moto', 'edad']);
    expect(a[0]).toEqual({ id: 'ciudad', label: '¿En qué ciudad vives?', type: 'short', value: 'Bogotá' });
    expect(a.find((x) => x.id === 'idiomas')!.value).toEqual(['Español', 'Inglés']);
    expect(a.find((x) => x.id === 'edad')!.value).toBe(25);
    expect(a.find((x) => x.id === 'moto')!.value).toBe(false);
    expect(a.some((x) => x.id === 'sobrante')).toBe(false);
  });

  it('omite las opcionales vacías y exige las obligatorias, nombrándolas', () => {
    expect(validateAnswers(f, ok).map((x) => x.id)).toEqual(['ciudad', 'idiomas', 'edad']);
    expect(bad(() => validateAnswers(f, { ...ok, ciudad: '  ' }))).toContain('¿En qué ciudad vives?');
    expect(bad(() => validateAnswers(f, { ...ok, idiomas: [] }))).toContain('Idiomas');
    expect(bad(() => validateAnswers(f, undefined))).toContain('Responde');
  });

  it('rechaza valores de tipo o rango incorrecto', () => {
    for (const patch of [
      { ciudad: 5 },
      { ciudad: 'x'.repeat(201) },
      { bio: 'x'.repeat(1001) },
      { transporte: 'Avión' },
      { idiomas: ['Klingon'] },
      { idiomas: 'Español' },
      { moto: 'si' },
      { edad: 17 },
      { edad: 100 },
      { edad: 'veinte' },
      { edad: Infinity },
    ]) {
      expect(() => validateAnswers(f, { ...ok, ...patch })).toThrow(BadRequestException);
    }
    expect(bad(() => validateAnswers(f, { ...ok, edad: 17 }))).toMatch(/mínimo 18, máximo 99/);
  });

  it('rechaza un cuerpo que no es un objeto y limita el tamaño total', () => {
    expect(() => validateAnswers(f, 'texto')).toThrow(BadRequestException);
    expect(() => validateAnswers(f, [1, 2])).toThrow(BadRequestException);
    const big = form(...Array.from({ length: 15 }, (_, i) => q({ id: `l${i}`, type: 'long', label: `Pregunta larga ${i}` })));
    const answers = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`l${i}`, 'x'.repeat(1000)]));
    expect(() => validateAnswers(big, answers)).toThrow(/demasiado largas/);
  });

  it('un formulario sin preguntas acepta cualquier cuerpo vacío', () => {
    expect(validateAnswers({ questions: [], fields: [], verification: null }, undefined)).toEqual([]);
    expect(validateAnswers({ questions: [], fields: [], verification: null }, { x: 1 })).toEqual([]);
  });
});

describe('readForm', () => {
  it('lo guardado inválido se lee como un formulario vacío', () => {
    expect(readForm(undefined)).toEqual({ questions: [], fields: [], verification: null });
    expect(readForm({ questions: [{ type: 'x' }] })).toEqual({ questions: [], fields: [], verification: null });
  });
});

describe('datos personales del formulario', () => {
  it('es opcional y se normaliza', () => {
    expect(parseForm({ questions: [] }).fields).toEqual([]);
    expect(parseForm({ questions: [], fields: [{ key: 'ciudad', required: true }, { key: 'direccion' }] }).fields).toEqual([
      { key: 'ciudad', required: true },
      { key: 'direccion', required: false },
    ]);
  });
  it('rechaza claves inválidas, repetidas, formas erróneas y demasiados', () => {
    expect(() => parseForm({ questions: [], fields: [{ key: 'Ciudad Real' }] })).toThrow(BadRequestException);
    expect(() => parseForm({ questions: [], fields: [{ key: 'ciudad' }, { key: 'ciudad' }] })).toThrow(BadRequestException);
    expect(() => parseForm({ questions: [], fields: 'ciudad' })).toThrow(BadRequestException);
    expect(() => parseForm({ questions: [], fields: [null] })).toThrow(BadRequestException);
    expect(() => parseForm({ questions: [], fields: Array.from({ length: 16 }, (_, i) => ({ key: `campo${i}` })) })).toThrow(BadRequestException);
  });
});

describe('verificación del proyecto', () => {
  const tenant = { channel: 'email' as const, whatsapp: { inboxId: 'cuenta', templateName: 'codigo_cuenta', language: 'es' } };
  it('sin definir hereda la de la cuenta', () => {
    expect(parseForm({ questions: [] }).verification).toBeNull();
    expect(effectiveVerification(parseForm({ questions: [] }), tenant)).toEqual(tenant);
  });
  it('exige al menos un canal válido y colapsa los repetidos', () => {
    expect(() => parseVerification({ channels: [] })).toThrow(BadRequestException);
    expect(() => parseVerification({ channels: ['sms'] })).toThrow(BadRequestException);
    expect(() => parseVerification({ channels: ['phone', 'sms'] })).toThrow(BadRequestException);
    expect(parseVerification({ channels: ['phone', 'phone'] })!.channels).toEqual(['phone']);
    expect(() => parseVerification('phone')).toThrow(BadRequestException);
    expect(() => parseVerification({})).toThrow(BadRequestException);
  });
  it('normaliza canales y plantilla, y calcula el canal efectivo', () => {
    const one = parseVerification({ channels: ['phone'], whatsapp: { inboxId: ' abc ', templateName: ' codigo ', language: '' } })!;
    expect(one).toEqual({ channels: ['phone'], whatsapp: { inboxId: 'abc', templateName: 'codigo', language: 'es' } });
    expect(effectiveVerification({ questions: [], fields: [], verification: one }, tenant).channel).toBe('phone');
    const both = parseVerification({ channels: ['email', 'phone'] })!;
    expect(both.whatsapp).toEqual({ inboxId: null, templateName: '', language: 'es' });
    expect(effectiveVerification({ questions: [], fields: [], verification: both }, tenant).channel).toBe('both');
    expect(effectiveVerification({ questions: [], fields: [], verification: parseVerification({ channels: ['email'] }) }, tenant).channel).toBe('email');
  });
});
