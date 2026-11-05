import { api } from "./api";

/**
 * Cliente API del módulo Cursos (academy): cursos con clases, material, preguntas
 * ponderadas con tiempos, examen final, inscripciones y ranking.
 */

export interface CoursePrize {
  rank: number;
  label: string;
  description?: string;
  imageUrl?: string;
}

export interface CourseRankingConfig {
  metric?: "weighted_score" | "total_score" | "accuracy" | "completion_time";
  tieBreaker?: "completion_time" | "fewest_attempts" | "earliest_finish";
  prizes?: CoursePrize[];
  publishLeaderboard?: boolean;
}

/** Elemento gráfico posicionable del certificado (logo, firma o sello). */
export interface CertificateAsset {
  url?: string;
  /** Posición X del centro, 0-100 (% del ancho del lienzo). */
  x?: number;
  /** Posición Y del centro, 0-100 (% del alto del lienzo). */
  y?: number;
  /** Ancho en % del ancho del lienzo. */
  size?: number;
  visible?: boolean;
}

/** Configuración completa del certificado de finalización del curso. */
export interface CourseCertificateConfig {
  enabled?: boolean;
  title?: string;
  introText?: string;
  bodyText?: string;
  footerText?: string;
  signatureName?: string;
  signatureTitle?: string;
  accentColor?: string;
  /** Logo de la empresa, con tamaño y posición libres. */
  logo?: CertificateAsset;
  /** Firma, con tamaño y posición libres. */
  signature?: CertificateAsset;
  /** Sello, con tamaño y posición libres. */
  stamp?: CertificateAsset;
  /** @deprecated usar `logo.url` */
  logoUrl?: string;
  /** @deprecated usar `signature.url` */
  signatureImageUrl?: string;
  showScore?: boolean;
  showRank?: boolean;
  showSerial?: boolean;
}

export type CourseLevel = "basic" | "intermediate" | "advanced" | "expert";

export interface CourseSettings {
  passingScore?: number;
  level?: CourseLevel;
  requireSequential?: boolean;
  maxAttemptsPerQuestion?: number;
  allowReviewAfterSubmit?: boolean;
  shuffleQuestions?: boolean;
  certificate?: CourseCertificateConfig;
  collectDataAt?: "start" | "end";
  allowOpenEnrollment?: boolean;
  availableFrom?: string | null;
  availableUntil?: string | null;
  verification?: CourseVerificationConfig;
  enrollmentFields?: CourseEnrollmentField[];
}

export interface CourseVerificationConfig {
  enabled?: boolean;
  channel?: "email" | "phone" | "both";
  emailTemplate?: { subject?: string; body?: string };
  whatsappInboxId?: string;
  whatsappTemplateName?: string;
  whatsappLanguage?: string;
  whatsappCodeVariable?: string;
}

export interface Course {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  coverUrl: string | null;
  status: string; // draft | active | archived
  slug: string | null;
  campaignId: string | null;
  rankingConfig: CourseRankingConfig | null;
  settings: CourseSettings | null;
  crmMapping: {
    fields?: Record<string, string>;
    matchRules?: { logic: "and" | "or"; fields: string[] };
  } | null;
  theme: { primary?: string; background?: string } | null;
  enrollmentCount: number;
  managedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LessonMaterial {
  id: string;
  type: "youtube" | "video_url" | "video_upload" | "document" | "image" | "link" | "text";
  title: string;
  url?: string;
  storagePath?: string;
  content?: string;
  durationSec?: number;
  mimeType?: string;
  sizeBytes?: number;
  required?: boolean;
  order: number;
}

export interface CourseLesson {
  id: string;
  tenantId: string;
  courseId: string;
  title: string;
  description: string | null;
  order: number;
  status: string; // draft | published
  materials: LessonMaterial[];
  minSecondsBeforeQuiz: number;
  createdAt: string;
  updatedAt: string;
}

export interface CourseQuiz {
  id: string;
  tenantId: string;
  courseId: string;
  lessonId: string | null;
  kind: "lesson_quiz" | "final_exam";
  title: string | null;
  description: string | null;
  totalTimeLimitSec: number | null;
  passingScore: number;
  weightInCourse: number;
  maxAttempts: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  showResultsPolicy: "immediately" | "after_close" | "never";
  status: string; // draft | active
}

export interface QuestionOption {
  id: string;
  text: string;
  isCorrect: boolean;
  weight?: number;
}

export interface CourseQuestion {
  id: string;
  tenantId: string;
  courseId: string;
  lessonId: string | null;
  quizId: string | null;
  isFinalExam: boolean;
  order: number;
  type: "single_choice" | "multiple_choice" | "true_false" | "short_text" | "numeric" | "ordering";
  prompt: string;
  mediaUrl: string | null;
  options: QuestionOption[];
  correctAnswer: {
    text?: string;
    number?: number;
    tolerance?: number;
    acceptedValues?: Array<string | number>;
    order?: string[];
  } | null;
  points: number;
  negativeOnWrong: number;
  partialCredit: boolean;
  timeLimitSec: number | null;
  timeBonus: { enabled: boolean; maxBonusPoints: number; decayModel?: "linear" | "step" } | null;
  explanation: string | null;
  difficulty: string | null;
}

export interface CourseEnrollment {
  id: string;
  courseId: string;
  recordId: string | null;
  campaignId: string | null;
  accessToken: string;
  participantData: Record<string, any>;
  status: string;
  totalScore: number;
  weightedScore: number;
  maxPossibleScore: number;
  accuracyPct: number;
  completedLessons: number;
  totalTimeSpentSec: number;
  rank: number | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface LeaderboardEntry {
  rank: number;
  enrollmentId: string;
  recordId: string | null;
  participant: string;
  totalScore: number;
  weightedScore: number;
  accuracyPct: number;
  completedLessons: number;
  totalTimeSpentSec: number;
  status: string;
  completedAt: string | null;
}

export interface Leaderboard {
  metric: string | null;
  prizes: CoursePrize[];
  entries: LeaderboardEntry[];
}

export interface CourseAnalytics {
  courseId: string;
  name: string;
  lessons: number;
  quizzes: number;
  enrollments: number;
  completed: number;
  passed: number;
  completionRate: number;
  passRate: number;
  avgWeightedScore: number;
  avgAccuracy: number;
}

// ─── Cursos ───

export async function listCursos(tenantId: string): Promise<Course[]> {
  const { data } = await api.get<Course[]>("/cursos", { params: { tenantId } });
  return data;
}

export async function getCurso(id: string): Promise<Course> {
  const { data } = await api.get<Course>(`/cursos/${id}`);
  return data;
}

export async function createCurso(payload: {
  tenantId: string;
  name: string;
  description?: string;
  campaignId?: string;
}): Promise<Course> {
  const { data } = await api.post<Course>("/cursos", payload);
  return data;
}

export async function updateCurso(id: string, patch: Partial<Course>): Promise<Course> {
  const { data } = await api.put<Course>(`/cursos/${id}`, patch);
  return data;
}

export async function deleteCurso(id: string): Promise<void> {
  await api.delete(`/cursos/${id}`);
}

export async function publishCurso(id: string): Promise<Course> {
  const { data } = await api.post<Course>(`/cursos/${id}/publish`, {});
  return data;
}

export async function archiveCurso(id: string): Promise<Course> {
  const { data } = await api.post<Course>(`/cursos/${id}/archive`, {});
  return data;
}

export async function uploadCursoCover(id: string, file: File): Promise<Course> {
  const fd = new FormData();
  fd.append("file", file);
  const { data } = await api.post<Course>(`/cursos/${id}/cover`, fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

/** Sube el logo o la firma del certificado del curso y devuelve el curso actualizado. */
export async function uploadCertificateAsset(
  id: string,
  kind: "logo" | "signature" | "stamp",
  file: File,
): Promise<Course> {
  const fd = new FormData();
  fd.append("file", file);
  const { data } = await api.post<Course>(`/cursos/${id}/certificate-asset`, fd, {
    params: { kind },
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function getCursoAnalytics(id: string): Promise<CourseAnalytics> {
  const { data } = await api.get<CourseAnalytics>(`/cursos/${id}/analytics`);
  return data;
}

export async function getCursoLeaderboard(id: string, limit = 100): Promise<Leaderboard> {
  const { data } = await api.get<Leaderboard>(`/cursos/${id}/leaderboard`, { params: { limit } });
  return data;
}

// ─── Clases ───

export async function listLessons(courseId: string): Promise<CourseLesson[]> {
  const { data } = await api.get<CourseLesson[]>(`/cursos/${courseId}/lessons`);
  return data;
}

export async function createLesson(
  courseId: string,
  payload: { title: string; description?: string },
): Promise<CourseLesson> {
  const { data } = await api.post<CourseLesson>(`/cursos/${courseId}/lessons`, payload);
  return data;
}

export async function updateLesson(
  courseId: string,
  lessonId: string,
  patch: Partial<CourseLesson>,
): Promise<CourseLesson> {
  const { data } = await api.put<CourseLesson>(`/cursos/${courseId}/lessons/${lessonId}`, patch);
  return data;
}

export async function deleteLesson(courseId: string, lessonId: string): Promise<void> {
  await api.delete(`/cursos/${courseId}/lessons/${lessonId}`);
}

export async function reorderLessons(courseId: string, ids: string[]): Promise<void> {
  await api.put(`/cursos/${courseId}/lessons/reorder`, { ids });
}

// ─── Material ───

export async function addMaterial(
  courseId: string,
  lessonId: string,
  payload: {
    type: LessonMaterial["type"];
    title: string;
    url?: string;
    content?: string;
    durationSec?: number;
    required?: boolean;
  },
): Promise<CourseLesson> {
  const { data } = await api.post<CourseLesson>(
    `/cursos/${courseId}/lessons/${lessonId}/materials`,
    payload,
  );
  return data;
}

export async function uploadMaterial(
  courseId: string,
  lessonId: string,
  file: File,
  meta: { title?: string; required?: boolean },
): Promise<CourseLesson> {
  const fd = new FormData();
  fd.append("file", file);
  if (meta.title) fd.append("title", meta.title);
  if (meta.required != null) fd.append("required", String(meta.required));
  const { data } = await api.post<CourseLesson>(
    `/cursos/${courseId}/lessons/${lessonId}/materials/upload`,
    fd,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return data;
}

export async function removeMaterial(
  courseId: string,
  lessonId: string,
  materialId: string,
): Promise<CourseLesson> {
  const { data } = await api.delete<CourseLesson>(
    `/cursos/${courseId}/lessons/${lessonId}/materials/${materialId}`,
  );
  return data;
}

// ─── Quizzes ───

export async function listQuizzes(courseId: string): Promise<CourseQuiz[]> {
  const { data } = await api.get<CourseQuiz[]>(`/cursos/${courseId}/quizzes`);
  return data;
}

export async function createQuiz(
  courseId: string,
  payload: { kind: "lesson_quiz" | "final_exam"; lessonId?: string; title?: string },
): Promise<CourseQuiz> {
  const { data } = await api.post<CourseQuiz>(`/cursos/${courseId}/quizzes`, payload);
  return data;
}

export async function updateQuiz(
  courseId: string,
  quizId: string,
  patch: Partial<CourseQuiz>,
): Promise<CourseQuiz> {
  const { data } = await api.put<CourseQuiz>(`/cursos/${courseId}/quizzes/${quizId}`, patch);
  return data;
}

// ─── Preguntas ───

export async function listQuestions(courseId: string, quizId?: string): Promise<CourseQuestion[]> {
  const { data } = await api.get<CourseQuestion[]>(`/cursos/${courseId}/questions`, {
    params: quizId ? { quizId } : {},
  });
  return data;
}

export async function createQuestion(
  courseId: string,
  payload: {
    quizId: string;
    type: CourseQuestion["type"];
    prompt: string;
    lessonId?: string;
    isFinalExam?: boolean;
    options?: Array<{ text: string; isCorrect: boolean }>;
    points?: number;
  },
): Promise<CourseQuestion> {
  const { data } = await api.post<CourseQuestion>(`/cursos/${courseId}/questions`, payload);
  return data;
}

export async function updateQuestion(
  courseId: string,
  questionId: string,
  patch: Partial<CourseQuestion>,
): Promise<CourseQuestion> {
  const { data } = await api.put<CourseQuestion>(`/cursos/${courseId}/questions/${questionId}`, patch);
  return data;
}

export async function deleteQuestion(courseId: string, questionId: string): Promise<void> {
  await api.delete(`/cursos/${courseId}/questions/${questionId}`);
}

// ─── Inscripciones ───

export async function listEnrollments(courseId: string): Promise<CourseEnrollment[]> {
  const { data } = await api.get<CourseEnrollment[]>(`/cursos/${courseId}/enrollments`);
  return data;
}

export async function createEnrollments(
  courseId: string,
  payload: { recordIds: string[]; campaignId?: string },
): Promise<CourseEnrollment[]> {
  const { data } = await api.post<CourseEnrollment[]>(`/cursos/${courseId}/enrollments`, payload);
  return data;
}

// ─── Enlace público del participante (sin auth) ───

export async function getPublicCourse(slug: string, token?: string) {
  const { data } = await api.get(`/cursos/public/${slug}`, { params: token ? { t: token } : {} });
  return data;
}

/** Certificado del participante tal como lo expone el runner / portal. */
export interface RunnerCertificate {
  id: string;
  serial: string;
  participantName: string;
  courseName: string;
  tenantName: string;
  score: number;
  rank: number | null;
  config?: CourseCertificateConfig | null;
  issuedAt: string;
}

/** Genera (o devuelve) el certificado del participante desde el runner del curso. */
export async function issueCourseCertificate(
  slug: string,
  token: string,
): Promise<RunnerCertificate> {
  const { data } = await api.post(
    `/cursos/public/${slug}/certificate`,
    {},
    { params: { t: token } },
  );
  return data;
}

export async function saveParticipant(
  slug: string,
  token: string,
  participantData: Record<string, any>,
) {
  const { data } = await api.post(
    `/cursos/public/${slug}/participant`,
    { participantData },
    { params: { t: token } },
  );
  return data;
}

export async function viewMaterial(
  slug: string,
  token: string,
  lessonId: string,
  secondsSpent: number,
) {
  const { data } = await api.post(
    `/cursos/public/${slug}/lessons/${lessonId}/view`,
    { secondsSpent },
    { params: { t: token } },
  );
  return data;
}

export async function markMaterialWatched(
  slug: string,
  token: string,
  lessonId: string,
  materialId: string,
): Promise<{ ok: boolean; lessonCompleted: boolean }> {
  const { data } = await api.post(
    `/cursos/public/${slug}/lessons/${lessonId}/materials/${materialId}/watched`,
    {},
    { params: { t: token } },
  );
  return data;
}

export async function startAttempt(slug: string, token: string, quizId: string) {
  const { data } = await api.post(
    `/cursos/public/${slug}/quizzes/${quizId}/start`,
    {},
    { params: { t: token } },
  );
  return data;
}

export async function submitAttempt(
  slug: string,
  token: string,
  attemptId: string,
  answers: Array<{ questionId: string; answer: string[] | string | number | null; timeTakenSec?: number }>,
) {
  const { data } = await api.post(
    `/cursos/public/${slug}/attempts/${attemptId}/submit`,
    { answers },
    { params: { t: token } },
  );
  return data;
}

export async function getPublicLeaderboard(slug: string): Promise<Leaderboard> {
  const { data } = await api.get<Leaderboard>(`/cursos/public/${slug}/leaderboard`);
  return data;
}

// ─── Verificación OTP (participante) ───

export async function requestOtp(
  slug: string,
  token: string,
  channel: "email" | "phone",
  destination: string,
): Promise<{ otpId: string; channel: string; maskedDestination: string; expiresInSec: number }> {
  const { data } = await api.post(
    `/cursos/public/${slug}/otp/request`,
    { channel, destination },
    { params: { t: token } },
  );
  return data;
}

export async function verifyOtp(
  slug: string,
  token: string,
  otpId: string,
  code: string,
): Promise<{
  verified: boolean;
  needsData: boolean;
  recordId?: string;
  fields?: CourseEnrollmentField[];
  prefill?: Record<string, string>;
}> {
  const { data } = await api.post(
    `/cursos/public/${slug}/otp/verify`,
    { otpId, code },
    { params: { t: token } },
  );
  return data;
}

export async function completeEnrollmentData(
  slug: string,
  token: string,
  participantData: Record<string, any>,
) {
  const { data } = await api.post(
    `/cursos/public/${slug}/complete-data`,
    { participantData },
    { params: { t: token } },
  );
  return data;
}

// ─── Config de verificación (admin) ───

export interface CourseEnrollmentField {
  key: string;
  label: string;
  crmField: string;
  type?: "text" | "email" | "phone" | "number" | "date" | "select";
  required?: boolean;
  options?: string[];
}

export interface WhatsappInboxOption {
  id: string;
  name: string;
  status: string;
  connected: boolean;
}

export interface WhatsappTemplateOption {
  name: string;
  language: string;
  category: string;
  bodyText: string;
  variableCount: number;
}

export interface CrmFieldsCatalog {
  system: Array<{ value: string; label: string; group: string }>;
  custom: Array<{ value: string; label: string; group: string }>;
  matchable: string[];
}

export async function listWhatsappInboxes(tenantId: string): Promise<WhatsappInboxOption[]> {
  const { data } = await api.get<WhatsappInboxOption[]>("/cursos/config/whatsapp-inboxes", {
    params: { tenantId },
  });
  return data;
}

export async function listWhatsappTemplates(
  tenantId: string,
  inboxId: string,
): Promise<WhatsappTemplateOption[]> {
  const { data } = await api.get<WhatsappTemplateOption[]>("/cursos/config/whatsapp-templates", {
    params: { tenantId, inboxId },
  });
  return data;
}

export async function getCrmFields(tenantId: string): Promise<CrmFieldsCatalog> {
  const { data } = await api.get<CrmFieldsCatalog>("/cursos/config/crm-fields", {
    params: { tenantId },
  });
  return data;
}

// ─── Portal público de academy ───

export interface PortalCourse {
  id: string;
  name: string;
  description: string | null;
  coverUrl: string | null;
  slug: string | null;
  lessons: number;
  /** Duración total del curso en segundos (suma de materiales de las clases). */
  durationSec: number;
  /** Nivel del curso, si está configurado. */
  level: CourseLevel | null;
  /** Si el curso emite certificado de finalización. */
  hasCertificate: boolean;
  enrollmentCount: number;
  theme: { primary?: string; background?: string } | null;
}

export interface PortalTheme {
  primary?: string;
  onPrimary?: string;
  background?: string;
  radius?: string;
  headerTitle?: string;
  headerSubtitle?: string;
  logoUrl?: string;
  /** Altura del logo en la cabecera, en píxeles (24–80). */
  logoSize?: number;
  /** Espacio vertical (padding arriba/abajo) de la cabecera, en píxeles. */
  headerPaddingY?: number;
  /** Mostrar los textos (título + subtítulo) en la cabecera. Default true. */
  showHeaderText?: boolean;
}

export interface PortalData {
  tenant: { name: string; slug: string; iconPath: string | null };
  verification: { channel: "email" | "phone" | "both" };
  theme: PortalTheme | null;
  meta: PortalMeta | null;
  courses: PortalCourse[];
}

export interface OverallLeaderboardEntry {
  rank: number;
  recordId: string;
  participant: string;
  score: number;
  coursesCompleted: number;
  totalTimeSpentSec: number;
}

export interface PortalDashboard {
  participant: { recordId: string; name: string | null; email: string | null; phone: string | null } | null;
  courses: Array<{
    courseId: string;
    courseName: string;
    courseSlug: string | null;
    status: string;
    weightedScore: number;
    accuracyPct: number;
    completedLessons: number;
    rank: number | null;
    completedAt: string | null;
  }>;
  summary: {
    coursesEnrolled: number;
    coursesCompleted: number;
    avgScore: number;
    overallRank: number | null;
    overallScore: number;
  };
}

export async function getPortal(tenantSlug: string): Promise<PortalData> {
  const { data } = await api.get<PortalData>(`/cursos/portal/${tenantSlug}`);
  return data;
}

export async function getOverallLeaderboard(
  tenantSlug: string,
  limit = 50,
): Promise<{ entries: OverallLeaderboardEntry[] }> {
  const { data } = await api.get(`/cursos/portal/${tenantSlug}/overall-leaderboard`, {
    params: { limit },
  });
  return data;
}

export async function portalIdentifyRequest(
  tenantSlug: string,
  channel: "email" | "phone",
  destination: string,
): Promise<{ otpId: string; maskedDestination: string; expiresInSec: number }> {
  const { data } = await api.post(`/cursos/portal/${tenantSlug}/identify/request`, {
    channel,
    destination,
  });
  return data;
}

export async function portalIdentifyVerify(
  tenantSlug: string,
  otpId: string,
  code: string,
): Promise<{
  portalToken: string;
  isNew: boolean;
  needsData: boolean;
  fields: CourseEnrollmentField[];
  participant: { recordId: string; name: string | null; email: string | null; phone: string | null };
}> {
  const { data } = await api.post(`/cursos/portal/${tenantSlug}/identify/verify`, { otpId, code });
  return data;
}

export async function portalCompleteProfile(
  tenantSlug: string,
  portalToken: string,
  profileData: Record<string, any>,
) {
  const { data } = await api.post(
    `/cursos/portal/${tenantSlug}/complete-profile`,
    { data: profileData },
    { params: { pt: portalToken } },
  );
  return data;
}

export async function portalEnterCourse(
  tenantSlug: string,
  portalToken: string,
  courseId: string,
): Promise<{ courseSlug: string | null; accessToken: string }> {
  const { data } = await api.post(
    `/cursos/portal/${tenantSlug}/enter-course`,
    { courseId },
    { params: { pt: portalToken } },
  );
  return data;
}

// ─── Academy config (admin) ───

export interface PortalMeta {
  /** Título de la tarjeta al compartir (og:title). */
  title?: string;
  /** Descripción breve (og:description). */
  description?: string;
  /** URL de la imagen de previsualización (og:image). Recomendado 1200×630. */
  ogImage?: string;
}

export interface AcademyConfig {
  verificationChannel?: "email" | "phone" | "both";
  emailTemplate?: { subject?: string; body?: string };
  whatsappInboxId?: string;
  whatsappTemplateName?: string;
  whatsappLanguage?: string;
  whatsappCodeVariable?: string;
  theme?: PortalTheme;
  meta?: PortalMeta;
  enrollmentFields?: CourseEnrollmentField[];
}

export async function getAcademyConfig(tenantId: string): Promise<AcademyConfig> {
  const { data } = await api.get<AcademyConfig>("/cursos/config/academy", { params: { tenantId } });
  return data;
}

// ─── Cursos de un contacto (detalle del contacto en el CRM) ───

export interface RecordCourse {
  courseId: string;
  courseName: string;
  status: string; // invited | in_progress | completed | passed | failed
  weightedScore: number;
  accuracyPct: number;
  completedLessons: number;
  rank: number | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface RecordCoursesResult {
  courses: RecordCourse[];
  summary: { total: number; completed: number; inProgress: number; avgScore: number };
}

export async function getRecordCourses(
  tenantId: string,
  recordId: string,
): Promise<RecordCoursesResult> {
  const { data } = await api.get<RecordCoursesResult>(`/cursos/record/${recordId}/courses`, {
    params: { tenantId },
  });
  return data;
}

export async function updateAcademyConfig(
  tenantId: string,
  patch: AcademyConfig,
): Promise<AcademyConfig> {
  const { data } = await api.put<AcademyConfig>("/cursos/config/academy", patch, {
    params: { tenantId },
  });
  return data;
}

/** Sube el logo del portal (imagen cuadrada) y devuelve la config actualizada. */
export async function uploadAcademyLogo(tenantId: string, file: File): Promise<AcademyConfig> {
  const fd = new FormData();
  fd.append("file", file);
  const { data } = await api.post<AcademyConfig>("/cursos/config/academy/logo", fd, {
    params: { tenantId },
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

/** Sube la imagen para compartir (og:image, ~1.91:1) y devuelve la config actualizada. */
export async function uploadAcademyOgImage(tenantId: string, file: File): Promise<AcademyConfig> {
  const fd = new FormData();
  fd.append("file", file);
  const { data } = await api.post<AcademyConfig>("/cursos/config/academy/og-image", fd, {
    params: { tenantId },
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function getPortalDashboard(
  tenantSlug: string,
  portalToken: string,
): Promise<PortalDashboard> {
  const { data } = await api.get<PortalDashboard>(`/cursos/portal/${tenantSlug}/me`, {
    params: { pt: portalToken },
  });
  return data;
}

// ─────────────────────────── Certificados del portal ───────────────────────────

export interface PortalCertificate {
  id: string;
  serial: string;
  courseId: string;
  participantName: string;
  courseName: string;
  tenantName: string;
  score: number;
  rank: number | null;
  config?: CourseCertificateConfig | null;
  issuedAt: string;
}

/** Certificados del participante en el portal (emitidos al aprobar cursos). */
export async function getMyCertificates(
  tenantSlug: string,
  portalToken: string,
): Promise<{ certificates: PortalCertificate[] }> {
  const { data } = await api.get(`/cursos/portal/${tenantSlug}/certificates`, {
    params: { pt: portalToken },
  });
  return data;
}
