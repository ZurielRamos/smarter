import { buildProjectConditionSql, isProjectField, parseProjectContactField, projectMembershipSql } from './segment-project-conditions';

const PID = '3f2b1c9e-8a4d-4e6b-9c1d-2a7f5b8e0d11';

describe('buildProjectConditionSql', () => {
  it('reconoce los campos de proyecto', () => {
    expect(isProjectField(`project:${PID}`)).toBe(true);
    expect(isProjectField(`project_answer:${PID}:q1`)).toBe(true);
    expect(isProjectField('email')).toBe(false);
  });

  it('está en el proyecto con cualquier estado', () => {
    const r = buildProjectConditionSql(`project:${PID}`, 'in_project', 'any', 'p_0_0')!;
    expect(r.sql).toMatch(/^EXISTS \(SELECT 1 FROM project_prospects pp/);
    expect(r.sql).not.toContain('pp.status');
    expect(r.params).toEqual({ p_0_0_pid: PID });
  });

  it('no está en el proyecto con un estado', () => {
    const r = buildProjectConditionSql(`project:${PID}`, 'not_in_project', 'seleccionado', 'p_0_0')!;
    expect(r.sql.startsWith('NOT EXISTS')).toBe(true);
    expect(r.params.p_0_0_st).toBe('seleccionado');
  });

  it('ignora proyecto vacío, inválido o estado desconocido', () => {
    expect(buildProjectConditionSql('project:', 'in_project', 'any', 'p')).toBeNull();
    expect(buildProjectConditionSql("project:x'; DROP", 'in_project', 'any', 'p')).toBeNull();
    expect(buildProjectConditionSql(`project:${PID}`, 'in_project', 'inventado', 'p')).toBeNull();
  });

  it('respuesta de texto y de opción múltiple', () => {
    const r = buildProjectConditionSql(`project_answer:${PID}:q2`, 'equals', 'Bogotá', 'p_1_0')!;
    expect(r.sql).toContain("ans->>'id' = :p_1_0_qid");
    expect(r.sql).toContain('@>');
    expect(r.params).toMatchObject({ p_1_0_qid: 'q2', p_1_0_v: 'Bogotá' });
  });

  it('respuesta numérica convierte el valor y fechas comparan como texto', () => {
    const n = buildProjectConditionSql(`project_answer:${PID}:q3`, 'greater_or_equal', '7', 'p')!;
    expect(n.params.p_v).toBe(7);
    expect(n.sql).toContain('>= CAST(:p_v AS numeric)');
    const d = buildProjectConditionSql(`project_answer:${PID}:q4`, 'less_than', '2025-01-31', 'p')!;
    expect(d.params.p_v).toBe('2025-01-31');
    expect(buildProjectConditionSql(`project_answer:${PID}:q3`, 'greater_than', 'abc', 'p')).toBeNull();
  });

  it('ignora respuestas sin valor, pregunta inválida u operador desconocido', () => {
    expect(buildProjectConditionSql(`project_answer:${PID}:q1`, 'equals', '', 'p')).toBeNull();
    expect(buildProjectConditionSql(`project_answer:${PID}:`, 'equals', 'x', 'p')).toBeNull();
    expect(buildProjectConditionSql(`project_answer:${PID}:q1`, 'drop', 'x', 'p')).toBeNull();
  });
});

describe('datos personales del formulario', () => {
  it('reconoce la clave y no la trata como pregunta', () => {
    expect(parseProjectContactField(`project_answer:${PID}:field_birthDate`)).toEqual({ projectId: PID, key: 'birthDate' });
    expect(parseProjectContactField(`project_answer:${PID}:q1`)).toBeNull();
    expect(parseProjectContactField(`project_answer:${PID}:field_a'b`)).toBeNull();
    expect(buildProjectConditionSql(`project_answer:${PID}:field_city`, 'equals', 'x', 'p')).toBeNull();
  });

  it('la pertenencia al proyecto usa el tenant del contacto', () => {
    const m = projectMembershipSql('p_0_0', PID);
    expect(m.sql).toContain('pp.tenant_id = client.tenant_id');
    expect(m.params).toEqual({ p_0_0_pid: PID });
  });
});
