import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compressImage } from './imageCompression';

const state = vi.hoisted(() => ({
  imgWidth: 1600,
  imgHeight: 900,
  imgError: false,
  readerError: false,
  canvasContext: null as { drawImage: ReturnType<typeof vi.fn> } | null,
  canvasDataUrl: 'data:image/webp;base64,mock-webp',
}));

class MockFileReader {
  result: string | null = null;
  onload: ((event: { target: MockFileReader }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  readAsDataURL(): void {
    this.result = 'data:image/png;base64,ZmFrZQ==';
    queueMicrotask(() => {
      if (state.readerError) {
        this.onerror?.(new Event('error'));
      } else {
        this.onload?.({ target: this });
      }
    });
  }
}

class MockImage {
  private internalSrc = '';
  onload: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  width = 0;
  height = 0;

  set src(value: string) {
    this.internalSrc = value;
    queueMicrotask(() => {
      if (state.imgError) {
        this.onerror?.(new Event('error'));
        return;
      }
      this.width = state.imgWidth;
      this.height = state.imgHeight;
      this.onload?.();
    });
  }

  get src(): string {
    return this.internalSrc;
  }
}

describe('compressImage', () => {
  const originalCreateElement = document.createElement.bind(document);

  const makeCanvas = () => {
    const drawImage = vi.fn();
    const toDataURL = vi.fn(() => state.canvasDataUrl);
    state.canvasContext = { drawImage };
    return {
      width: 0,
      height: 0,
      getContext: vi.fn(() => state.canvasContext),
      toDataURL,
      drawImage,
    };
  };

  const makeFile = (): File => new File(['fake-image-bytes'], 'photo.png', { type: 'image/png' });

  beforeEach(() => {
    state.imgWidth = 1600;
    state.imgHeight = 900;
    state.imgError = false;
    state.readerError = false;
    state.canvasContext = null;
    vi.stubGlobal('FileReader', MockFileReader);
    vi.stubGlobal('Image', MockImage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('downscales a landscape image to maxWidth keeping aspect ratio', async () => {
    const canvas = makeCanvas();
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') return canvas as unknown as HTMLElement;
      return originalCreateElement(tag);
    });

    await expect(compressImage(makeFile())).resolves.toBe(state.canvasDataUrl);
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(450);
    expect(canvas.drawImage).toHaveBeenCalledWith(expect.any(MockImage), 0, 0, 800, 450);
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/webp', 0.8);
  });

  it('downscales a portrait image to maxHeight keeping aspect ratio', async () => {
    state.imgWidth = 900;
    state.imgHeight = 1600;
    const canvas = makeCanvas();
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') return canvas as unknown as HTMLElement;
      return originalCreateElement(tag);
    });

    await compressImage(makeFile(), 800, 800, 0.8);
    expect(canvas.width).toBe(450);
    expect(canvas.height).toBe(800);
    expect(canvas.drawImage).toHaveBeenCalledWith(expect.any(MockImage), 0, 0, 450, 800);
  });

  it('does not upscale images smaller than the limits', async () => {
    state.imgWidth = 100;
    state.imgHeight = 100;
    const canvas = makeCanvas();
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') return canvas as unknown as HTMLElement;
      return originalCreateElement(tag);
    });

    await compressImage(makeFile());
    expect(canvas.width).toBe(100);
    expect(canvas.height).toBe(100);
  });

  it('rejects when the 2d canvas context is unavailable', async () => {
    state.canvasContext = null;
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => null),
      toDataURL: vi.fn(),
    };
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') return canvas as unknown as HTMLElement;
      return originalCreateElement(tag);
    });

    await expect(compressImage(makeFile())).rejects.toThrow('Failed to get canvas context');
  });

  it('rejects when the image fails to load', async () => {
    state.imgError = true;
    const canvas = makeCanvas();
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') return canvas as unknown as HTMLElement;
      return originalCreateElement(tag);
    });

    await expect(compressImage(makeFile())).rejects.toBeInstanceOf(Event);
  });

  it('rejects when the FileReader fails', async () => {
    state.readerError = true;
    const canvas = makeCanvas();
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') return canvas as unknown as HTMLElement;
      return originalCreateElement(tag);
    });

    await expect(compressImage(makeFile())).rejects.toBeInstanceOf(Event);
  });
});