import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import { Tenant } from '../tenants/tenant.entity';
import { ClientRecord } from '../records/record.entity';
import { Course } from './entities/course.entity';
import { CourseLesson } from './entities/course-lesson.entity';
import { CourseEnrollment } from './entities/course-enrollment.entity';
import { CourseCertificate } from './entities/course-certificate.entity';
import { CursosOtpService, OtpChannel } from './cursos-otp.service';
import { CursosCrmService } from './cursos-crm.service';

interface PortalTokenPayload {
  purpose: 'course-portal';
  tenantId: string;
  recordId: string;
}

/**
 * Portal público de academy del tenant: lista de cursos, identidad del
 * participante por OTP (a nivel tenant), mis calificaciones y rankings por
 * curso y general. No requiere login: la identidad se resuelve al contacto del
 * CRM mediante un portalToken (JWT) tras verificar email/teléfono.
 */
@Injectable()
export class CursosPortalService {
  constructor(
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(Course) private readonly courseRepo: Repository<Course>,
    @InjectRepository(CourseLesson) private readonly lessonRepo: Repository<CourseLesson>,
    @InjectRepository(CourseEnrollment) private readonly enrollmentRepo: Repository<CourseEnrollment>,
    @InjectRepository(CourseCertificate) private readonly certificateRepo: Repository<CourseCertificate>,
    @InjectRepository(ClientRecord) private readonly recordRepo: Repository<ClientRecord>,
    private readonly jwt: JwtService,
    private readonly otp: CursosOtpService,
    private readonly crm: CursosCrmService,
  ) {}

  /** Datos del portal: tenant + cursos activos (si el módulo está activo). */
  async getPortal(tenantSlug: string) {
    const tenant = await this.resolveTenant(tenantSlug);
    const courses = await this.courseRepo.find({
      where: { tenantId: tenant.id, status: 'active' },
      order: { createdAt: 'DESC' },
    });
    const courseIds = courses.map((c) => c.id);
    const lessonCounts = await this.countByCourse(this.lessonRepo, courseIds, 'courseId');
    // Duración total por curso = suma de durationSec de los materiales de todas
    // sus clases (la duración vive en lesson.materials[].durationSec).
    const durationByCourse = await this.sumDurationByCourse(courseIds);

    const cfg = tenant.academyConfig || {};
    return {
      tenant: { name: tenant.name, slug: tenant.slug, iconPath: tenant.iconPath },
      // Config de verificación del portal (lo que el frontend necesita saber).
      verification: { channel: cfg.verificationChannel || 'both' },
      // Apariencia del portal (colores/estilos configurables por el tenant).
      theme: cfg.theme || null,
      // Metadatos para compartir en redes (para la vista previa del admin).
      meta: cfg.meta || null,
      courses: courses.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        coverUrl: c.coverUrl,
        slug: c.slug,
        lessons: lessonCounts[c.id] ?? 0,
        durationSec: durationByCourse[c.id] ?? 0,
        level: c.settings?.level ?? null,
        hasCertificate: c.settings?.certificate?.enabled === true,
        enrollmentCount: c.enrollmentCount,
        theme: c.theme,
      })),
    };
  }

  /** Suma la duración (segundos) de los materiales de todas las clases, por curso. */
  private async sumDurationByCourse(courseIds: string[]): Promise<Record<string, number>> {
    if (courseIds.length === 0) return {};
    const lessons = await this.lessonRepo.find({
      where: { courseId: In(courseIds) },
      select: { id: true, courseId: true, materials: true },
    });
    const map: Record<string, number> = {};
    for (const lesson of lessons) {
      const sum = (lesson.materials ?? []).reduce(
        (acc, m) => acc + (Number(m?.durationSec) || 0),
        0,
      );
      map[lesson.courseId] = (map[lesson.courseId] ?? 0) + sum;
    }
    return map;
  }

  /**
   * Metadatos efectivos para compartir el portal en redes (OG/Twitter),
   * resueltos con fallbacks. Usado para inyectar las etiquetas en el HTML.
   * Devuelve null si el tenant/portal no existe.
   */
  async getPortalMeta(tenantSlug: string): Promise<{
    title: string;
    description: string;
    image: string | null;
    tenantName: string;
  } | null> {
    const tenant = await this.tenantRepo.findOne({ where: { slug: tenantSlug } });
    if (!tenant) return null;
    const cfg = tenant.academyConfig || {};
    const meta = cfg.meta || {};
    const theme = cfg.theme || {};
    const title = (meta.title || theme.headerTitle || tenant.name || 'Academy').trim();
    const description = (
      meta.description ||
      `Accede a los cursos de ${tenant.name} y sigue tu progreso.`
    ).trim();
    const image = meta.ogImage || theme.logoUrl || null;
    return { title, description, image, tenantName: tenant.name };
  }

  // ─────────────────────────── IDENTIDAD ───────────────────────────

  /** Solicita un código para identificar al participante en el portal. */
  async identifyRequest(tenantSlug: string, channel: OtpChannel, destination: string) {
    const tenant = await this.resolveTenant(tenantSlug);
    return this.otp.requestForTenant(tenant, channel, destination);
  }

  /**
   * Verifica el código y emite un portalToken ligado al contacto del CRM.
   * Si el contacto no existe, lo crea con el dato verificado (email/phone).
   */
  async identifyVerify(tenantSlug: string, otpId: string, code: string) {
    const tenant = await this.resolveTenant(tenantSlug);
    const { channel, destination } = await this.otp.verify(otpId, code);
    const cfg = tenant.academyConfig || {};

    const existing = await this.crm.findByEmailOrPhone(tenant.id, channel, destination);
    let record = existing;
    if (!record) {
      // Crear contacto mínimo con el dato verificado (y el canal como source).
      const partial: Record<string, any> = { [channel === 'email' ? 'email' : 'phone']: destination };
      const recordId = await this.crm.upsertFromParticipant(
        { id: '', tenantId: tenant.id, name: 'Portal', settings: { enrollmentFields: cfg.enrollmentFields } } as any,
        partial,
        null,
      );
      record = await this.recordRepo.findOne({ where: { id: recordId } });
    }
    if (!record) throw new BadRequestException('No se pudo resolver el contacto');

    const token = this.jwt.sign(
      { purpose: 'course-portal', tenantId: tenant.id, recordId: record.id } as PortalTokenPayload,
      { expiresIn: '30d' },
    );

    // ¿Faltan datos obligatorios de inscripción? (para pedirlos una vez).
    const needsData = this.missingRequiredFields(cfg.enrollmentFields, record);
    // Enriquecer los campos con tipo/opciones del CRM (p. ej. selects).
    const enrichedFields = needsData
      ? await this.crm.enrichEnrollmentFields(tenant.id, cfg.enrollmentFields)
      : [];

    return {
      portalToken: token,
      isNew: !existing,
      needsData,
      fields: enrichedFields,
      participant: {
        recordId: record.id,
        name: record.fullName || [record.firstName, record.lastName].filter(Boolean).join(' ') || null,
        email: record.email,
        phone: record.phone,
      },
    };
  }

  /** Completa los datos del contacto (campos de inscripción del portal). */
  async completeProfile(tenantSlug: string, portalToken: string, data: Record<string, any>) {
    const tenant = await this.resolveTenant(tenantSlug);
    const recordId = this.verifyPortalToken(tenant.id, portalToken);
    const record = await this.recordRepo.findOne({ where: { id: recordId } });
    if (!record) throw new BadRequestException('Contacto no encontrado');
    await this.crm.upsertFromParticipant(
      { id: '', tenantId: tenant.id, name: 'Portal', settings: { enrollmentFields: tenant.academyConfig?.enrollmentFields } } as any,
      data,
      record,
    );
    return { ok: true };
  }

  /**
   * Entra a un curso desde el portal (ya verificado). Crea o retoma la
   * inscripción del participante para ese curso, vinculada a su recordId, y
   * devuelve el accessToken de la inscripción para el runner del curso.
   */
  async enterCourse(tenantSlug: string, portalToken: string, courseId: string) {
    const tenant = await this.resolveTenant(tenantSlug);
    const recordId = this.verifyPortalToken(tenant.id, portalToken);
    const course = await this.courseRepo.findOne({ where: { id: courseId, tenantId: tenant.id } });
    if (!course || course.status !== 'active') throw new NotFoundException('Curso no disponible');

    // Debe haber UNA inscripción por (curso, contacto). Si por datos antiguos o
    // una carrera hubiera varias, elegimos SIEMPRE la misma de forma
    // determinista para no saltar entre inscripciones (lo que hacía que
    // apareciera el estado de otra, p. ej. un intento fantasma del examen
    // final). Preferimos la que tiene progreso real: más clases completadas,
    // luego actividad más reciente.
    const existing = await this.enrollmentRepo.find({
      where: { courseId, recordId },
    });
    let enrollment =
      existing.length > 0
        ? [...existing].sort((a, b) => {
            if ((b.completedLessons ?? 0) !== (a.completedLessons ?? 0)) {
              return (b.completedLessons ?? 0) - (a.completedLessons ?? 0);
            }
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
          })[0]
        : null;
    if (!enrollment) {
      enrollment = await this.enrollmentRepo.save(
        this.enrollmentRepo.create({
          tenantId: tenant.id,
          courseId,
          recordId,
          campaignId: course.campaignId ?? null,
          accessToken: randomBytes(24).toString('hex'),
          status: 'in_progress',
          startedAt: new Date(),
          participantData: {},
        }),
      );
      const count = await this.enrollmentRepo.count({ where: { courseId } });
      await this.courseRepo.update({ id: courseId }, { enrollmentCount: count });
    }
    return { courseSlug: course.slug, accessToken: enrollment.accessToken };
  }

  private missingRequiredFields(
    fields: Array<{ crmField: string; required?: boolean }> | undefined,
    record: ClientRecord,
  ): boolean {
    const systemCols = record as unknown as Record<string, any>;
    for (const f of fields || []) {
      if (!f.required) continue;
      const inSystem = systemCols[f.crmField];
      const inCustom = record.customData?.[f.crmField];
      if ((inSystem === undefined || inSystem === null || inSystem === '') && !inCustom) {
        return true;
      }
    }
    return false;
  }

  /** Verifica el portalToken y devuelve el recordId/tenantId. */
  private verifyPortalToken(tenantId: string, portalToken: string): string {
    let payload: PortalTokenPayload;
    try {
      payload = this.jwt.verify(portalToken) as PortalTokenPayload;
    } catch {
      throw new UnauthorizedException('Sesión del portal inválida o expirada');
    }
    if (payload.purpose !== 'course-portal' || payload.tenantId !== tenantId) {
      throw new UnauthorizedException('Sesión del portal inválida');
    }
    return payload.recordId;
  }

  // ─────────────────────────── MIS CURSOS / CALIFICACIONES ───────────────────────────

  /**
   * Panel del participante: sus inscripciones con calificación y posición por
   * curso, más un resumen general (promedio y posición global).
   */
  async myDashboard(tenantSlug: string, portalToken: string) {
    const tenant = await this.resolveTenant(tenantSlug);
    const recordId = this.verifyPortalToken(tenant.id, portalToken);

    const myEnrollments = await this.enrollmentRepo.find({
      where: { tenantId: tenant.id, recordId },
    });
    const courseIds = myEnrollments.map((e) => e.courseId);
    const courses = courseIds.length
      ? await this.courseRepo.find({ where: { id: In(courseIds) } })
      : [];
    const courseById = new Map(courses.map((c) => [c.id, c]));

    const items = myEnrollments.map((e) => {
      const course = courseById.get(e.courseId);
      return {
        courseId: e.courseId,
        courseName: course?.name ?? 'Curso',
        courseSlug: course?.slug ?? null,
        status: e.status,
        weightedScore: e.weightedScore,
        accuracyPct: e.accuracyPct,
        completedLessons: e.completedLessons,
        rank: e.rank,
        completedAt: e.completedAt,
      };
    });

    // Resumen general del participante.
    const scored = myEnrollments.filter((e) => e.maxPossibleScore > 0 || e.weightedScore > 0);
    const avgScore = scored.length
      ? this.round(scored.reduce((s, e) => s + Number(e.weightedScore), 0) / scored.length)
      : 0;
    const overall = await this.overallRanking(tenant.id);
    const myOverall = overall.find((r) => r.recordId === recordId);

    return {
      participant: await this.participantInfo(recordId),
      courses: items,
      summary: {
        coursesEnrolled: myEnrollments.length,
        coursesCompleted: myEnrollments.filter((e) => e.status === 'passed' || e.status === 'completed').length,
        avgScore,
        overallRank: myOverall?.rank ?? null,
        overallScore: myOverall?.score ?? 0,
      },
    };
  }

  /**
   * Certificados del participante en este tenant (emitidos al aprobar cursos),
   * más recientes primero. Usa el snapshot guardado en el certificado.
   */
  async myCertificates(tenantSlug: string, portalToken: string) {
    const tenant = await this.resolveTenant(tenantSlug);
    const recordId = this.verifyPortalToken(tenant.id, portalToken);

    const certs = await this.certificateRepo.find({
      where: { tenantId: tenant.id, recordId },
      order: { issuedAt: 'DESC' },
    });

    return {
      certificates: certs.map((c) => ({
        id: c.id,
        serial: c.serial,
        courseId: c.courseId,
        participantName: c.participantName,
        courseName: c.courseName,
        tenantName: c.tenantName,
        score: Number(c.score),
        rank: c.rank,
        config: c.config ?? null,
        issuedAt: c.issuedAt,
      })),
    };
  }

  // ─────────────────────────── RANKINGS ───────────────────────────

  /** Ranking público agregado de todos los cursos del tenant, por participante. */
  async overallLeaderboard(tenantSlug: string, limit = 50) {
    const tenant = await this.resolveTenant(tenantSlug);
    const ranking = await this.overallRanking(tenant.id);
    return { entries: ranking.slice(0, limit) };
  }

  /**
   * Calcula el ranking general: promedio del weightedScore de cada participante
   * (por recordId) a través de todos sus cursos del tenant, con nº de cursos
   * completados como desempate.
   */
  private async overallRanking(tenantId: string): Promise<
    Array<{
      rank: number;
      recordId: string;
      participant: string;
      score: number;
      coursesCompleted: number;
      totalTimeSpentSec: number;
    }>
  > {
    const enrollments = await this.enrollmentRepo.find({
      where: { tenantId },
    });
    // Agrupar por recordId (ignora inscripciones sin contacto resuelto).
    const byRecord = new Map<string, CourseEnrollment[]>();
    for (const e of enrollments) {
      if (!e.recordId) continue;
      const arr = byRecord.get(e.recordId) ?? [];
      arr.push(e);
      byRecord.set(e.recordId, arr);
    }

    const recordIds = [...byRecord.keys()];
    const records = recordIds.length
      ? await this.recordRepo.find({ where: { id: In(recordIds) } })
      : [];
    const nameById = new Map(
      records.map((r) => [
        r.id,
        r.fullName || [r.firstName, r.lastName].filter(Boolean).join(' ') || r.email || r.phone || 'Participante',
      ]),
    );

    const rows = [...byRecord.entries()].map(([recordId, list]) => {
      const score = this.round(
        list.reduce((s, e) => s + Number(e.weightedScore), 0) / list.length,
      );
      const coursesCompleted = list.filter(
        (e) => e.status === 'passed' || e.status === 'completed',
      ).length;
      const totalTimeSpentSec = list.reduce((s, e) => s + e.totalTimeSpentSec, 0);
      return {
        recordId,
        participant: nameById.get(recordId) ?? 'Participante',
        score,
        coursesCompleted,
        totalTimeSpentSec,
      };
    });

    rows.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.coursesCompleted !== a.coursesCompleted) return b.coursesCompleted - a.coursesCompleted;
      return a.totalTimeSpentSec - b.totalTimeSpentSec;
    });

    return rows.map((r, i) => ({ rank: i + 1, ...r }));
  }

  // ─────────────────────────── helpers ───────────────────────────

  private async resolveTenant(slug: string): Promise<Tenant> {
    const tenant = await this.tenantRepo.findOne({ where: { slug } });
    if (!tenant) throw new NotFoundException('Portal no encontrado');
    if (!tenant.features?.cursos) {
      throw new NotFoundException('El módulo de cursos no está disponible');
    }
    return tenant;
  }

  private async participantInfo(recordId: string) {
    const r = await this.recordRepo.findOne({ where: { id: recordId } });
    if (!r) return null;
    return {
      recordId: r.id,
      name: r.fullName || [r.firstName, r.lastName].filter(Boolean).join(' ') || null,
      email: r.email,
      phone: r.phone,
    };
  }

  private async countByCourse<T extends Record<string, any>>(
    repo: Repository<T>,
    courseIds: string[],
    column: string,
  ): Promise<Record<string, number>> {
    if (courseIds.length === 0) return {};
    const rows = await repo
      .createQueryBuilder('t')
      .select('t.course_id', 'courseId')
      .addSelect('COUNT(*)', 'count')
      .where('t.course_id IN (:...ids)', { ids: courseIds })
      .groupBy('t.course_id')
      .getRawMany<{ courseId: string; count: string }>();
    const map: Record<string, number> = {};
    for (const r of rows) map[r.courseId] = Number(r.count);
    return map;
  }

  private round(n: number): number {
    return Math.round(n * 100) / 100;
  }
}
