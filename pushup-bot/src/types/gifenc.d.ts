declare module 'gifenc' {
  export interface GifFrameOptions {
    palette?: number[][];
    delay?: number;
    repeat?: number;
    transparent?: boolean;
  }
  export interface GifEncoder {
    writeFrame(index: Uint8Array, width: number, height: number, options?: GifFrameOptions): void;
    finish(): void;
    bytes(): Uint8Array;
  }
  const gifenc: {
    GIFEncoder(options?: { auto?: boolean }): GifEncoder;
    quantize(data: Uint8Array | Uint8ClampedArray, maxColors: number): number[][];
    applyPalette(data: Uint8Array | Uint8ClampedArray, palette: number[][], format?: string): Uint8Array;
  };
  export default gifenc;
}
