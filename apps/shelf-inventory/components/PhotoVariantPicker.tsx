import { Camera, X } from 'lucide-react';
import type React from 'react';
import { useRef } from 'react';
import { compressImage } from '../lib/imageCompression';

interface PhotoVariantPickerProps {
  /** All unique attribute values to show (e.g. ['Rojo', 'Azul', 'Grande', 'Pequeño']) */
  attributeValues: string[];
  /** Current mapping of attributeValue -> photoUrl */
  photoMap: Record<string, string>;
  /** Callback when a photo is assigned/removed for an attribute value */
  onChange: (photoMap: Record<string, string>) => void;
}

interface PhotoValueRowProps {
  value: string;
  photoUrl: string | undefined;
  onUpload: (url: string) => void;
  onRemove: () => void;
}

const PhotoValueRow: React.FC<PhotoValueRowProps> = ({ value, photoUrl, onUpload, onRemove }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const optimized = await compressImage(file, 800, 800, 0.8);
      onUpload(optimized);
    } catch (err) {
      console.error('Error compressing variant photo:', err);
    }
    // Reset so the same file can be re-selected
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="flex items-center gap-2 rounded-lg border border-[#F5F5DC]/15 bg-[#121212] p-2">
      {photoUrl ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-10 h-10 rounded border border-[#F5F5DC]/20 overflow-hidden flex-shrink-0 bg-[#1e1e1e] p-0 appearance-none"
          title={`Cambiar foto de ${value}`}
        >
          <img src={photoUrl} alt={value} className="w-full h-full object-cover" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-10 h-10 rounded border border-dashed border-[#F5F5DC]/25 bg-[#1e1e1e] flex items-center justify-center flex-shrink-0 hover:border-[#F5F5DC]/40 transition-colors appearance-none p-0"
          title={`Subir foto para ${value}`}
        >
          <Camera className="h-4 w-4 text-[#F5F5DC]/40" />
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png, image/jpeg, image/webp"
        className="hidden"
        onChange={handleChange}
      />
      <span className="text-xs text-[#F5F5DC]/70 truncate min-w-0">{value}</span>
      {photoUrl && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-auto flex-shrink-0 text-red-400/60 hover:text-red-400 transition-colors p-0 appearance-none bg-transparent border-0"
          title={`Quitar foto de ${value}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
};

const PhotoVariantPicker: React.FC<PhotoVariantPickerProps> = ({ attributeValues, photoMap, onChange }) => {
  if (attributeValues.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-[#F5F5DC]/60 uppercase tracking-wide">Fotos por valor</h4>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {attributeValues.map((value) => (
          <PhotoValueRow
            key={value}
            value={value}
            photoUrl={photoMap[value]}
            onUpload={(url) => onChange({ ...photoMap, [value]: url })}
            onRemove={() => {
              const next = { ...photoMap };
              delete next[value];
              onChange(next);
            }}
          />
        ))}
      </div>
    </div>
  );
};

export default PhotoVariantPicker;
