import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { randomBytes, randomUUID } from 'crypto';
import { Tenant } from '../tenants/tenant.entity';
import { Inbox } from '../chats/inbox.entity';
import { MediaStorageService } from '../media/media-storage.service';
import { BillingService } from '../billing/billing.service';
import { WhatsAppService } from '../campaigns/whatsapp.service';
import { CursosScoringService, RawAnswer } from './cursos-scoring.service';
import { CursosCrmService } from './cursos-crm.service';
import { CursosOtpService, OtpChannel } from './cursos-otp.service';
import {
  Course,
  CourseLesson,
  CourseQuiz,
  CourseQuestion,
  CourseEnrollment,
  CourseLessonProgress,
  CourseQuizAttempt,
  CourseCertificate,
  LessonMaterial,
} from './entities';
import {
  CreateCourseDto,
  UpdateCourseDto,
  CreateLessonDto,
  UpdateLessonDto,
  CreateQuizDto,
  UpdateQuizDto,
  CreateQuestionDto,
  UpdateQuestionDto,
  AddMaterialDto,
} from './dto';

/** Acción de créditos que se cobra al completar una clase (aprobada o no). */
const CREDIT_ACTION_LESSON_COMPLETED = 'course_lesson_completed';

@Injectable()
export class CursosService {
  private readonly logger = new Logger(CursosService.name);

  constructor(
    @InjectRepository(Course) private readonly courseRepo: Repository<Course>,
    @InjectRepository(CourseLesson) private readonly lessonRepo: Repository<CourseLesson>,
    @InjectRepository(CourseQuiz) private readonly quizRepo: Repository<CourseQuiz>,
    @InjectRepository(CourseQuestion) private readonly questionRepo: Repository<CourseQuestion>,
    @InjectRepository(CourseEnrollment) private readonly enrollmentRepo: Repository<CourseEnrollment>,
    @InjectRepository(CourseLessonProgress) private readonly progressRepo: Repository<CourseLessonProgress>,
    @InjectRepository(CourseQuizAttempt) private readonly attemptRepo: Repository<CourseQuizAttempt>,
    @InjectRepository(CourseCertificate) private readonly certificateRepo: Repository<CourseCertificate>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(Inbox) private readonly inboxRepo: Repository<Inbox>,
    private readonly media: MediaStorageService,
    private readonly billing: BillingService,
    private readonly whatsapp: WhatsAppService,
    private readonly scoring: CursosScoringService,
    private readonly crm: CursosCrmService,
    private readonly otp: CursosOtpService,
  ) {}

  /**
   * Verifica que el módulo Cursos esté activo para el tenant. Se valida en el
   * servicio (y no con ModuleFeatureGuard a nivel de controlador) porque la
   * mayoría de endpoints administrativos solo reciben el id del curso, no el
   * tenantId; aquí resolvemos el tenant desde el propio recurso.
   */
  private async assertFeatureEnabled(tenantId: string): Promise<void> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Cuenta no encontrada');
    if (!tenant.features?.cursos) {
      throw new ForbiddenException('El módulo "cursos" no está activo para esta cuenta');
    }
  }

  // ─────────────────────────── CURSOS ───────────────────────────

  async findAll(tenantId: string): Promise<Course[]> {
    await this.assertFeatureEnabled(tenantId);
    return this.courseRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<Course> {
    const course = await this.courseRepo.findOne({ where: { id } });
    if (!course) throw new NotFoundException('Curso no encontrado');
    await this.assertFeatureEnabled(course.tenantId);
    return course;
  }

  async create(dto: CreateCourseDto & { managedByUserId?: string | null }): Promise<Course> {
    await this.assertFeatureEnabled(dto.tenantId);
    const course = this.courseRepo.create({
      tenantId: dto.tenantId,
      name: dto.name,
      description: dto.description ?? null,
      campaignId: dto.campaignId ?? null,
      managedByUserId: dto.managedByUserId ?? null,
      status: 'draft',
      rankingConfig: { metric: 'weighted_score', tieBreaker: 'completion_time', publishLeaderboard: true },
      settings: {
        passingScore: 60,
        requireSequential: true,
        collectDataAt: 'start',
        allowReviewAfterSubmit: true,
        allowOpenEnrollment: true,
      },
    });
    return this.courseRepo.save(course);
  }

  async update(id: string, dto: UpdateCourseDto): Promise<Course> {
    const course = await this.findOne(id);
    Object.assign(course, dto);
    return this.courseRepo.save(course);
  }

  async remove(id: string): Promise<{ deleted: boolean }> {
    const course = await this.findOne(id);
    // Limpiar material subido a R2 antes de borrar.
    const lessons = await this.lessonRepo.find({ where: { courseId: id } });
    for (const lesson of lessons) {
      for (const m of lesson.materials || []) {
        if (m.storagePath && m.url) await this.media.deleteByUrl(m.url);
      }
    }
    if (course.coverUrl) await this.media.deleteByUrl(course.coverUrl);
    await this.courseRepo.softRemove(course);
    return { deleted: true };
  }

  /** Publica el curso: valida estructura mínima y genera slug público. */
  async publish(id: string): Promise<Course> {
    const course = await this.findOne(id);
    const lessons = await this.lessonRepo.count({ where: { courseId: id } });
    if (lessons === 0) {
      throw new BadRequestException('El curso necesita al menos una clase para publicarse');
    }
    if (!course.slug) course.slug = await this.generateUniqueSlug(course.name);
    course.status = 'active';
    return this.courseRepo.save(course);
  }

  async archive(id: string): Promise<Course> {
    const course = await this.findOne(id);
    course.status = 'archived';
    return this.courseRepo.save(course);
  }

  async uploadCover(id: string, file: { buffer: Buffer; mimetype: string; originalname?: string }): Promise<Course> {
    const course = await this.findOne(id);
    if (!file?.mimetype?.startsWith('image/')) {
      throw new BadRequestException('La portada debe ser una imagen');
    }
    const stored = await this.media.uploadBuffer(file.buffer, {
      channel: 'courses',
      tenantId: course.tenantId,
      conversationId: course.id,
      messageId: 'cover',
      mimeType: file.mimetype,
      filename: file.originalname,
      imageProfile: 'email',
    });
    if (!stored) throw new BadRequestException('No se pudo subir la imagen (storage no configurado)');
    if (course.coverUrl) await this.media.deleteByUrl(course.coverUrl);
    course.coverUrl = stored.url;
    return this.courseRepo.save(course);
  }

  /**
   * Sube un asset del certificado (logo o firma) y guarda su URL en
   * settings.certificate. Reemplaza el anterior si existía (best-effort).
   */
  async uploadCertificateAsset(
    id: string,
    kind: 'logo' | 'signature' | 'stamp',
    file: { buffer: Buffer; mimetype: string; originalname?: string },
  ): Promise<Course> {
    const course = await this.findOne(id);
    if (!file?.mimetype?.startsWith('image/')) {
      throw new BadRequestException('El archivo debe ser una imagen');
    }
    const stored = await this.media.uploadBuffer(file.buffer, {
      channel: 'courses',
      tenantId: course.tenantId,
      conversationId: course.id,
      messageId: `certificate-${kind}`,
      mimeType: file.mimetype,
      filename: file.originalname,
      imageProfile: 'email',
    });
    if (!stored) throw new BadRequestException('No se pudo subir la imagen (storage no configurado)');

    const settings = course.settings ?? {};
    const certificate = settings.certificate ?? {};
    const prevAsset = certificate[kind] ?? {};
    // Reemplazar la imagen anterior (best-effort), conservando posición/tamaño.
    if (prevAsset.url && prevAsset.url !== stored.url) {
      await this.media.deleteByUrl(prevAsset.url).catch(() => undefined);
    }

    // Posición/tamaño por defecto según el tipo, la primera vez que se sube.
    const defaults: Record<string, { x: number; y: number; size: number }> = {
      logo: { x: 50, y: 14, size: 16 },
      signature: { x: 22, y: 80, size: 20 },
      stamp: { x: 78, y: 78, size: 18 },
    };
    const d = defaults[kind];
    const nextAsset = {
      url: stored.url,
      x: prevAsset.x ?? d.x,
      y: prevAsset.y ?? d.y,
      size: prevAsset.size ?? d.size,
      visible: prevAsset.visible ?? true,
    };

    course.settings = { ...settings, certificate: { ...certificate, [kind]: nextAsset } };
    return this.courseRepo.save(course);
  }

  // ─────────────────────────── CLASES ───────────────────────────

  listLessons(courseId: string): Promise<CourseLesson[]> {
    return this.lessonRepo.find({ where: { courseId }, order: { order: 'ASC' } });
  }

  async createLesson(courseId: string, dto: CreateLessonDto): Promise<CourseLesson> {
    const course = await this.findOne(courseId);
    const count = await this.lessonRepo.count({ where: { courseId } });
    const lesson = this.lessonRepo.create({
      tenantId: course.tenantId,
      courseId,
      title: dto.title,
      description: dto.description ?? null,
      order: dto.order ?? count,
      materials: [],
      status: 'draft',
    });
    const saved = await this.lessonRepo.save(lesson);
    // Crear automáticamente el quiz de la clase (vacío, en draft).
    await this.quizRepo.save(
      this.quizRepo.create({
        tenantId: course.tenantId,
        courseId,
        lessonId: saved.id,
        kind: 'lesson_quiz',
        title: `Evaluación: ${dto.title}`,
        status: 'draft',
      }),
    );
    return saved;
  }

  async getLesson(id: string): Promise<CourseLesson> {
    const lesson = await this.lessonRepo.findOne({ where: { id } });
    if (!lesson) throw new NotFoundException('Clase no encontrada');
    return lesson;
  }

  async updateLesson(id: string, dto: UpdateLessonDto): Promise<CourseLesson> {
    const lesson = await this.getLesson(id);
    Object.assign(lesson, dto);
    return this.lessonRepo.save(lesson);
  }

  async removeLesson(id: string): Promise<{ deleted: boolean }> {
    const lesson = await this.getLesson(id);
    for (const m of lesson.materials || []) {
      if (m.storagePath && m.url) await this.media.deleteByUrl(m.url);
    }
    await this.questionRepo.delete({ lessonId: id });
    await this.quizRepo.delete({ lessonId: id });
    await this.lessonRepo.remove(lesson);
    return { deleted: true };
  }

  async reorderLessons(courseId: string, ids: string[]): Promise<{ ok: boolean }> {
    await Promise.all(
      ids.map((id, index) => this.lessonRepo.update({ id, courseId }, { order: index })),
    );
    return { ok: true };
  }

  // ─────────────────────────── MATERIAL ───────────────────────────

  async addMaterial(lessonId: string, dto: AddMaterialDto): Promise<CourseLesson> {
    const lesson = await this.getLesson(lessonId);
    const material: LessonMaterial = {
      id: randomUUID(),
      type: dto.type as LessonMaterial['type'],
      title: dto.title,
      url: dto.url,
      content: dto.content,
      durationSec: dto.durationSec,
      required: dto.required ?? false,
      order: (lesson.materials?.length ?? 0),
    };
    lesson.materials = [...(lesson.materials || []), material];
    return this.lessonRepo.save(lesson);
  }

  /** Sube un archivo (video, PDF, imagen) como material de la clase. */
  async uploadMaterialFile(
    lessonId: string,
    file: { buffer: Buffer; mimetype: string; originalname?: string; size?: number },
    meta: { title?: string; required?: boolean },
  ): Promise<CourseLesson> {
    const lesson = await this.getLesson(lessonId);
    if (!file?.buffer) throw new BadRequestException('Archivo requerido');

    const stored = await this.media.uploadBuffer(file.buffer, {
      channel: 'courses',
      tenantId: lesson.tenantId,
      conversationId: lesson.courseId,
      messageId: lesson.id,
      mimeType: file.mimetype,
      filename: file.originalname,
      imageProfile: 'email',
    });
    if (!stored) throw new BadRequestException('No se pudo subir el archivo (storage no configurado)');

    const type: LessonMaterial['type'] = file.mimetype.startsWith('video/')
      ? 'video_upload'
      : file.mimetype.startsWith('image/')
        ? 'image'
        : 'document';

    const material: LessonMaterial = {
      id: randomUUID(),
      type,
      title: meta.title || file.originalname || 'Material',
      url: stored.url,
      storagePath: stored.path,
      mimeType: stored.mimeType,
      sizeBytes: stored.size,
      required: meta.required ?? false,
      order: lesson.materials?.length ?? 0,
    };
    lesson.materials = [...(lesson.materials || []), material];
    return this.lessonRepo.save(lesson);
  }

  async removeMaterial(lessonId: string, materialId: string): Promise<CourseLesson> {
    const lesson = await this.getLesson(lessonId);
    const material = (lesson.materials || []).find((m) => m.id === materialId);
    if (material?.storagePath && material.url) await this.media.deleteByUrl(material.url);
    lesson.materials = (lesson.materials || []).filter((m) => m.id !== materialId);
    return this.lessonRepo.save(lesson);
  }

  // ─────────────────────────── QUIZZES ───────────────────────────

  listQuizzes(courseId: string): Promise<CourseQuiz[]> {
    return this.quizRepo.find({ where: { courseId }, order: { kind: 'ASC', createdAt: 'ASC' } });
  }

  async createQuiz(courseId: string, dto: CreateQuizDto): Promise<CourseQuiz> {
    const course = await this.findOne(courseId);
    if (dto.kind === 'final_exam') {
      const existing = await this.quizRepo.findOne({ where: { courseId, kind: 'final_exam' } });
      if (existing) throw new BadRequestException('El curso ya tiene un examen final');
    }
    const quiz = this.quizRepo.create({
      tenantId: course.tenantId,
      courseId,
      kind: dto.kind,
      lessonId: dto.kind === 'lesson_quiz' ? (dto.lessonId ?? null) : null,
      title: dto.title ?? (dto.kind === 'final_exam' ? 'Examen final' : 'Evaluación'),
      description: dto.description ?? null,
      weightInCourse: dto.kind === 'final_exam' ? 2 : 1,
    });
    return this.quizRepo.save(quiz);
  }

  async getQuiz(id: string): Promise<CourseQuiz> {
    const quiz = await this.quizRepo.findOne({ where: { id } });
    if (!quiz) throw new NotFoundException('Evaluación no encontrada');
    return quiz;
  }

  async updateQuiz(id: string, dto: UpdateQuizDto): Promise<CourseQuiz> {
    const quiz = await this.getQuiz(id);
    Object.assign(quiz, dto);
    return this.quizRepo.save(quiz);
  }

  // ─────────────────────────── PREGUNTAS ───────────────────────────

  listQuestions(courseId: string, quizId?: string): Promise<CourseQuestion[]> {
    const where: any = { courseId };
    if (quizId) where.quizId = quizId;
    return this.questionRepo.find({ where, order: { order: 'ASC' } });
  }

  async createQuestion(courseId: string, dto: CreateQuestionDto): Promise<CourseQuestion> {
    const course = await this.findOne(courseId);
    const quiz = await this.getQuiz(dto.quizId);
    const count = await this.questionRepo.count({ where: { quizId: dto.quizId } });
    const question = this.questionRepo.create({
      tenantId: course.tenantId,
      courseId,
      quizId: dto.quizId,
      lessonId: quiz.lessonId,
      isFinalExam: quiz.kind === 'final_exam',
      type: dto.type,
      prompt: dto.prompt,
      options: this.normalizeOptions(dto.options),
      correctAnswer: dto.correctAnswer ?? null,
      points: dto.points ?? 1,
      order: dto.order ?? count,
    });
    return this.questionRepo.save(question);
  }

  async getQuestion(id: string): Promise<CourseQuestion> {
    const q = await this.questionRepo.findOne({ where: { id } });
    if (!q) throw new NotFoundException('Pregunta no encontrada');
    return q;
  }

  async updateQuestion(id: string, dto: UpdateQuestionDto): Promise<CourseQuestion> {
    const q = await this.getQuestion(id);
    if (dto.options) dto.options = this.normalizeOptions(dto.options) as any;
    Object.assign(q, dto);
    return this.questionRepo.save(q);
  }

  async removeQuestion(id: string): Promise<{ deleted: boolean }> {
    await this.questionRepo.delete(id);
    return { deleted: true };
  }

  async reorderQuestions(quizId: string, ids: string[]): Promise<{ ok: boolean }> {
    await Promise.all(ids.map((id, index) => this.questionRepo.update({ id, quizId }, { order: index })));
    return { ok: true };
  }

  private normalizeOptions(
    options?: Array<{ id?: string; text: string; isCorrect: boolean; weight?: number }>,
  ) {
    return (options || []).map((o) => ({
      id: o.id || randomUUID(),
      text: o.text,
      isCorrect: !!o.isCorrect,
      weight: o.weight,
    }));
  }

  // ─────────────────────────── INSCRIPCIONES ───────────────────────────

  listEnrollments(courseId: string): Promise<CourseEnrollment[]> {
    return this.enrollmentRepo.find({ where: { courseId }, order: { weightedScore: 'DESC' } });
  }

  /** Inscribe contactos del CRM (manual o masivo). Idempotente por recordId. */
  async createEnrollments(
    courseId: string,
    recordIds: string[],
    campaignId?: string | null,
  ): Promise<CourseEnrollment[]> {
    const course = await this.findOne(courseId);
    const existing = await this.enrollmentRepo.find({
      where: { courseId, recordId: In(recordIds) },
    });
    const existingIds = new Set(existing.map((e) => e.recordId));
    const toCreate = recordIds
      .filter((rid) => !existingIds.has(rid))
      .map((recordId) =>
        this.enrollmentRepo.create({
          tenantId: course.tenantId,
          courseId,
          recordId,
          campaignId: campaignId ?? course.campaignId ?? null,
          accessToken: this.generateToken(),
          status: 'invited',
          participantData: {},
        }),
      );
    const saved = toCreate.length ? await this.enrollmentRepo.save(toCreate) : [];
    await this.refreshEnrollmentCount(courseId);
    return [...existing, ...saved];
  }

  async getEnrollment(id: string): Promise<CourseEnrollment> {
    const e = await this.enrollmentRepo.findOne({ where: { id } });
    if (!e) throw new NotFoundException('Inscripción no encontrada');
    return e;
  }

  private async refreshEnrollmentCount(courseId: string): Promise<void> {
    const count = await this.enrollmentRepo.count({ where: { courseId } });
    await this.courseRepo.update({ id: courseId }, { enrollmentCount: count });
  }

  // ─────────────────────────── ENLACE PÚBLICO ───────────────────────────

  /**
   * Vista del participante: estructura del curso (sin respuestas correctas) +
   * su progreso.
   *
   * - Con token: retoma la inscripción existente (enlaces personales / campañas).
   * - Sin token: si el curso permite inscripción abierta (default), crea una
   *   inscripción anónima al vuelo y devuelve su accessToken para que el
   *   frontend lo persista y continúe el flujo (llenar datos → curso). Así el
   *   enlace genérico /c/:slug funciona para cualquiera, sin bloquear.
   */
  async getPublicCourse(slug: string, token?: string) {
    const course = await this.courseRepo.findOne({
      where: { slug, status: 'active' },
      relations: { tenant: true },
    });
    if (!course) throw new NotFoundException('Curso no disponible');
    this.assertWithinWindow(course);

    // El acceso a los cursos se hace SIEMPRE desde el portal del tenant, que
    // provee el token de inscripción (ya verificado). Sin token no se crea nada.
    let enrollment: CourseEnrollment | null = null;
    if (token) {
      enrollment = await this.resolveEnrollment(course, token);
    }
    const lessons = await this.lessonRepo.find({
      where: { courseId: course.id, status: 'published' },
      order: { order: 'ASC' },
    });
    const quizzes = await this.quizRepo.find({ where: { courseId: course.id, status: 'active' } });
    const progress = enrollment
      ? await this.progressRepo.find({ where: { enrollmentId: enrollment.id } })
      : [];

    // Estado de intentos por quiz (clases y examen final) para esta inscripción:
    // cuántos intentos finalizados y el mejor resultado. El frontend lo usa para
    // mostrar "ya presentaste / sin intentos" en vez de dejar reintentar.
    const attempts = enrollment
      ? await this.attemptRepo.find({
          where: { enrollmentId: enrollment.id, status: In(['graded', 'submitted', 'expired']) },
        })
      : [];
    const quizStateById = new Map<string, { usedAttempts: number; bestPercentage: number; passed: boolean }>();
    for (const a of attempts) {
      const cur = quizStateById.get(a.quizId) ?? { usedAttempts: 0, bestPercentage: 0, passed: false };
      cur.usedAttempts += 1;
      cur.bestPercentage = Math.max(cur.bestPercentage, Number(a.percentage));
      cur.passed = cur.passed || a.passed;
      quizStateById.set(a.quizId, cur);
    }
    const quizMeta = (q?: CourseQuiz) => {
      const meta = this.publicQuizMeta(q);
      if (!meta || !q) return meta;
      const st = quizStateById.get(q.id);
      return {
        ...meta,
        usedAttempts: st?.usedAttempts ?? 0,
        attemptsLeft: Math.max(0, q.maxAttempts - (st?.usedAttempts ?? 0)),
        bestPercentage: st?.bestPercentage ?? null,
        passed: st?.passed ?? false,
        presented: (st?.usedAttempts ?? 0) > 0,
      };
    };

    // Certificado ya emitido para este participante en este curso (si existe).
    const certificate =
      enrollment?.recordId
        ? await this.certificateRepo.findOne({
            where: { courseId: course.id, recordId: enrollment.recordId },
          })
        : null;

    return {
      course: this.publicCourseView(course),
      lessons: lessons.map((l) => ({
        id: l.id,
        title: l.title,
        description: l.description,
        order: l.order,
        minSecondsBeforeQuiz: l.minSecondsBeforeQuiz,
        materials: l.materials,
        quiz: quizMeta(quizzes.find((q) => q.lessonId === l.id)),
      })),
      finalExam: quizMeta(quizzes.find((q) => q.kind === 'final_exam')),
      enrollment: enrollment ? this.publicEnrollmentView(enrollment) : null,
      certificate: certificate ? this.publicCertificateView(certificate) : null,
      progress: progress.map((p) => ({
        lessonId: p.lessonId,
        status: p.status,
        quizScore: p.quizScore,
        attemptsUsed: p.attemptsUsed,
        watchedMaterials: p.watchedMaterials ?? [],
      })),
    };
  }

  /** Guarda los datos del participante y los vincula al CRM. */
  async saveParticipant(slug: string, token: string, participantData: Record<string, any>) {
    const course = await this.requireActiveCourse(slug);
    const enrollment = await this.resolveEnrollment(course, token);
    enrollment.participantData = { ...enrollment.participantData, ...participantData };
    const recordId = await this.crm.attributeParticipant(course, enrollment.participantData);
    if (recordId) enrollment.recordId = recordId;
    if (enrollment.status === 'invited') {
      enrollment.status = 'in_progress';
      enrollment.startedAt = enrollment.startedAt ?? new Date();
    }
    await this.enrollmentRepo.save(enrollment);
    return { ok: true, recordId: enrollment.recordId };
  }

  // ─────────────────────────── VERIFICACIÓN (OTP) ───────────────────────────

  /** Solicita un código de verificación para el email/teléfono del participante. */
  async requestOtp(slug: string, token: string, channel: OtpChannel, destination: string) {
    const course = await this.requireActiveCourse(slug);
    const enrollment = await this.resolveEnrollment(course, token);
    return this.otp.request(course, enrollment.id, channel, destination);
  }

  /**
   * Verifica el código. Si es válido, busca el contacto por email/teléfono:
   *  - Existe: lo atribuye a la inscripción y marca verificado (needsData=false).
   *  - No existe: devuelve needsData=true + los campos a pedir para crearlo.
   */
  async verifyOtp(slug: string, token: string, otpId: string, code: string) {
    const course = await this.requireActiveCourse(slug);
    const enrollment = await this.resolveEnrollment(course, token);
    const { channel, destination } = await this.otp.verify(otpId, code);

    // Guardar el dato verificado en participantData (email/phone).
    const verifiedField = channel === 'email' ? 'email' : 'phone';
    enrollment.participantData = {
      ...enrollment.participantData,
      [verifiedField]: destination,
      verifiedChannel: channel,
    };

    const existing = await this.crm.findByEmailOrPhone(course.tenantId, channel, destination);
    if (existing) {
      enrollment.recordId = existing.id;
      if (enrollment.status === 'invited') {
        enrollment.status = 'in_progress';
        enrollment.startedAt = enrollment.startedAt ?? new Date();
      }
      await this.enrollmentRepo.save(enrollment);
      return { verified: true, needsData: false, recordId: existing.id };
    }

    // No existe: pedir los datos configurados para crear el contacto.
    await this.enrollmentRepo.save(enrollment);
    return {
      verified: true,
      needsData: true,
      fields: await this.crm.enrichEnrollmentFields(
        course.tenantId,
        course.settings?.enrollmentFields,
      ),
      prefill: { [verifiedField]: destination },
    };
  }

  /** Crea el contacto con los datos entregados y lo vincula a la inscripción. */
  async completeEnrollmentData(slug: string, token: string, participantData: Record<string, any>) {
    const course = await this.requireActiveCourse(slug);
    const enrollment = await this.resolveEnrollment(course, token);
    const merged = { ...enrollment.participantData, ...participantData };
    enrollment.participantData = merged;

    // Si ya hay un record (por si se reintenta), actualizarlo; si no, crear.
    const existing = enrollment.recordId
      ? await this.crm.findRecordById(enrollment.recordId)
      : null;
    const recordId = await this.crm.upsertFromParticipant(course, merged, existing);
    enrollment.recordId = recordId;
    if (enrollment.status === 'invited') {
      enrollment.status = 'in_progress';
      enrollment.startedAt = enrollment.startedAt ?? new Date();
    }
    await this.enrollmentRepo.save(enrollment);
    return { ok: true, recordId };
  }

  /** Marca material visto y acumula tiempo. */
  async viewMaterial(slug: string, token: string, lessonId: string, secondsSpent = 0) {
    const course = await this.requireActiveCourse(slug);
    const enrollment = await this.resolveEnrollment(course, token);
    const lesson = await this.getLesson(lessonId);
    if (lesson.courseId !== course.id) throw new BadRequestException('Clase inválida');
    await this.assertLessonUnlocked(course, enrollment, lessonId);

    let progress = await this.progressRepo.findOne({
      where: { enrollmentId: enrollment.id, lessonId },
    });
    if (!progress) {
      progress = this.progressRepo.create({
        tenantId: course.tenantId,
        enrollmentId: enrollment.id,
        courseId: course.id,
        lessonId,
        recordId: enrollment.recordId,
        status: 'material_viewed',
      });
    }
    progress.materialSecondsSpent += Math.max(0, Math.round(secondsSpent));
    if (progress.status === 'not_started') progress.status = 'material_viewed';
    progress.materialViewedAt = progress.materialViewedAt ?? new Date();
    await this.progressRepo.save(progress);
    return { ok: true };
  }

  /**
   * Marca un material como consumido (video visto al ~90%, lectura/PDF abierto).
   * Si la clase NO tiene quiz activo y ya se consumieron todos los materiales
   * requeridos, la clase se da por COMPLETADA (y se cobra el crédito).
   */
  async markMaterialWatched(slug: string, token: string, lessonId: string, materialId: string) {
    const course = await this.requireActiveCourse(slug);
    const enrollment = await this.resolveEnrollment(course, token);
    const lesson = await this.getLesson(lessonId);
    if (lesson.courseId !== course.id) throw new BadRequestException('Clase inválida');
    await this.assertLessonUnlocked(course, enrollment, lessonId);
    const material = (lesson.materials || []).find((m) => m.id === materialId);
    if (!material) throw new BadRequestException('Material inválido');

    let progress = await this.progressRepo.findOne({
      where: { enrollmentId: enrollment.id, lessonId },
    });
    if (!progress) {
      progress = this.progressRepo.create({
        tenantId: course.tenantId,
        enrollmentId: enrollment.id,
        courseId: course.id,
        lessonId,
        recordId: enrollment.recordId,
        status: 'material_viewed',
        watchedMaterials: [],
      });
    }
    const watched = new Set(progress.watchedMaterials || []);
    watched.add(materialId);
    progress.watchedMaterials = [...watched];
    if (progress.status === 'not_started') progress.status = 'material_viewed';
    progress.materialViewedAt = progress.materialViewedAt ?? new Date();

    // ¿La clase tiene quiz activo? Si lo tiene, la completa el quiz, no el material.
    const quiz = await this.quizRepo.findOne({
      where: { courseId: course.id, lessonId, kind: 'lesson_quiz', status: 'active' },
    });

    let lessonCompleted = false;
    if (!quiz) {
      // Clase sin quiz: completada cuando todos los materiales REQUERIDOS están vistos.
      const required = (lesson.materials || []).filter((m) => m.required);
      // Si no hay materiales marcados como requeridos, basta con ver al menos uno.
      const target = required.length > 0 ? required : lesson.materials || [];
      const allWatched = target.every((m) => watched.has(m.id));
      if (allWatched && progress.status !== 'quiz_completed') {
        progress.status = 'quiz_completed';
        progress.quizCompletedAt = new Date();
        lessonCompleted = true;
        if (!progress.creditCharged) {
          const charged = await this.chargeLessonCredit(course.tenantId, enrollment.id, lessonId);
          if (charged) progress.creditCharged = true;
        }
      }
    }

    await this.progressRepo.save(progress);

    if (lessonCompleted) {
      await this.recomputeEnrollment(enrollment.id);
      await this.recomputeRanking(course.id);
    }
    return { ok: true, lessonCompleted };
  }

  /**
   * Inicia un intento de quiz. Valida secuencialidad, intentos disponibles,
   * tiempo mínimo de material, y fija startedAt en servidor. Devuelve las
   * preguntas SIN la respuesta correcta.
   */
  async startAttempt(slug: string, token: string, quizId: string) {
    const course = await this.requireActiveCourse(slug);
    const enrollment = await this.resolveEnrollment(course, token);
    const quiz = await this.getQuiz(quizId);
    if (quiz.courseId !== course.id || quiz.status !== 'active') {
      throw new BadRequestException('Evaluación no disponible');
    }

    await this.assertPrerequisites(course, enrollment, quiz);

    // Si ya hay un intento EN CURSO (el participante entró y no envió), se
    // reutiliza en vez de crear uno nuevo. Así no se acumulan intentos huérfanos
    // ni se "gastan" intentos por recargar la página.
    const inProgress = await this.attemptRepo.findOne({
      where: { enrollmentId: enrollment.id, quizId, status: 'in_progress' },
      order: { createdAt: 'DESC' },
    });
    if (inProgress) {
      const existingQuestions = await this.questionRepo.find({
        where: { id: In(inProgress.servedQuestionIds) },
      });
      const orderMap = new Map(inProgress.servedQuestionIds.map((qid, i) => [qid, i]));
      existingQuestions.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
      return {
        attemptId: inProgress.id,
        startedAt: inProgress.startedAt,
        totalTimeLimitSec: quiz.totalTimeLimitSec,
        questions: existingQuestions.map((q) => this.publicQuestionView(q, quiz.shuffleOptions)),
      };
    }

    // Intentos ya consumidos (solo cuentan los finalizados).
    const used = await this.attemptRepo.count({
      where: { enrollmentId: enrollment.id, quizId, status: In(['submitted', 'graded', 'expired']) },
    });
    if (used >= quiz.maxAttempts) {
      throw new ForbiddenException('No quedan intentos disponibles para esta evaluación');
    }

    let questions = await this.questionRepo.find({ where: { quizId }, order: { order: 'ASC' } });
    if (quiz.shuffleQuestions) questions = this.shuffle(questions);

    const attempt = this.attemptRepo.create({
      tenantId: course.tenantId,
      enrollmentId: enrollment.id,
      courseId: course.id,
      quizId,
      lessonId: quiz.lessonId,
      recordId: enrollment.recordId,
      attemptNumber: used + 1,
      status: 'in_progress',
      startedAt: new Date(),
      servedQuestionIds: questions.map((q) => q.id),
      answers: [],
    });
    const saved = await this.attemptRepo.save(attempt);

    return {
      attemptId: saved.id,
      startedAt: saved.startedAt,
      totalTimeLimitSec: quiz.totalTimeLimitSec,
      questions: questions.map((q) => this.publicQuestionView(q, quiz.shuffleOptions)),
    };
  }

  /**
   * Envía un intento. La corrección y los tiempos se validan en servidor: el
   * tiempo total se compara contra startedAt, y los tiempos por pregunta no
   * pueden exceder el total transcurrido. Cobra el crédito por clase completada.
   */
  async submitAttempt(
    slug: string,
    token: string,
    attemptId: string,
    answers: RawAnswer[],
  ) {
    const course = await this.requireActiveCourse(slug);
    const enrollment = await this.resolveEnrollment(course, token);
    const attempt = await this.attemptRepo.findOne({ where: { id: attemptId } });
    if (!attempt || attempt.enrollmentId !== enrollment.id) {
      throw new NotFoundException('Intento no encontrado');
    }
    if (attempt.status !== 'in_progress') {
      throw new BadRequestException('Este intento ya fue enviado');
    }

    const quiz = await this.getQuiz(attempt.quizId);
    const questions = await this.questionRepo.find({
      where: { id: In(attempt.servedQuestionIds) },
    });
    const orderMap = new Map(attempt.servedQuestionIds.map((id, i) => [id, i]));
    questions.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));

    const submittedAt = new Date();
    const elapsedSec = Math.round((submittedAt.getTime() - (attempt.startedAt?.getTime() ?? submittedAt.getTime())) / 1000);
    const overTotalLimit = quiz.totalTimeLimitSec != null && elapsedSec > quiz.totalTimeLimitSec;

    // Acotar los tiempos declarados por pregunta al tiempo real transcurrido.
    const safeAnswers: RawAnswer[] = answers.map((a) => ({
      questionId: a.questionId,
      answer: a.answer,
      timeTakenSec: Math.min(Math.max(0, a.timeTakenSec ?? 0), Math.max(elapsedSec, 0)),
    }));

    const result = this.scoring.grade(questions, overTotalLimit ? [] : safeAnswers, quiz);

    attempt.status = overTotalLimit ? 'expired' : 'graded';
    attempt.answers = result.answers;
    attempt.score = result.score;
    attempt.maxScore = result.maxScore;
    attempt.percentage = result.percentage;
    attempt.passed = result.percentage >= Number(quiz.passingScore);
    attempt.submittedAt = submittedAt;
    attempt.durationSec = Math.max(0, elapsedSec);
    await this.attemptRepo.save(attempt);

    // Actualizar progreso de clase y cobrar crédito (una sola vez por clase).
    if (quiz.kind === 'lesson_quiz' && quiz.lessonId) {
      await this.updateLessonProgress(course, enrollment, quiz, attempt);
    }

    // Recalcular agregados e insignias del ranking.
    await this.recomputeEnrollment(enrollment.id);
    await this.recomputeRanking(course.id);

    const showResults = quiz.showResultsPolicy === 'immediately';
    return {
      attemptId: attempt.id,
      submitted: true,
      expired: overTotalLimit,
      passed: attempt.passed,
      ...(showResults
        ? {
            score: attempt.score,
            maxScore: attempt.maxScore,
            percentage: attempt.percentage,
            answers: course.settings?.allowReviewAfterSubmit ? attempt.answers : undefined,
          }
        : {}),
    };
  }

  // ─────────────────────────── RANKING / ANALÍTICA ───────────────────────────

  async leaderboard(courseId: string, limit = 100) {
    const course = await this.findOne(courseId);
    const metric = course.rankingConfig?.metric ?? 'weighted_score';
    const enrollments = await this.sortedEnrollments(courseId, metric, course);
    return {
      metric,
      prizes: course.rankingConfig?.prizes ?? [],
      entries: enrollments.slice(0, limit).map((e, i) => ({
        rank: i + 1,
        enrollmentId: e.id,
        recordId: e.recordId,
        participant: this.participantLabel(e),
        totalScore: e.totalScore,
        weightedScore: e.weightedScore,
        accuracyPct: e.accuracyPct,
        completedLessons: e.completedLessons,
        totalTimeSpentSec: e.totalTimeSpentSec,
        status: e.status,
        completedAt: e.completedAt,
      })),
    };
  }

  // ─────────────────────────── CONFIG DE VERIFICACIÓN (admin) ───────────────────────────

  /** Inboxes de WhatsApp conectados del tenant, para el selector del OTP. */
  async listWhatsappInboxes(tenantId: string) {
    const inboxes = await this.inboxRepo.find({
      where: { tenantId, channel: 'whatsapp' },
      order: { createdAt: 'DESC' },
    });
    return inboxes.map((i) => ({
      id: i.id,
      name: i.name,
      status: i.status,
      connected: i.status === 'connected' && !!i.accessToken && !!i.phoneNumberId,
    }));
  }

  /** Plantillas de WhatsApp aprobadas de un inbox, para el selector del OTP. */
  async listWhatsappTemplates(tenantId: string, inboxId: string) {
    const inbox = await this.inboxRepo.findOne({ where: { id: inboxId } });
    if (!inbox || inbox.tenantId !== tenantId) {
      throw new NotFoundException('Canal de WhatsApp no encontrado');
    }
    const templates = await this.whatsapp.getTemplates({
      metaToken: inbox.accessToken || '',
      metaBusinessId: inbox.wabaId || '',
    });
    // Exponer variables del cuerpo para que el admin elija la del código.
    return templates.map((t) => {
      const body = (t.components || []).find((c: any) => c?.type === 'BODY');
      const text: string = body?.text || '';
      const varCount = (text.match(/\{\{\s*\d+\s*\}\}/g) || []).length;
      return {
        name: t.name,
        language: t.language,
        category: t.category,
        bodyText: text,
        variableCount: varCount,
      };
    });
  }

  /** Catálogo de campos del CRM para mapear los datos de inscripción. */
  listCrmFields(tenantId: string) {
    return this.crm.listTargets(tenantId);
  }

  /**
   * Cursos de un contacto (para la card del detalle del contacto en el CRM):
   * inscripciones con calificación, estado y posición por curso.
   */
  async getRecordCourses(tenantId: string, recordId: string) {
    await this.assertFeatureEnabled(tenantId);
    const enrollments = await this.enrollmentRepo.find({
      where: { tenantId, recordId },
      order: { createdAt: 'DESC' },
    });
    const courseIds = enrollments.map((e) => e.courseId);
    const courses = courseIds.length
      ? await this.courseRepo.find({ where: { id: In(courseIds) } })
      : [];
    const byId = new Map(courses.map((c) => [c.id, c]));

    const items = enrollments.map((e) => ({
      courseId: e.courseId,
      courseName: byId.get(e.courseId)?.name ?? 'Curso',
      status: e.status, // invited | in_progress | completed | passed | failed
      weightedScore: e.weightedScore,
      accuracyPct: e.accuracyPct,
      completedLessons: e.completedLessons,
      rank: e.rank,
      startedAt: e.startedAt,
      completedAt: e.completedAt,
    }));

    const finished = enrollments.filter((e) => e.status === 'passed' || e.status === 'completed');
    const inProgress = enrollments.filter((e) => e.status === 'in_progress' || e.status === 'invited');
    const avgScore = finished.length
      ? this.round(finished.reduce((s, e) => s + Number(e.weightedScore), 0) / finished.length)
      : 0;

    return {
      courses: items,
      summary: {
        total: enrollments.length,
        completed: finished.length,
        inProgress: inProgress.length,
        avgScore,
      },
    };
  }

  /** Config del portal de academy (verificación + campos de inscripción). */
  async getAcademyConfig(tenantId: string) {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Cuenta no encontrada');
    return tenant.academyConfig ?? { verificationChannel: 'both' };
  }

  /** Actualiza (merge) la config del portal de academy. */
  async updateAcademyConfig(tenantId: string, patch: Record<string, any>) {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Cuenta no encontrada');
    tenant.academyConfig = { ...(tenant.academyConfig || {}), ...patch };
    await this.tenantRepo.save(tenant);
    return tenant.academyConfig;
  }

  /**
   * Sube el logo del portal (recortado en cuadrado por el frontend), lo
   * almacena y guarda su URL en `academyConfig.theme.logoUrl`. Devuelve la
   * config actualizada.
   */
  async uploadAcademyLogo(
    tenantId: string,
    file: { buffer: Buffer; mimetype: string; originalname?: string },
  ) {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Cuenta no encontrada');
    if (!file?.mimetype?.startsWith('image/')) {
      throw new BadRequestException('El logo debe ser una imagen');
    }
    const stored = await this.media.uploadBuffer(file.buffer, {
      channel: 'academy',
      tenantId,
      conversationId: tenantId,
      messageId: 'portal-logo',
      mimeType: file.mimetype,
      filename: file.originalname,
      imageProfile: 'email',
    });
    if (!stored) {
      throw new BadRequestException('No se pudo subir la imagen (storage no configurado)');
    }
    const cfg = tenant.academyConfig || {};
    const prevLogo = cfg.theme?.logoUrl;
    tenant.academyConfig = { ...cfg, theme: { ...cfg.theme, logoUrl: stored.url } };
    await this.tenantRepo.save(tenant);
    // Limpiar el logo anterior si existía (best-effort).
    if (prevLogo && prevLogo !== stored.url) {
      await this.media.deleteByUrl(prevLogo).catch(() => undefined);
    }
    return tenant.academyConfig;
  }

  /**
   * Sube la imagen de previsualización para redes (og:image) del portal
   * (recortada ~1.91:1 por el frontend) y guarda su URL en
   * `academyConfig.meta.ogImage`. Devuelve la config actualizada.
   */
  async uploadAcademyOgImage(
    tenantId: string,
    file: { buffer: Buffer; mimetype: string; originalname?: string },
  ) {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Cuenta no encontrada');
    if (!file?.mimetype?.startsWith('image/')) {
      throw new BadRequestException('La imagen debe ser un archivo de imagen');
    }
    const stored = await this.media.uploadBuffer(file.buffer, {
      channel: 'academy',
      tenantId,
      conversationId: tenantId,
      messageId: 'portal-og',
      mimeType: file.mimetype,
      filename: file.originalname,
      imageProfile: 'email',
    });
    if (!stored) {
      throw new BadRequestException('No se pudo subir la imagen (storage no configurado)');
    }
    const cfg = tenant.academyConfig || {};
    const prev = cfg.meta?.ogImage;
    tenant.academyConfig = { ...cfg, meta: { ...cfg.meta, ogImage: stored.url } };
    await this.tenantRepo.save(tenant);
    if (prev && prev !== stored.url) {
      await this.media.deleteByUrl(prev).catch(() => undefined);
    }
    return tenant.academyConfig;
  }

  /** Ranking para el enlace público: solo si el curso lo publica. */
  async publicLeaderboard(slug: string) {
    const course = await this.courseRepo.findOne({ where: { slug, status: 'active' } });
    if (!course) throw new NotFoundException('Curso no disponible');
    if (!course.rankingConfig?.publishLeaderboard) {
      return { metric: null, prizes: [], entries: [] };
    }
    return this.leaderboard(course.id, 50);
  }

  async analytics(courseId: string) {
    const course = await this.findOne(courseId);
    const [lessons, enrollments, quizzes] = await Promise.all([
      this.lessonRepo.count({ where: { courseId } }),
      this.enrollmentRepo.find({ where: { courseId } }),
      this.quizRepo.count({ where: { courseId } }),
    ]);
    const total = enrollments.length;
    const completed = enrollments.filter((e) => e.status === 'completed' || e.status === 'passed').length;
    const passed = enrollments.filter((e) => e.status === 'passed').length;
    const avgScore = total ? this.round(enrollments.reduce((s, e) => s + Number(e.weightedScore), 0) / total) : 0;
    const avgAccuracy = total ? this.round(enrollments.reduce((s, e) => s + Number(e.accuracyPct), 0) / total) : 0;
    return {
      courseId: course.id,
      name: course.name,
      lessons,
      quizzes,
      enrollments: total,
      completed,
      passed,
      completionRate: total ? this.round((completed / total) * 100) : 0,
      passRate: total ? this.round((passed / total) * 100) : 0,
      avgWeightedScore: avgScore,
      avgAccuracy: avgAccuracy,
    };
  }

  // ─────────────────────────── INTERNOS ───────────────────────────

  private async updateLessonProgress(
    course: Course,
    enrollment: CourseEnrollment,
    quiz: CourseQuiz,
    attempt: CourseQuizAttempt,
  ): Promise<void> {
    let progress = await this.progressRepo.findOne({
      where: { enrollmentId: enrollment.id, lessonId: quiz.lessonId! },
    });
    if (!progress) {
      progress = this.progressRepo.create({
        tenantId: course.tenantId,
        enrollmentId: enrollment.id,
        courseId: course.id,
        lessonId: quiz.lessonId!,
        recordId: enrollment.recordId,
      });
    }
    // Conservar el mejor puntaje entre intentos.
    const prevScore = progress.quizScore ?? -1;
    if (attempt.score > prevScore) {
      progress.quizScore = attempt.score;
      progress.quizMaxScore = attempt.maxScore;
    }
    progress.attemptsUsed += 1;
    progress.status = 'quiz_completed';
    progress.quizCompletedAt = new Date();

    // Cobrar crédito por clase completada (aprobada o no), una sola vez.
    if (!progress.creditCharged) {
      const charged = await this.chargeLessonCredit(course.tenantId, enrollment.id, quiz.lessonId!);
      if (charged) progress.creditCharged = true;
    }
    await this.progressRepo.save(progress);
  }

  /**
   * Cobra el crédito configurado para "clase completada". Si el tenant no tiene
   * costo configurado para la acción, no bloquea (devuelve false sin cobrar).
   */
  private async chargeLessonCredit(tenantId: string, enrollmentId: string, lessonId: string): Promise<boolean> {
    try {
      const cost = await this.billing.getEffectiveActionCost(tenantId, CREDIT_ACTION_LESSON_COMPLETED);
      if (cost === null) return false; // acción sin costo configurado => gratis
      await this.billing.consumeByAction(tenantId, CREDIT_ACTION_LESSON_COMPLETED, `${enrollmentId}:${lessonId}`);
      return true;
    } catch (err) {
      // No romper el flujo del participante por un fallo de cobro; se registra.
      this.logger.warn(`No se pudo cobrar crédito de clase (${tenantId}/${lessonId}): ${String(err)}`);
      return false;
    }
  }

  /** Recalcula los agregados de puntaje de una inscripción desde sus mejores intentos. */
  private async recomputeEnrollment(enrollmentId: string): Promise<void> {
    const enrollment = await this.enrollmentRepo.findOne({ where: { id: enrollmentId } });
    if (!enrollment) return;
    // Solo quizzes ACTIVOS cuentan para el curso (los draft no se pueden hacer).
    const quizzes = await this.quizRepo.find({
      where: { courseId: enrollment.courseId, status: 'active' },
    });
    const attempts = await this.attemptRepo.find({
      where: { enrollmentId, status: In(['graded', 'submitted']) },
    });

    // Mejor intento por quiz.
    const bestByQuiz = new Map<string, CourseQuizAttempt>();
    for (const a of attempts) {
      const prev = bestByQuiz.get(a.quizId);
      if (!prev || a.score > prev.score) bestByQuiz.set(a.quizId, a);
    }

    let totalScore = 0;
    let totalMax = 0;
    let weightedPct = 0;
    let weightSum = 0;
    let correct = 0;
    let answered = 0;
    let timeSpent = 0;

    for (const quiz of quizzes) {
      const best = bestByQuiz.get(quiz.id);
      const weight = Number(quiz.weightInCourse) || 0;
      weightSum += weight;
      if (!best) continue;
      totalScore += Number(best.score);
      totalMax += Number(best.maxScore);
      // Ponderado por el PORCENTAJE del quiz (base, acotado 0-100), no por el
      // score crudo (que incluye bonus y puede superar el máximo).
      const pct = Number(best.percentage) / 100;
      weightedPct += pct * weight;
      timeSpent += best.durationSec;
      for (const ans of best.answers) {
        answered += 1;
        if (ans.isCorrect) correct += 1;
      }
    }

    const completedLessons = await this.progressRepo.count({
      where: { enrollmentId, status: 'quiz_completed' },
    });

    enrollment.totalScore = this.round(totalScore);
    enrollment.maxPossibleScore = this.round(totalMax);
    enrollment.weightedScore = this.round(weightSum > 0 ? (weightedPct / weightSum) * 100 : 0);
    enrollment.accuracyPct = this.round(answered > 0 ? (correct / answered) * 100 : 0);
    enrollment.completedLessons = completedLessons;
    enrollment.totalTimeSpentSec = timeSpent;

    // Marcar completado si se cubrieron todos los quizzes del curso.
    const prevStatus = enrollment.status;
    let passedCourse: Course | null = null;
    if (quizzes.length > 0 && bestByQuiz.size >= quizzes.length) {
      const course = await this.findOne(enrollment.courseId);
      const passingScore = course.settings?.passingScore ?? 60;
      const didPass = enrollment.weightedScore >= passingScore;
      enrollment.status = didPass ? 'passed' : 'completed';
      enrollment.completedAt = enrollment.completedAt ?? new Date();
      if (didPass) passedCourse = course;
    } else if (enrollment.status === 'invited') {
      enrollment.status = 'in_progress';
    }

    await this.enrollmentRepo.save(enrollment);

    // Emitir certificado al APROBAR (transición hacia 'passed'). Idempotente:
    // issueCertificate no duplica si ya existe uno para (curso, contacto).
    if (passedCourse && prevStatus !== 'passed') {
      await this.issueCertificate(enrollment, passedCourse).catch((err) =>
        this.logger.error(`No se pudo emitir el certificado: ${err?.message ?? err}`),
      );
    }
  }

  /**
   * Emite (una sola vez) el certificado de aprobación de un curso para el
   * participante. Guarda un snapshot del nombre del participante, curso y tenant
   * para que el certificado sea estable. No hace nada si el certificado de
   * certificados está deshabilitado explícitamente en el curso, si no hay un
   * contacto resuelto (recordId), o si ya existe uno.
   */
  private async issueCertificate(
    enrollment: CourseEnrollment,
    course: Course,
  ): Promise<CourseCertificate | null> {
    // El tenant puede desactivar certificados por curso; por defecto están ON.
    if (course.settings?.certificate?.enabled === false) return null;
    if (!enrollment.recordId) return null;

    // Idempotencia: un certificado por (curso, contacto).
    const existing = await this.certificateRepo.findOne({
      where: { courseId: course.id, recordId: enrollment.recordId },
    });
    if (existing) return existing;

    const record = await this.crm.findRecordById(enrollment.recordId);
    const participantName =
      record?.fullName ||
      [record?.firstName, record?.lastName].filter(Boolean).join(' ') ||
      record?.email ||
      record?.phone ||
      this.participantLabel(enrollment);

    const tenant = await this.tenantRepo.findOne({ where: { id: course.tenantId } });

    const cert = this.certificateRepo.create({
      tenantId: course.tenantId,
      courseId: course.id,
      enrollmentId: enrollment.id,
      recordId: enrollment.recordId,
      serial: await this.generateCertificateSerial(),
      participantName: participantName.slice(0, 200),
      courseName: course.name.slice(0, 200),
      tenantName: (tenant?.name ?? 'Academy').slice(0, 200),
      score: enrollment.weightedScore,
      rank: enrollment.rank,
      config: course.settings?.certificate ?? null,
      issuedAt: new Date(),
    });
    try {
      return await this.certificateRepo.save(cert);
    } catch (err: any) {
      // Carrera: si otra ejecución lo creó a la vez (índice único), devolver el existente.
      if (err?.code === '23505') {
        return this.certificateRepo.findOne({
          where: { courseId: course.id, recordId: enrollment.recordId },
        });
      }
      throw err;
    }
  }

  /**
   * Genera (o devuelve) el certificado del participante bajo demanda, desde el
   * runner del curso con su token de inscripción. Solo se emite si el curso
   * está aprobado. Útil para participantes que aprobaron antes de que existiera
   * el sistema de certificados (emisión retroactiva controlada).
   */
  async issueCertificateByToken(slug: string, token: string) {
    const course = await this.requireActiveCourse(slug);
    const enrollment = await this.resolveEnrollment(course, token);
    if (enrollment.status !== 'passed') {
      throw new BadRequestException('El certificado solo está disponible al aprobar el curso');
    }
    if (!enrollment.recordId) {
      throw new BadRequestException('Completa tus datos para generar el certificado');
    }
    const cert = await this.issueCertificate(enrollment, course);
    if (!cert) {
      throw new BadRequestException('Los certificados no están habilitados para este curso');
    }
    return this.publicCertificateView(cert);
  }

  /** Vista pública de un certificado (lo que consume el frontend del portal). */
  private publicCertificateView(c: CourseCertificate) {
    return {
      id: c.id,
      serial: c.serial,
      participantName: c.participantName,
      courseName: c.courseName,
      tenantName: c.tenantName,
      score: Number(c.score),
      rank: c.rank,
      config: c.config ?? null,
      issuedAt: c.issuedAt,
    };
  }

  /** Genera un serial público legible y único (ej: CERT-7F3A-2K9D). */
  private async generateCertificateSerial(): Promise<string> {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin caracteres ambiguos
    const block = () =>
      Array.from(randomBytes(4))
        .map((b) => alphabet[b % alphabet.length])
        .join('')
        .slice(0, 4);
    for (let i = 0; i < 6; i++) {
      const serial = `CERT-${block()}-${block()}`;
      const clash = await this.certificateRepo.findOne({ where: { serial } });
      if (!clash) return serial;
    }
    // Fallback extremadamente improbable.
    return `CERT-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  /** Verifica públicamente un certificado por su serial. */
  async verifyCertificate(serial: string) {
    const cert = await this.certificateRepo.findOne({ where: { serial } });
    if (!cert) throw new NotFoundException('Certificado no encontrado');
    return {
      valid: true,
      serial: cert.serial,
      participantName: cert.participantName,
      courseName: cert.courseName,
      tenantName: cert.tenantName,
      score: Number(cert.score),
      issuedAt: cert.issuedAt,
    };
  }

  /** Recalcula la posición (rank) de todas las inscripciones del curso. */
  private async recomputeRanking(courseId: string): Promise<void> {
    const course = await this.findOne(courseId);
    const metric = course.rankingConfig?.metric ?? 'weighted_score';
    const sorted = await this.sortedEnrollments(courseId, metric, course);
    await Promise.all(
      sorted.map((e, i) => this.enrollmentRepo.update({ id: e.id }, { rank: i + 1 })),
    );
  }

  private async sortedEnrollments(
    courseId: string,
    metric: string,
    course: Course,
  ): Promise<CourseEnrollment[]> {
    const enrollments = await this.enrollmentRepo.find({ where: { courseId } });
    const tieBreaker = course.rankingConfig?.tieBreaker ?? 'completion_time';
    const primary = (e: CourseEnrollment): number => {
      switch (metric) {
        case 'total_score': return Number(e.totalScore);
        case 'accuracy': return Number(e.accuracyPct);
        case 'completion_time': return -Number(e.totalTimeSpentSec); // menos tiempo = mejor
        case 'weighted_score':
        default: return Number(e.weightedScore);
      }
    };
    return enrollments.sort((a, b) => {
      const diff = primary(b) - primary(a);
      if (diff !== 0) return diff;
      // Desempate.
      if (tieBreaker === 'completion_time') return a.totalTimeSpentSec - b.totalTimeSpentSec;
      if (tieBreaker === 'earliest_finish') {
        return (a.completedAt?.getTime() ?? Infinity) - (b.completedAt?.getTime() ?? Infinity);
      }
      return 0;
    });
  }

  /**
   * Verifica que una clase esté desbloqueada: si el curso es secuencial, todas
   * las clases publicadas anteriores deben estar completadas (quiz_completed).
   */
  private async assertLessonUnlocked(
    course: Course,
    enrollment: CourseEnrollment,
    lessonId: string,
  ): Promise<void> {
    if (!course.settings?.requireSequential) return;
    const lessons = await this.lessonRepo.find({
      where: { courseId: course.id, status: 'published' },
      order: { order: 'ASC' },
    });
    const idx = lessons.findIndex((l) => l.id === lessonId);
    if (idx <= 0) return; // la primera (o no encontrada) siempre desbloqueada
    const previousIds = lessons.slice(0, idx).map((l) => l.id);
    const done = await this.progressRepo.count({
      where: { enrollmentId: enrollment.id, lessonId: In(previousIds), status: 'quiz_completed' },
    });
    if (done < previousIds.length) {
      throw new ForbiddenException('Debes completar la clase anterior primero');
    }
  }

  private async assertPrerequisites(
    course: Course,
    enrollment: CourseEnrollment,
    quiz: CourseQuiz,
  ): Promise<void> {
    // Datos del participante requeridos si collectDataAt = 'start'.
    if (course.settings?.collectDataAt === 'start' && !enrollment.recordId) {
      throw new ForbiddenException('Debes completar tus datos antes de responder');
    }

    if (quiz.kind === 'lesson_quiz' && quiz.lessonId) {
      const lesson = await this.getLesson(quiz.lessonId);
      // Tiempo mínimo en el material.
      if (lesson.minSecondsBeforeQuiz > 0) {
        const progress = await this.progressRepo.findOne({
          where: { enrollmentId: enrollment.id, lessonId: lesson.id },
        });
        if (!progress || progress.materialSecondsSpent < lesson.minSecondsBeforeQuiz) {
          throw new ForbiddenException('Debes revisar el material antes de responder');
        }
      }
      // Secuencialidad: todas las clases anteriores completadas.
      if (course.settings?.requireSequential) {
        const prevLessons = await this.lessonRepo.find({
          where: { courseId: course.id, status: 'published' },
          order: { order: 'ASC' },
        });
        const idx = prevLessons.findIndex((l) => l.id === lesson.id);
        const required = prevLessons.slice(0, idx).map((l) => l.id);
        if (required.length) {
          const done = await this.progressRepo.count({
            where: { enrollmentId: enrollment.id, lessonId: In(required), status: 'quiz_completed' },
          });
          if (done < required.length) {
            throw new ForbiddenException('Debes completar las clases anteriores primero');
          }
        }
      }
    }

    if (quiz.kind === 'final_exam' && course.settings?.requireSequential) {
      // El examen final se habilita cuando TODAS las clases publicadas están
      // completadas (mismo criterio que el desbloqueo de clases en la lista).
      const publishedLessons = await this.lessonRepo.find({
        where: { courseId: course.id, status: 'published' },
        select: { id: true },
      });
      const lessonIds = publishedLessons.map((l) => l.id);
      const completed = lessonIds.length
        ? await this.progressRepo.count({
            where: { enrollmentId: enrollment.id, lessonId: In(lessonIds), status: 'quiz_completed' },
          })
        : 0;
      if (completed < lessonIds.length) {
        throw new ForbiddenException('Debes completar todas las clases antes del examen final');
      }
    }
  }

  private async resolveEnrollment(course: Course, token: string): Promise<CourseEnrollment> {
    if (!token) throw new ForbiddenException('Token de acceso requerido');
    let enrollment = await this.enrollmentRepo.findOne({
      where: { courseId: course.id, accessToken: token },
    });
    if (!enrollment) throw new NotFoundException('Inscripción no encontrada para este enlace');
    return enrollment;
  }

  private async requireActiveCourse(slug: string): Promise<Course> {
    const course = await this.courseRepo.findOne({ where: { slug, status: 'active' } });
    if (!course) throw new NotFoundException('Curso no disponible');
    this.assertWithinWindow(course);
    return course;
  }

  private assertWithinWindow(course: Course): void {
    const now = Date.now();
    const from = course.settings?.availableFrom ? Date.parse(course.settings.availableFrom) : null;
    const until = course.settings?.availableUntil ? Date.parse(course.settings.availableUntil) : null;
    if (from && now < from) throw new ForbiddenException('El curso aún no está disponible');
    if (until && now > until) throw new ForbiddenException('El curso ya no está disponible');
  }

  // ---- Vistas públicas (sin filtrar respuestas correctas) ----

  private publicCourseView(course: Course & { tenant?: { slug?: string } }) {
    return {
      id: course.id,
      name: course.name,
      description: course.description,
      coverUrl: course.coverUrl,
      slug: course.slug,
      tenantSlug: course.tenant?.slug ?? null,
      theme: course.theme,
      collectDataAt: course.settings?.collectDataAt ?? 'start',
      publishLeaderboard: course.rankingConfig?.publishLeaderboard ?? false,
      // Config de verificación expuesta al participante (solo lo necesario).
      verification: course.settings?.verification?.enabled
        ? { enabled: true, channel: course.settings.verification.channel ?? 'email' }
        : { enabled: false, channel: 'email' },
    };
  }

  private publicQuizMeta(quiz?: CourseQuiz) {
    if (!quiz) return null;
    return {
      id: quiz.id,
      kind: quiz.kind,
      title: quiz.title,
      description: quiz.description,
      totalTimeLimitSec: quiz.totalTimeLimitSec,
      passingScore: Number(quiz.passingScore),
      maxAttempts: quiz.maxAttempts,
    };
  }

  private publicQuestionView(q: CourseQuestion, shuffleOptions: boolean) {
    let options = (q.options || []).map((o) => ({ id: o.id, text: o.text }));
    if (shuffleOptions) options = this.shuffle(options);
    return {
      id: q.id,
      type: q.type,
      prompt: q.prompt,
      mediaUrl: q.mediaUrl,
      points: Number(q.points),
      timeLimitSec: q.timeLimitSec,
      options,
    };
  }

  private publicEnrollmentView(e: CourseEnrollment) {
    return {
      id: e.id,
      // Token de acceso para que el frontend persista la sesión del participante
      // y lo use en las llamadas siguientes (ver material, iniciar/enviar quiz).
      accessToken: e.accessToken,
      status: e.status,
      weightedScore: e.weightedScore,
      rank: e.rank,
      hasParticipantData: !!e.recordId,
    };
  }

  private participantLabel(e: CourseEnrollment): string {
    const d = e.participantData || {};
    return (
      d.fullName ||
      [d.firstName, d.lastName].filter(Boolean).join(' ') ||
      d.email ||
      d.phone ||
      'Participante'
    );
  }

  private generateToken(): string {
    return randomBytes(24).toString('hex');
  }

  private async generateUniqueSlug(name: string): Promise<string> {
    const base = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'curso';
    let slug = base;
    let i = 1;
    while (await this.courseRepo.findOne({ where: { slug } })) {
      slug = `${base}-${i++}`;
    }
    return slug;
  }

  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  private round(n: number): number {
    return Math.round(n * 100) / 100;
  }
}
