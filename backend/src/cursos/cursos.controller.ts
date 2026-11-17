import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantAccessGuard } from '../auth/tenant-access.guard';
import { Public } from '../auth/public.decorator';
import { CursosService } from './cursos.service';
import { CursosPortalService } from './cursos-portal.service';
import { TenantRefs, TenantResource, TenantResourceGuard } from '../auth/tenant-resource.guard';
import {
  CreateCourseDto,
  UpdateCourseDto,
  CreateLessonDto,
  UpdateLessonDto,
  ReorderDto,
  AddMaterialDto,
  CreateQuizDto,
  UpdateQuizDto,
  CreateQuestionDto,
  UpdateQuestionDto,
  CreateEnrollmentsDto,
  SubmitAttemptDto,
  SaveParticipantDto,
  ViewMaterialDto,
} from './dto';

/**
 * API del módulo Cursos.
 *
 * La gestión (back-office) está protegida por JWT + acceso al tenant + feature
 * flag 'cursos'. El flujo del participante va por el enlace público (@Public),
 * autenticado mediante un token opaco de inscripción.
 */
@Controller('cursos')
@UseGuards(JwtAuthGuard, TenantAccessGuard, TenantResourceGuard)
export class CursosController {
  constructor(
    private readonly cursos: CursosService,
    private readonly portal: CursosPortalService,
  ) {}

  // ───────── Portal público de academy (sin login) ─────────

  @Public()
  @Get('portal/:tenantSlug')
  getPortal(@Param('tenantSlug') tenantSlug: string) {
    return this.portal.getPortal(tenantSlug);
  }

  @Public()
  @Get('portal/:tenantSlug/overall-leaderboard')
  overallLeaderboard(@Param('tenantSlug') tenantSlug: string, @Query('limit') limit?: string) {
    return this.portal.overallLeaderboard(tenantSlug, limit ? Number(limit) : 50);
  }

  @Public()
  @Post('portal/:tenantSlug/identify/request')
  identifyRequest(
    @Param('tenantSlug') tenantSlug: string,
    @Body() body: { channel: 'email' | 'phone'; destination: string },
  ) {
    return this.portal.identifyRequest(tenantSlug, body.channel, body.destination);
  }

  @Public()
  @Post('portal/:tenantSlug/identify/verify')
  identifyVerify(
    @Param('tenantSlug') tenantSlug: string,
    @Body() body: { otpId: string; code: string },
  ) {
    return this.portal.identifyVerify(tenantSlug, body.otpId, body.code);
  }

  @Public()
  @Get('portal/:tenantSlug/me')
  myDashboard(@Param('tenantSlug') tenantSlug: string, @Query('pt') portalToken: string) {
    return this.portal.myDashboard(tenantSlug, portalToken);
  }

  @Public()
  @Get('portal/:tenantSlug/certificates')
  myCertificates(@Param('tenantSlug') tenantSlug: string, @Query('pt') portalToken: string) {
    return this.portal.myCertificates(tenantSlug, portalToken);
  }

  /** Verificación pública de autenticidad de un certificado por su serial. */
  @Public()
  @Get('certificates/verify/:serial')
  verifyCertificate(@Param('serial') serial: string) {
    return this.cursos.verifyCertificate(serial);
  }

  @Public()
  @Post('portal/:tenantSlug/complete-profile')
  completeProfile(
    @Param('tenantSlug') tenantSlug: string,
    @Query('pt') portalToken: string,
    @Body() body: { data: Record<string, any> },
  ) {
    return this.portal.completeProfile(tenantSlug, portalToken, body.data);
  }

  @Public()
  @Post('portal/:tenantSlug/enter-course')
  enterCourse(
    @Param('tenantSlug') tenantSlug: string,
    @Query('pt') portalToken: string,
    @Body() body: { courseId: string },
  ) {
    return this.portal.enterCourse(tenantSlug, portalToken, body.courseId);
  }

  // ───────── Enlace público del participante (sin login) ─────────

  @Public()
  @Get('public/:slug')
  getPublic(@Param('slug') slug: string, @Query('t') token?: string) {
    return this.cursos.getPublicCourse(slug, token);
  }

  @Public()
  @Get('public/:slug/leaderboard')
  publicLeaderboard(@Param('slug') slug: string) {
    return this.cursos.publicLeaderboard(slug);
  }

  /** Genera (o devuelve) el certificado del participante desde el runner. */
  @Public()
  @Post('public/:slug/certificate')
  issueCertificate(@Param('slug') slug: string, @Query('t') token: string) {
    return this.cursos.issueCertificateByToken(slug, token);
  }

  @Public()
  @Post('public/:slug/participant')
  saveParticipant(
    @Param('slug') slug: string,
    @Query('t') token: string,
    @Body() dto: SaveParticipantDto,
  ) {
    return this.cursos.saveParticipant(slug, token, dto.participantData);
  }

  // ---- Verificación por código (OTP) ----

  @Public()
  @Post('public/:slug/otp/request')
  requestOtp(
    @Param('slug') slug: string,
    @Query('t') token: string,
    @Body() body: { channel: 'email' | 'phone'; destination: string },
  ) {
    return this.cursos.requestOtp(slug, token, body.channel, body.destination);
  }

  @Public()
  @Post('public/:slug/otp/verify')
  verifyOtp(
    @Param('slug') slug: string,
    @Query('t') token: string,
    @Body() body: { otpId: string; code: string },
  ) {
    return this.cursos.verifyOtp(slug, token, body.otpId, body.code);
  }

  @Public()
  @Post('public/:slug/complete-data')
  completeData(
    @Param('slug') slug: string,
    @Query('t') token: string,
    @Body() dto: SaveParticipantDto,
  ) {
    return this.cursos.completeEnrollmentData(slug, token, dto.participantData);
  }

  @Public()
  @Post('public/:slug/lessons/:lessonId/view')
  viewMaterial(
    @Param('slug') slug: string,
    @Param('lessonId') lessonId: string,
    @Query('t') token: string,
    @Body() dto: ViewMaterialDto,
  ) {
    return this.cursos.viewMaterial(slug, token, lessonId, Number(dto.secondsSpent ?? 0));
  }

  @Public()
  @Post('public/:slug/lessons/:lessonId/materials/:materialId/watched')
  markMaterialWatched(
    @Param('slug') slug: string,
    @Param('lessonId') lessonId: string,
    @Param('materialId') materialId: string,
    @Query('t') token: string,
  ) {
    return this.cursos.markMaterialWatched(slug, token, lessonId, materialId);
  }

  @Public()
  @Post('public/:slug/quizzes/:quizId/start')
  startAttempt(
    @Param('slug') slug: string,
    @Param('quizId') quizId: string,
    @Query('t') token: string,
  ) {
    return this.cursos.startAttempt(slug, token, quizId);
  }

  @Public()
  @Post('public/:slug/attempts/:attemptId/submit')
  submitAttempt(
    @Param('slug') slug: string,
    @Param('attemptId') attemptId: string,
    @Query('t') token: string,
    @Body() dto: SubmitAttemptDto,
  ) {
    return this.cursos.submitAttempt(
      slug,
      token,
      attemptId,
      dto.answers.map((a) => ({ questionId: a.questionId, answer: a.answer, timeTakenSec: a.timeTakenSec })),
    );
  }

  // ───────── Gestión de cursos ─────────

  @Get()
  findAll(@Query('tenantId') tenantId: string) {
    return this.cursos.findAll(tenantId);
  }

  @Post()

  @TenantRefs({ kind: 'campaign', in: 'body', field: 'campaignId' })
  create(@Req() req: any, @Body() dto: CreateCourseDto) {
    return this.cursos.create({ ...dto, managedByUserId: req.user?.id ?? null });
  }

  @Get(':id')

  @TenantResource('course')
  findOne(@Param('id') id: string) {
    return this.cursos.findOne(id);
  }

  @Put(':id')

  @TenantResource('course')

  @TenantRefs({ kind: 'campaign', in: 'body', field: 'campaignId' })
  update(@Param('id') id: string, @Body() dto: UpdateCourseDto) {
    return this.cursos.update(id, dto);
  }

  @Delete(':id')

  @TenantResource('course')
  remove(@Param('id') id: string) {
    return this.cursos.remove(id);
  }

  @Post(':id/publish')

  @TenantResource('course')
  publish(@Param('id') id: string) {
    return this.cursos.publish(id);
  }

  @Post(':id/archive')

  @TenantResource('course')
  archive(@Param('id') id: string) {
    return this.cursos.archive(id);
  }

  @Post(':id/cover')

  @TenantResource('course')
  @UseInterceptors(FileInterceptor('file'))
  uploadCover(@Param('id') id: string, @UploadedFile() file: any) {
    return this.cursos.uploadCover(id, file);
  }

  @Post(':id/certificate-asset')

  @TenantResource('course')
  @UseInterceptors(FileInterceptor('file'))
  uploadCertificateAsset(
    @Param('id') id: string,
    @Query('kind') kind: 'logo' | 'signature' | 'stamp',
    @UploadedFile() file: any,
  ) {
    const k = kind === 'signature' || kind === 'stamp' ? kind : 'logo';
    return this.cursos.uploadCertificateAsset(id, k, file);
  }

  @Get(':id/analytics')

  @TenantResource('course')
  analytics(@Param('id') id: string) {
    return this.cursos.analytics(id);
  }

  // ---- Config de verificación (selectores del admin) ----

  @Get('config/whatsapp-inboxes')
  listInboxes(@Query('tenantId') tenantId: string) {
    return this.cursos.listWhatsappInboxes(tenantId);
  }

  @Get('config/whatsapp-templates')
  listTemplates(@Query('tenantId') tenantId: string, @Query('inboxId') inboxId: string) {
    return this.cursos.listWhatsappTemplates(tenantId, inboxId);
  }

  @Get('config/crm-fields')
  listCrmFields(@Query('tenantId') tenantId: string) {
    return this.cursos.listCrmFields(tenantId);
  }

  @Get('config/academy')
  getAcademyConfig(@Query('tenantId') tenantId: string) {
    return this.cursos.getAcademyConfig(tenantId);
  }

  /** Cursos de un contacto (card del detalle del contacto en el CRM). */
  @Get('record/:recordId/courses')
  @TenantRefs({ kind: 'record', in: 'params', field: 'recordId' })
  getRecordCourses(@Param('recordId') recordId: string, @Query('tenantId') tenantId: string) {
    return this.cursos.getRecordCourses(tenantId, recordId);
  }

  @Put('config/academy')
  updateAcademyConfig(@Query('tenantId') tenantId: string, @Body() body: Record<string, any>) {
    return this.cursos.updateAcademyConfig(tenantId, body);
  }

  @Post('config/academy/logo')
  @UseInterceptors(FileInterceptor('file'))
  uploadAcademyLogo(@Query('tenantId') tenantId: string, @UploadedFile() file: any) {
    return this.cursos.uploadAcademyLogo(tenantId, file);
  }

  @Post('config/academy/og-image')
  @UseInterceptors(FileInterceptor('file'))
  uploadAcademyOgImage(@Query('tenantId') tenantId: string, @UploadedFile() file: any) {
    return this.cursos.uploadAcademyOgImage(tenantId, file);
  }

  @Get(':id/leaderboard')

  @TenantResource('course')
  leaderboard(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.cursos.leaderboard(id, limit ? Number(limit) : 100);
  }

  // ───────── Clases ─────────

  @Get(':id/lessons')

  @TenantResource('course')
  listLessons(@Param('id') id: string) {
    return this.cursos.listLessons(id);
  }

  @Post(':id/lessons')

  @TenantResource('course')
  createLesson(@Param('id') id: string, @Body() dto: CreateLessonDto) {
    return this.cursos.createLesson(id, dto);
  }

  @Put(':id/lessons/reorder')

  @TenantResource('course')

  @TenantRefs({ kind: 'lesson', in: 'body', field: 'ids', many: true })
  reorderLessons(@Param('id') id: string, @Body() dto: ReorderDto) {
    return this.cursos.reorderLessons(id, dto.ids);
  }

  @Put(':id/lessons/:lessonId')

  @TenantResource('course')

  @TenantRefs({ kind: 'lesson', in: 'params', field: 'lessonId' })
  updateLesson(@Param('lessonId') lessonId: string, @Body() dto: UpdateLessonDto) {
    return this.cursos.updateLesson(lessonId, dto);
  }

  @Delete(':id/lessons/:lessonId')

  @TenantResource('course')

  @TenantRefs({ kind: 'lesson', in: 'params', field: 'lessonId' })
  removeLesson(@Param('lessonId') lessonId: string) {
    return this.cursos.removeLesson(lessonId);
  }

  // ───────── Material ─────────

  @Post(':id/lessons/:lessonId/materials')

  @TenantResource('course')

  @TenantRefs({ kind: 'lesson', in: 'params', field: 'lessonId' })
  addMaterial(@Param('lessonId') lessonId: string, @Body() dto: AddMaterialDto) {
    return this.cursos.addMaterial(lessonId, dto);
  }

  @Post(':id/lessons/:lessonId/materials/upload')

  @TenantResource('course')

  @TenantRefs({ kind: 'lesson', in: 'params', field: 'lessonId' })
  @UseInterceptors(FileInterceptor('file'))
  uploadMaterial(
    @Param('lessonId') lessonId: string,
    @UploadedFile() file: any,
    @Body() body: { title?: string; required?: string },
  ) {
    return this.cursos.uploadMaterialFile(lessonId, file, {
      title: body?.title,
      required: body?.required === 'true',
    });
  }

  @Delete(':id/lessons/:lessonId/materials/:materialId')

  @TenantResource('course')

  @TenantRefs({ kind: 'lesson', in: 'params', field: 'lessonId' })
  removeMaterial(
    @Param('lessonId') lessonId: string,
    @Param('materialId') materialId: string,
  ) {
    return this.cursos.removeMaterial(lessonId, materialId);
  }

  // ───────── Quizzes ─────────

  @Get(':id/quizzes')

  @TenantResource('course')
  listQuizzes(@Param('id') id: string) {
    return this.cursos.listQuizzes(id);
  }

  @Post(':id/quizzes')

  @TenantResource('course')

  @TenantRefs({ kind: 'lesson', in: 'body', field: 'lessonId' })
  createQuiz(@Param('id') id: string, @Body() dto: CreateQuizDto) {
    return this.cursos.createQuiz(id, dto);
  }

  @Put(':id/quizzes/:quizId')

  @TenantResource('course')

  @TenantRefs({ kind: 'quiz', in: 'params', field: 'quizId' })
  updateQuiz(@Param('quizId') quizId: string, @Body() dto: UpdateQuizDto) {
    return this.cursos.updateQuiz(quizId, dto);
  }

  // ───────── Preguntas ─────────

  @Get(':id/questions')

  @TenantResource('course')

  @TenantRefs({ kind: 'quiz', in: 'query', field: 'quizId' })
  listQuestions(@Param('id') id: string, @Query('quizId') quizId?: string) {
    return this.cursos.listQuestions(id, quizId);
  }

  @Post(':id/questions')

  @TenantResource('course')

  @TenantRefs({ kind: 'quiz', in: 'body', field: 'quizId' })
  createQuestion(@Param('id') id: string, @Body() dto: CreateQuestionDto) {
    return this.cursos.createQuestion(id, dto);
  }

  @Put(':id/questions/reorder')

  @TenantResource('course')

  @TenantRefs({ kind: 'quiz', in: 'body', field: 'quizId' }, { kind: 'question', in: 'body', field: 'ids', many: true })
  reorderQuestions(@Body() body: { quizId: string; ids: string[] }) {
    return this.cursos.reorderQuestions(body.quizId, body.ids);
  }

  @Put(':id/questions/:questionId')

  @TenantResource('course')

  @TenantRefs({ kind: 'question', in: 'params', field: 'questionId' })
  updateQuestion(@Param('questionId') questionId: string, @Body() dto: UpdateQuestionDto) {
    return this.cursos.updateQuestion(questionId, dto);
  }

  @Delete(':id/questions/:questionId')

  @TenantResource('course')

  @TenantRefs({ kind: 'question', in: 'params', field: 'questionId' })
  removeQuestion(@Param('questionId') questionId: string) {
    return this.cursos.removeQuestion(questionId);
  }

  // ───────── Inscripciones ─────────

  @Get(':id/enrollments')

  @TenantResource('course')
  listEnrollments(@Param('id') id: string) {
    return this.cursos.listEnrollments(id);
  }

  @Post(':id/enrollments')

  @TenantResource('course')

  @TenantRefs({ kind: 'record', in: 'body', field: 'recordIds', many: true }, { kind: 'campaign', in: 'body', field: 'campaignId' })
  createEnrollments(@Param('id') id: string, @Body() dto: CreateEnrollmentsDto) {
    return this.cursos.createEnrollments(id, dto.recordIds ?? [], dto.campaignId);
  }
}
