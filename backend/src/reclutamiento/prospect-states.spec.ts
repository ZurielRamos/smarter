import { ALL_STATUSES, INITIAL_STATUS, PARTICIPATED_STATUSES, PROSPECT_STATES, publicStatusOf, stateOf } from './prospect-states';

describe('estados de los prospectos', () => {
  it('son pocos, únicos, caben en la columna y el inicial existe', () => {
    expect(PROSPECT_STATES).toHaveLength(8);
    expect(ALL_STATUSES.size).toBe(PROSPECT_STATES.length);
    expect(ALL_STATUSES.has(INITIAL_STATUS)).toBe(true);
    expect(PROSPECT_STATES.every((s) => s.key.length <= 20 && /^[a-z_]+$/.test(s.key) && s.help)).toBe(true);
    expect(PARTICIPATED_STATUSES).toEqual(['participo']);
    expect(PROSPECT_STATES.filter((s) => s.negative).map((s) => s.key)).toEqual(['no_seleccionado', 'no_participo']);
  });

  it('la persona nunca ve el estado interno', () => {
    expect(publicStatusOf('no_seleccionado')).toBe('not_selected');
    expect(publicStatusOf('no_participo')).toBe('finished');
    expect(publicStatusOf('en_espera')).toBe('in_process');
    expect(publicStatusOf('seleccionado')).toBe('selected');
    expect(publicStatusOf('desconocido')).toBe('received');
    expect(stateOf('calificado')).toBeUndefined();
  });
});
