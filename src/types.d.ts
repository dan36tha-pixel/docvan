declare module '@breezystack/lamejs' {
  export class Mp3Encoder {
    constructor(channels: number, samplerate: number, kbps: number);
    encodeBuffer(left: Int16Array, right?: Int16Array): Int8Array;
    flush(): Int8Array;
  }
  export const WavHeader: {
    RIFF: number;
    WAVE: number;
    fmt_: number;
    data: number;
    readHeader(dataView: DataView): {
      channels: number;
      sampleRate: number;
      dataOffset: number;
      dataLen: number;
    };
  };
}
