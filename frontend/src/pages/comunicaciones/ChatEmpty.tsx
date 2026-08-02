import { MessageSquare } from "lucide-react";

export function ChatEmpty() {
  return (
    <div className="flex-1 flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="relative mx-auto mb-6 w-32 h-32">
          {/* Circle background */}
          <div className="absolute inset-0 rounded-full bg-gray-200/60" />
          {/* Decorative elements */}
          <div className="absolute top-4 left-2 w-16 h-2 rounded-full bg-gray-300/50" />
          <div className="absolute top-10 right-2 w-12 h-2 rounded-full bg-gray-300/50" />
          <div className="absolute bottom-10 left-4 w-14 h-2 rounded-full bg-gray-300/50" />
          <div className="absolute bottom-4 right-4 w-10 h-2 rounded-full bg-gray-300/50" />
          {/* Main chat bubble */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-12 rounded-2xl bg-gray-300 flex items-center justify-center">
            <div className="flex gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-gray-500" />
              <div className="w-1.5 h-1.5 rounded-full bg-gray-500" />
              <div className="w-1.5 h-1.5 rounded-full bg-gray-500" />
            </div>
          </div>
          {/* Small accent bubble */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/4 w-7 h-6 rounded-xl bg-brand-400/70 flex items-center justify-center">
            <div className="flex gap-0.5">
              <div className="w-1 h-1 rounded-full bg-white/80" />
              <div className="w-1 h-1 rounded-full bg-white/80" />
              <div className="w-1 h-1 rounded-full bg-white/80" />
            </div>
          </div>
        </div>
        <p className="text-gray-500 text-sm font-medium">Por favor, selecciona una conversación del panel izquierdo</p>
      </div>
    </div>
  );
}
