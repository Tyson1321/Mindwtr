/** Xiaomi MiMo ASR uses JSON chat completions instead of multipart transcriptions. */
export const MIMO_SPEECH_MODEL = 'mimo-v2.5-asr';
export const MIMO_SPEECH_BASE_URL = 'https://api.xiaomimimo.com/v1';
export const MIMO_SPEECH_PRESET = {
    enabled: true,
    provider: 'openai' as const,
    model: MIMO_SPEECH_MODEL,
    baseUrl: MIMO_SPEECH_BASE_URL,
    language: 'auto',
    mode: 'transcribe_only' as const,
};

export const isMiMoSpeechModel = (model: string): boolean => (
    model.trim().toLowerCase() === MIMO_SPEECH_MODEL
);

export function resolveMiMoSpeechEndpoint(baseUrl?: string): string {
    const base = (baseUrl?.trim() || MIMO_SPEECH_BASE_URL).replace(/\/+$/, '');
    return base.replace(/\/(?:chat\/completions|audio\/transcriptions)$/i, '') + '/chat/completions';
}

export function buildMiMoSpeechBody(bytes: Uint8Array, language = 'auto'): string {
    if (!bytes.length) throw new Error('MiMo: audio recording is empty.');
    const ascii = (start: number, length: number) => String.fromCharCode(...bytes.subarray(start, start + length));
    const wav = bytes.length >= 44 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE';
    const mp3 = ascii(0, 3) === 'ID3'
        || (bytes.length > 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0 && (bytes[1] & 0x06) !== 0);
    if (!wav && !mp3) throw new Error('MiMo requires WAV or MP3 audio. Record a new voice note with the MiMo preset.');
    const normalized = language.trim().toLowerCase().split(/[-_]/)[0];
    if (!['auto', 'zh', 'en'].includes(normalized)) throw new Error('MiMo supports auto, zh or en as the recognition language.');
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const chunks: string[] = [];
    for (let offset = 0; offset < bytes.length; offset += 12288) {
        let chunk = '';
        const end = Math.min(offset + 12288, bytes.length);
        for (let i = offset; i < end; i += 3) {
            const first = bytes[i], second = bytes[i + 1], third = bytes[i + 2];
            const value = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);
            chunk += alphabet[(value >> 18) & 63] + alphabet[(value >> 12) & 63]
                + (second === undefined ? '=' : alphabet[(value >> 6) & 63])
                + (third === undefined ? '=' : alphabet[value & 63]);
        }
        chunks.push(chunk);
    }
    return JSON.stringify({
        model: MIMO_SPEECH_MODEL,
        messages: [{ role: 'user', content: [{ type: 'input_audio', input_audio: {
            data: chunks.join(''), format: wav ? 'wav' : 'mp3',
        } }] }],
        asr_options: { language: normalized }, stream: false,
    });
}

export function readMiMoTranscript(result: unknown): string {
    const content = (result as { choices?: Array<{ message?: { content?: unknown } }> } | null)?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) throw new Error('MiMo returned no transcript.');
    return content.trim();
}
