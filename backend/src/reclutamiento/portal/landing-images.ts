import { BadRequestException } from '@nestjs/common';
import { MediaStorageService } from '../../media/media-storage.service';
import { LANDING_IMAGE_SLOTS, LANDING_MEDIA_CHANNEL, LandingImageSlot } from './portal-landing';

/** Carpeta pública de las imágenes de una landing: la general (`scope = 'landing'`) o la de un proyecto (su id). */
export const landingImageFolder = (tenantId: string, scope = 'landing'): string => `media/${tenantId}/${LANDING_MEDIA_CHANNEL}/${scope}/`;

/**
 * La carpeta de la landing general (sin el nivel `scope`) sigue siendo
 * `media/<cuenta>/recruit-landing/`: las imágenes ya subidas siguen siendo válidas.
 */
export const landingImageRoot = (tenantId: string): string => `media/${tenantId}/${LANDING_MEDIA_CHANNEL}/`;

interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
}

/** Sube una imagen de landing (JPG, PNG o WebP verificados por sus primeros bytes) y devuelve su URL pública. */
export async function storeLandingImage(
  media: MediaStorageService,
  tenantId: string,
  scope: string,
  slot: string,
  file: UploadedFile | undefined,
): Promise<{ url: string }> {
  if (!(LANDING_IMAGE_SLOTS as readonly string[]).includes(slot)) throw new BadRequestException('Imagen inválida');
  if (!file?.buffer?.length) throw new BadRequestException('Archivo vacío');
  // SVG y otros formatos activos no se admiten: solo imágenes rasterizadas.
  if (!/^image\/(jpeg|png|webp)$/.test(file.mimetype)) throw new BadRequestException('La imagen debe ser JPG, PNG o WebP');
  // El tipo declarado lo envía el cliente: se comprueba también por los primeros bytes.
  const b = file.buffer;
  const isJpeg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const isPng = b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp = b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP';
  if (!isJpeg && !isPng && !isWebp) throw new BadRequestException('El archivo no es una imagen válida (JPG, PNG o WebP)');
  const stored = await media.uploadBuffer(file.buffer, {
    channel: LANDING_MEDIA_CHANNEL,
    tenantId,
    conversationId: scope,
    messageId: slot as LandingImageSlot,
    mimeType: file.mimetype,
    filename: file.originalname,
    imageProfile: 'email',
  });
  if (!stored?.url) throw new BadRequestException('No se pudo subir la imagen (almacenamiento no disponible)');
  return { url: stored.url };
}
