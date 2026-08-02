import { useState, useCallback, useEffect } from "react";
import Cropper from "react-easy-crop";
import { motion } from "framer-motion";
import { X, Check, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ImageCropperProps {
  imageSrc: string;
  fileName: string;
  aspect?: number;
  title?: string;
  onCropComplete: (file: File) => void;
  onCancel: () => void;
}

/**
 * Square cropper using react-easy-crop.
 * Pre-processes the image into a square (padded to the largest side)
 * so that the crop area always contains the full image from the start.
 */
export function ImageCropper({ imageSrc, fileName, aspect, title, onCropComplete, onCancel }: ImageCropperProps) {
  const [squareSrc, setSquareSrc] = useState<string | null>(null);
  const [originalAspect, setOriginalAspect] = useState<number>(1);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const isPng = fileName.toLowerCase().endsWith(".png");
  const isSquare = aspect === 1;

  // Pre-process: pad image to square (only for square mode)
  // For free mode, just load and get the natural aspect ratio
  useEffect(() => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (isSquare) {
        const size = Math.max(img.width, img.height);
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        if (!isPng) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, size, size);
        } else {
          ctx.clearRect(0, 0, size, size);
        }

        const offsetX = (size - img.width) / 2;
        const offsetY = (size - img.height) / 2;
        ctx.drawImage(img, offsetX, offsetY);

        setSquareSrc(canvas.toDataURL(isPng ? "image/png" : "image/jpeg", 0.95));
      } else {
        setOriginalAspect(img.width / img.height);
        setSquareSrc(imageSrc);
      }
    };
    img.src = imageSrc;
  }, [imageSrc, isPng, isSquare]);

  const onCropDone = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleConfirm = async () => {
    if (!croppedAreaPixels || !squareSrc) return;

    const file = await cropImage(squareSrc, croppedAreaPixels, isPng, fileName);
    if (file) onCropComplete(file);
  };

  if (!squareSrc) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 bg-white flex flex-col items-center justify-center z-[60]"
    >
      <h3 className="text-lg font-semibold text-gray-900 mb-4">{title || "Recortar imagen"}</h3>

      <div className="relative w-full max-w-sm aspect-square rounded-xl overflow-hidden border border-gray-200">
        <Cropper
          image={squareSrc}
          crop={crop}
          zoom={zoom}
          aspect={isSquare ? 1 : originalAspect}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropDone}
          cropShape="rect"
          showGrid
          style={{
            containerStyle: { background: isPng ? "#f3f4f6" : "#ffffff" },
          }}
        />
      </div>

      {/* Zoom controls */}
      <div className="flex items-center gap-3 mt-6">
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(1, +(z - 0.1).toFixed(1)))}
          className="h-9 w-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <input
          type="range"
          min={1}
          max={3}
          step={0.05}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="w-48 accent-accent-500"
        />
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(3, +(z + 0.1).toFixed(1)))}
          className="h-9 w-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
      </div>

      <p className="text-xs text-gray-400 mt-2">
        Arrastra para ajustar. El resultado será cuadrado{isPng ? " con fondo transparente" : " con fondo blanco"}.
      </p>

      {/* Actions */}
      <div className="flex items-center gap-3 mt-4">
        <Button type="button" variant="outline" onClick={onCancel} className="gap-2">
          <X className="h-4 w-4" />
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={handleConfirm}
          className="gap-2 bg-accent-500 hover:bg-accent-600 text-white"
        >
          <Check className="h-4 w-4" />
          Confirmar
        </Button>
      </div>
    </motion.div>
  );
}

async function cropImage(
  imageSrc: string,
  pixelCrop: Area,
  isPng: boolean,
  originalName: string,
): Promise<File | null> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  if (!isPng) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height,
  );

  const mimeType = isPng ? "image/png" : "image/jpeg";
  const extension = isPng ? ".png" : ".jpg";

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) { resolve(null); return; }
        const baseName = originalName.replace(/\.[^.]+$/, "");
        const file = new File([blob], `${baseName}-icon${extension}`, { type: mimeType });
        resolve(file);
      },
      mimeType,
      0.92,
    );
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", (err) => reject(err));
    img.crossOrigin = "anonymous";
    img.src = url;
  });
}
