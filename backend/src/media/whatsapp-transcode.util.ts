import ffmpeg from 'fluent-ffmpeg';
import { promises as fsp } from 'fs';
import * as os from 'os';
import * as path from 'path';

/** Límite de tamaño de video de la WhatsApp Cloud API (16 MiB). */
export const WA_VIDEO_LIMIT = 16 * 1024 * 1024;

/**
 * Convierte audio de navegador (WebM/Opus u OGG no estándar) a OGG/Opus real,
 * el formato que WhatsApp Cloud API acepta para notas de voz.
 */
export async function convertAudioToOggOpus(input: Buffer): Promise<Buffer> {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'wa-audio-'));
  const inPath = path.join(tmpDir, 'in.bin');
  const outPath = path.join(tmpDir, 'out.ogg');
  try {
    await fsp.writeFile(inPath, input);
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inPath)
        .noVideo()
        .audioCodec('libopus')
        .audioChannels(1)
        .audioFrequency(16000)
        .audioBitrate('16k')
        .format('ogg')
        // WhatsApp Android no reproduce OGG con las etiquetas que ffmpeg añade
        // por defecto (encoder=Lavf...). Se eliminan metadatos y se usa el
        // perfil de voz, igual que las notas de voz nativas.
        .outputOptions([
          '-application', 'voip',
          '-map_metadata', '-1',
          '-metadata:s:a:0', 'encoder=',
          '-fflags', '+bitexact',
          '-flags:a', '+bitexact',
          '-avoid_negative_ts', 'make_zero',
        ])
        .on('end', () => resolve())
        .on('error', (err) => reject(new Error(`ffmpeg falló: ${err.message}`)))
        .save(outPath);
    });
    return await fsp.readFile(outPath);
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Re-codifica un video a un perfil compatible con WhatsApp (H.264 Constrained
 * Baseline + AAC, dimensiones múltiplo de 16, faststart) intentando quedar bajo
 * `targetBytes`. Calcula el bitrate a partir de la duración real y, si se
 * excede, reintenta con resolución/bitrate más agresivos. Devuelve el último
 * intento aunque exceda; el llamador debe validar el tamaño.
 */
export async function compressVideoForWhatsApp(
  input: Buffer,
  targetBytes: number = WA_VIDEO_LIMIT,
  onRetry?: (msg: string) => void,
): Promise<Buffer> {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'wa-video-'));
  const inPath = path.join(tmpDir, 'in.bin');
  const outPath = path.join(tmpDir, 'out.mp4');
  try {
    await fsp.writeFile(inPath, input);
    const durationSec = await probeDuration(inPath);

    // Presupuesto de bits objetivo (90% del límite para dejar margen al muxing
    // y al audio). bits = bytes * 8. bitrate(kbps) = bits / duración / 1000.
    const safeBytes = targetBytes * 0.9;
    const attempts = [
      { maxHeight: 720, audioKbps: 128 },
      { maxHeight: 540, audioKbps: 96 },
      { maxHeight: 480, audioKbps: 64 },
      { maxHeight: 360, audioKbps: 48 },
    ];

    let lastBuffer: Buffer | null = null;
    for (const attempt of attempts) {
      const totalKbps = Math.max(200, Math.floor((safeBytes * 8) / Math.max(1, durationSec) / 1000));
      const videoKbps = Math.max(150, totalKbps - attempt.audioKbps);

      await runVideoPass(inPath, outPath, {
        videoKbps,
        audioKbps: attempt.audioKbps,
        maxHeight: attempt.maxHeight,
      });

      const out = await fsp.readFile(outPath);
      lastBuffer = out;
      if (out.length <= targetBytes) return out;
      onRetry?.(`Compresión a ${attempt.maxHeight}p quedó en ${out.length} bytes; reintentando más agresivo...`);
    }
    return lastBuffer as Buffer;
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Obtiene la duración (segundos) de un archivo multimedia usando ffprobe. */
function probeDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) {
        resolve(0);
        return;
      }
      const dur = data?.format?.duration;
      resolve(typeof dur === 'number' && dur > 0 ? dur : 0);
    });
  });
}

/** Ejecuta una pasada de compresión H.264/AAC con ffmpeg. */
function runVideoPass(
  inPath: string,
  outPath: string,
  opts: { videoKbps: number; audioKbps: number; maxHeight: number },
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions([
        `-b:v ${opts.videoKbps}k`,
        `-maxrate ${Math.floor(opts.videoKbps * 1.2)}k`,
        `-bufsize ${opts.videoKbps * 2}k`,
        `-b:a ${opts.audioKbps}k`,
        '-ar 44100',
        '-ac 2',
        '-preset veryfast',
        // Constrained Baseline + level 3.0: el perfil que el decodificador de
        // hardware de Android acepta sin problemas (High/Main fallan en Android
        // aunque iOS los reproduzca).
        '-profile:v baseline',
        '-level 3.0',
        '-pix_fmt yuv420p',
        // GOP corto con keyframe cada ~2s: Android necesita keyframes tempranos y
        // frecuentes para generar el thumbnail y arrancar la reproducción.
        '-g 48',
        '-keyint_min 48',
        '-sc_threshold 0',
        // faststart mueve el moov atom al inicio (requerido para streaming).
        '-movflags +faststart',
        // Escala a la altura máxima manteniendo aspecto. force_divisible_by=16:
        // el decodificador de hardware de Android exige ancho y alto múltiplos de 16.
        `-vf scale=-2:'min(${opts.maxHeight},ih)':force_original_aspect_ratio=decrease:force_divisible_by=16,format=yuv420p`,
      ])
      .format('mp4')
      .on('end', () => resolve())
      .on('error', (err) => reject(new Error(`ffmpeg falló: ${err.message}`)))
      .save(outPath);
  });
}
