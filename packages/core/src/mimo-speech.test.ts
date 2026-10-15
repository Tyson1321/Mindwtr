import { Buffer } from 'node:buffer';
import { describe, expect, it, vi } from 'vitest';
import { buildMiMoSpeechBody, isMiMoSpeechModel, MIMO_SPEECH_BASE_URL, readMiMoTranscript, resolveMiMoSpeechEndpoint } from './mimo-speech';
import { runRemoteSpeechToTaskCapture } from './speech-to-task';

const wav = (length = 48) => {
    const bytes = new Uint8Array(length);
    bytes.set([82, 73, 70, 70]); bytes.set([87, 65, 86, 69], 8);
    return bytes;
};

describe('Xiaomi MiMo speech', () => {
    it('accepts root URLs, trailing slashes and full endpoints', () => {
        const endpoint = MIMO_SPEECH_BASE_URL + '/chat/completions';
        for (const base of [undefined, '', MIMO_SPEECH_BASE_URL, MIMO_SPEECH_BASE_URL + '/', endpoint, MIMO_SPEECH_BASE_URL + '/audio/transcriptions']) {
            expect(resolveMiMoSpeechEndpoint(base)).toBe(endpoint);
        }
        expect(resolveMiMoSpeechEndpoint('https://example.com/v1')).toBe('https://example.com/v1/chat/completions');
    });
    it('selects only the dedicated ASR model', () => {
        expect(isMiMoSpeechModel(' MIMO-V2.5-ASR ')).toBe(true);
        expect(isMiMoSpeechModel('whisper-1')).toBe(false);
        expect(isMiMoSpeechModel('mimo-v2.5')).toBe(false);
    });
    it.each([44, 45, 46, 12287, 12288, 12289, 25000])('preserves base64 padding and chunk boundaries (%i bytes)', (length) => {
        const bytes = wav(length);
        for (let i = 12; i < length; i++) bytes[i] = i % 256;
        const body = JSON.parse(buildMiMoSpeechBody(bytes, 'zh-CN'));
        expect(body.model).toBe('mimo-v2.5-asr');
        expect(body.messages[0].content[0].input_audio).toEqual({ data: Buffer.from(bytes).toString('base64'), format: 'wav' });
        expect(body.asr_options).toEqual({ language: 'zh' });
        expect(body.stream).toBe(false);
    });
    it('supports MP3 but rejects M4A, AAC, empty audio and unsupported language', () => {
        expect(JSON.parse(buildMiMoSpeechBody(new Uint8Array([73, 68, 51, 0]))).messages[0].content[0].input_audio.format).toBe('mp3');
        for (const bytes of [new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]), new Uint8Array([255, 241, 0, 0])]) {
            expect(() => buildMiMoSpeechBody(bytes)).toThrow('WAV or MP3');
        }
        expect(() => buildMiMoSpeechBody(new Uint8Array())).toThrow('empty');
        expect(() => buildMiMoSpeechBody(wav(), 'fr')).toThrow('auto, zh or en');
    });
    it('requires a non-empty transcript', () => {
        expect(readMiMoTranscript({ choices: [{ message: { content: '  明天完成说明书  ' } }] })).toBe('明天完成说明书');
        for (const result of [null, {}, { choices: [] }, { choices: [{ message: { content: '' } }] }]) expect(() => readMiMoTranscript(result)).toThrow('no transcript');
    });
    it('sends one JSON request to Xiaomi and never invokes multipart or OpenAI parsing', async () => {
        const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '记录工作' } }] })));
        const upload = vi.fn();
        const result = await runRemoteSpeechToTaskCapture({ provider: 'openai', model: 'mimo-v2.5-asr', apiKey: 'test-mimo-key', mode: 'smart_parse' }, {
            readBytes: async () => ({ bytes: wav(), mimeType: 'audio/wav' }), withOpenAIUpload: upload,
        }, { fetcher });
        expect(result).toEqual({ transcript: '记录工作' });
        expect(upload).not.toHaveBeenCalled();
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(fetcher.mock.calls[0][0]).toBe(MIMO_SPEECH_BASE_URL + '/chat/completions');
        const init = fetcher.mock.calls[0][1] as RequestInit;
        expect(init.headers).toEqual({ 'Content-Type': 'application/json', 'api-key': 'test-mimo-key' });
        expect(JSON.parse(init.body as string).model).toBe('mimo-v2.5-asr');
    });
    it('validates key, adapter and audio before making network requests', async () => {
        const fetcher = vi.fn<typeof fetch>();
        const config = { provider: 'openai' as const, model: 'mimo-v2.5-asr' };
        const audio = { readBytes: async () => ({ bytes: new Uint8Array([1, 2, 3]), mimeType: 'audio/mp4' }) };
        await expect(runRemoteSpeechToTaskCapture(config, audio, { fetcher })).rejects.toThrow('API key missing');
        await expect(runRemoteSpeechToTaskCapture({ ...config, apiKey: 'test-key' }, {}, { fetcher })).rejects.toThrow('adapter missing');
        await expect(runRemoteSpeechToTaskCapture({ ...config, apiKey: 'test-key' }, audio, { fetcher })).rejects.toThrow('WAV or MP3');
        expect(fetcher).not.toHaveBeenCalled();
    });
    it('surfaces API errors and invalid responses', async () => {
        const config = { provider: 'openai' as const, model: 'mimo-v2.5-asr', apiKey: 'test-key' };
        const audio = { readBytes: async () => ({ bytes: wav(), mimeType: 'audio/wav' }) };
        await expect(runRemoteSpeechToTaskCapture(config, audio, { fetcher: vi.fn<typeof fetch>().mockResolvedValue(new Response('Unauthorized', { status: 401 })) })).rejects.toThrow('Unauthorized');
        await expect(runRemoteSpeechToTaskCapture(config, audio, { fetcher: vi.fn<typeof fetch>().mockResolvedValue(new Response('{}')) })).rejects.toThrow('no transcript');
    });
});
