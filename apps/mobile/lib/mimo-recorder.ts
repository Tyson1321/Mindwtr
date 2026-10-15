import { Buffer } from 'buffer';
import { File, Paths } from 'expo-file-system';
import { generateUUID } from '@mindwtr/core';

export type CaptureAudioRecorder = {
    readonly uri?: string | null;
    prepareToRecordAsync(): Promise<void>;
    record(): void;
    stop(): Promise<void>;
    release(): Promise<void> | void;
};

type PcmStream = {
    init(options: { sampleRate: number; channels: number; bitsPerSample: number; audioSource: number; bufferSize: number }): Promise<void> | void;
    on(event: 'data', callback: (chunk: string) => void): { remove(): void };
    start(): void;
    stop(): Promise<void> | void;
};

/** The bundled PCM recorder produces WAV; Expo's default M4A is not supported by MiMo. */
export function createMiMoAudioRecorder(): CaptureAudioRecorder {
    const file = new File(Paths.cache, `mimo-${generateUUID()}.wav`);
    let stream: PcmStream | undefined;
    let subscription: { remove(): void } | undefined;
    let chunks: Uint8Array[] = [];
    let active = false;
    let initialized = false;
    let stopped: Promise<void> | undefined;
    let uri: string | null = null;
    return {
        get uri() { return uri; },
        async prepareToRecordAsync() {
            // Delay native loading so Expo Go and non-native tests can load the screen.
            stream = (await import('@fugood/react-native-audio-pcm-stream')).default;
            if (!stream) throw new Error('MiMo recording requires an installed app build.');
            await stream.init({ sampleRate: 16000, channels: 1, bitsPerSample: 16, audioSource: 6, bufferSize: 4096 });
            initialized = true;
            subscription = stream.on('data', (chunk) => {
                if (active) chunks.push(new Uint8Array(Buffer.from(chunk, 'base64')));
            });
        },
        record() {
            if (!stream) throw new Error('MiMo recorder is not prepared.');
            active = true;
            stream.start();
        },
        stop() {
            if (stopped) return stopped;
            stopped = (async () => {
                try { if (active) await stream?.stop(); }
                finally { active = false; subscription?.remove(); subscription = undefined; }
                const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
                if (!length) throw new Error('Audio recording is empty.');
                const bytes = new Uint8Array(44 + length);
                const view = new DataView(bytes.buffer);
                const text = (offset: number, value: string) => {
                    for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i);
                };
                text(0, 'RIFF'); view.setUint32(4, 36 + length, true);
                text(8, 'WAVE'); text(12, 'fmt '); view.setUint32(16, 16, true);
                view.setUint16(20, 1, true); view.setUint16(22, 1, true);
                view.setUint32(24, 16000, true); view.setUint32(28, 32000, true);
                view.setUint16(32, 2, true); view.setUint16(34, 16, true);
                text(36, 'data'); view.setUint32(40, length, true);
                let offset = 44;
                for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
                chunks = [];
                file.create({ overwrite: true }); file.write(bytes);
                uri = file.uri;
            })();
            return stopped;
        },
        async release() {
            subscription?.remove(); subscription = undefined; chunks = [];
            active = false;
            // init allocates the Android microphone even if record() was never called.
            if (initialized && !stopped) {
                initialized = false;
                await stream?.stop();
            }
        },
    };
}
