import { Buffer } from 'buffer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  init: vi.fn(), start: vi.fn(), stop: vi.fn(), remove: vi.fn(), create: vi.fn(), write: vi.fn(),
  callback: undefined as ((chunk: string) => void) | undefined,
}));
vi.mock('@fugood/react-native-audio-pcm-stream', () => ({ default: {
  init: mocks.init, start: mocks.start, stop: mocks.stop,
  on: (_event: string, callback: (chunk: string) => void) => {
    mocks.callback = callback;
    return { remove: mocks.remove };
  },
} }));
vi.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache' },
  File: class {
    uri = 'file:///cache/mimo-test.wav';
    create = mocks.create;
    write = mocks.write;
  },
}));
vi.mock('@mindwtr/core', () => ({ generateUUID: () => 'test' }));
import { createMiMoAudioRecorder } from './mimo-recorder';

const emit = (samples: number[]) => mocks.callback?.(Buffer.from(samples).toString('base64'));

describe('MiMo PCM recording', () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.callback = undefined;
    mocks.init.mockResolvedValue(undefined);
    mocks.stop.mockResolvedValue(undefined);
  });
  it('writes mono 16kHz PCM WAV including the final chunk before native stop resolves', async () => {
    const recorder = createMiMoAudioRecorder();
    expect(recorder.uri).toBeNull();
    await recorder.prepareToRecordAsync();
    expect(mocks.init).toHaveBeenCalledWith({ sampleRate: 16000, channels: 1, bitsPerSample: 16, audioSource: 6, bufferSize: 4096 });
    recorder.record(); emit([1, 2]);
    mocks.stop.mockImplementation(async () => { emit([3, 4]); });
    await recorder.stop(); await recorder.stop(); recorder.release();
    const bytes = mocks.write.mock.calls[0][0] as Uint8Array;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(Buffer.from(bytes.subarray(0, 4)).toString()).toBe('RIFF');
    expect(Buffer.from(bytes.subarray(8, 12)).toString()).toBe('WAVE');
    expect(view.getUint32(4, true)).toBe(40);
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint32(28, true)).toBe(32000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(4);
    expect(Array.from(bytes.subarray(44))).toEqual([1, 2, 3, 4]);
    expect(recorder.uri).toBe('file:///cache/mimo-test.wav');
    expect(mocks.stop).toHaveBeenCalledTimes(1);
    expect(mocks.write).toHaveBeenCalledTimes(1);
    expect(mocks.remove).toHaveBeenCalledTimes(1);
  });
  it('awaits native initialization and propagates failure without recording', async () => {
    mocks.init.mockRejectedValue(new Error('mic unavailable'));
    const recorder = createMiMoAudioRecorder();
    await expect(recorder.prepareToRecordAsync()).rejects.toThrow('mic unavailable');
    recorder.release();
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it('rejects empty recordings and removes the listener', async () => {
    const recorder = createMiMoAudioRecorder();
    await recorder.prepareToRecordAsync(); recorder.record();
    await expect(recorder.stop()).rejects.toThrow('empty');
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it('cancels without writing a recording', async () => {
    const recorder = createMiMoAudioRecorder();
    await recorder.prepareToRecordAsync(); recorder.record(); emit([1, 2]);
    recorder.release(); await Promise.resolve();
    expect(mocks.stop).toHaveBeenCalledTimes(1);
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(mocks.write).not.toHaveBeenCalled();
  });
});
