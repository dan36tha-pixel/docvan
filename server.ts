import 'dotenv/config';
import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';
import { GoogleGenAI, Type } from '@google/genai';
import { Mp3Encoder, WavHeader } from '@breezystack/lamejs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '15mb' }));

const hasValidKey =
  !!process.env.GEMINI_API_KEY &&
  process.env.GEMINI_API_KEY.trim() !== '' &&
  process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY';

// Shared Gemini Client (server-side only)
const ai = new GoogleGenAI({
  apiKey: hasValidKey ? process.env.GEMINI_API_KEY! : 'placeholder',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

/**
 * Normalizes Vietnamese text for clear, natural speech synthesis
 */
function normalizeVietnameseSpeechText(text: string): string {
  return text
    .replace(/\bTP\.?\s*HCM\b/gi, 'thành phố Hồ Chí Minh')
    .replace(/\bTP\.?\s*HN\b/gi, 'thành phố Hà Nội')
    .replace(/\bUBND\b/g, 'Ủy ban nhân dân')
    .replace(/\bHĐND\b/g, 'Hội đồng nhân dân')
    .replace(/\bBộ GD-ĐT\b/gi, 'Bộ Giáo dục và Đào tạo')
    .replace(/\bBGDĐT\b/gi, 'Bộ Giáo dục và Đào tạo')
    .replace(/\bBYT\b/g, 'Bộ Y tế')
    .replace(/\bBCT\b/g, 'Bộ Công Thương')
    .replace(/\bBCA\b/g, 'Bộ Công an')
    .replace(/\bBQP\b/g, 'Bộ Quốc phòng')
    .replace(/(\d+)\s*%/g, '$1 phần trăm')
    .replace(/(\d+)\s*USD/gi, '$1 đô la Mỹ')
    .replace(/(\d+)\s*EUR/gi, '$1 ơ-rô')
    .replace(/(\d+)\s*km\/h/gi, '$1 ki-lô-mét một giờ')
    .replace(/(\d+)\s*km\b/gi, '$1 ki-lô-mét')
    .replace(/(\d+)\s*m2\b/gi, '$1 mét vuông')
    .replace(/(\d+)\s*m3\b/gi, '$1 mét khối')
    .replace(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g, 'ngày $1 tháng $2 năm $3')
    .replace(/(\d{1,2})\/(\d{1,2})/g, 'ngày $1 tháng $2')
    .replace(/\bAI\b/g, 'trí tuệ nhân tạo')
    .replace(/\bGDP\b/g, 'G-D-P')
    .replace(/[\"“”„«»]/g, '')
    .replace(/[\(\)\[\]\{\}]/g, ', ')
    .replace(/[-–—]/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Splits text into natural sentence chunks suitable for Google TTS API
 */
function splitTextIntoTTSChunks(text: string, maxLength = 160): string[] {
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/([.?!;:])\s+/g, '$1|')
    .replace(/,\s+/g, ',|')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';

  for (const s of normalized) {
    if ((current + ' ' + s).trim().length <= maxLength) {
      current = (current + ' ' + s).trim();
    } else {
      if (current) chunks.push(current);
      if (s.length <= maxLength) {
        current = s;
      } else {
        const words = s.split(' ');
        let sub = '';
        for (const w of words) {
          if ((sub + ' ' + w).trim().length <= maxLength) {
            sub = (sub + ' ' + w).trim();
          } else {
            if (sub) chunks.push(sub);
            sub = w;
          }
        }
        current = sub;
      }
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

/**
 * Synthesizes natural Vietnamese voice audio in MP3 format
 */
async function synthesizeVietnameseTTS(text: string): Promise<Buffer> {
  const normalizedText = normalizeVietnameseSpeechText(text);
  const chunks = splitTextIntoTTSChunks(normalizedText, 160);
  const audioBuffers: Buffer[] = [];

  for (const chunk of chunks) {
    const url =
      'https://translate.google.com/translate_tts?ie=UTF-8&q=' +
      encodeURIComponent(chunk) +
      '&tl=vi&client=tw-ob';

    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'audio/mpeg,audio/*;q=0.9,*/*;q=0.8',
        'Accept-Language': 'vi,en;q=0.9',
      },
    });

    if (!res.ok) {
      throw new Error(`TTS API phản hồi mã lỗi ${res.status}`);
    }

    const arrayBuf = await res.arrayBuffer();
    audioBuffers.push(Buffer.from(arrayBuf));
  }

  return Buffer.concat(audioBuffers);
}

/**
 * Converts standard 16-bit PCM WAV to MP3 using pure JavaScript
 */
function wavToMp3(wavBuffer: Buffer): Buffer {
  const dataView = new DataView(wavBuffer.buffer, wavBuffer.byteOffset, wavBuffer.byteLength);
  let channels = 1;
  let sampleRate = 24000;
  let dataOffset = 44;

  try {
    const headerReader = (WavHeader as any)?.readHeader;
    if (typeof headerReader === 'function') {
      const header = headerReader(dataView);
      if (header) {
        channels = header.channels || 1;
        sampleRate = header.sampleRate || 24000;
        dataOffset = header.dataOffset || 44;
      }
    }
  } catch {
    channels = 1;
    sampleRate = 24000;
    dataOffset = 44;
  }

  const pcmBytes = wavBuffer.subarray(dataOffset);
  const sampleCount = Math.floor(pcmBytes.length / 2);
  const samples = new Int16Array(pcmBytes.buffer, pcmBytes.byteOffset, sampleCount);

  const encoder = new Mp3Encoder(channels, sampleRate, 128);
  const mp3Data: Buffer[] = [];
  const blockSize = 1152;

  if (channels === 1) {
    for (let i = 0; i < samples.length; i += blockSize) {
      const chunk = samples.subarray(i, i + blockSize);
      const mp3buf = encoder.encodeBuffer(chunk);
      if (mp3buf.length > 0) mp3Data.push(Buffer.from(mp3buf));
    }
  } else {
    const half = Math.floor(sampleCount / 2);
    const left = new Int16Array(half);
    const right = new Int16Array(half);
    for (let i = 0, j = 0; i < half * 2; i += 2, j++) {
      left[j] = samples[i];
      right[j] = samples[i + 1];
    }
    for (let i = 0; i < left.length; i += blockSize) {
      const leftChunk = left.subarray(i, i + blockSize);
      const rightChunk = right.subarray(i, i + blockSize);
      const mp3buf = encoder.encodeBuffer(leftChunk, rightChunk);
      if (mp3buf.length > 0) mp3Data.push(Buffer.from(mp3buf));
    }
  }

  const flush = encoder.flush();
  if (flush.length > 0) mp3Data.push(Buffer.from(flush));

  return Buffer.concat(mp3Data);
}

function sanitizeFilename(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9_\-\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 50)
    .toLowerCase();
}

/**
 * Intelligent Vietnamese NLP summarizer
 */
function localExtractAndSummarize(
  title: string,
  source: string,
  content: string,
  summaryLength: string
) {
  const sentences = content
    .replace(/([.?!])\s+/g, '$1|')
    .split('|')
    .map((s) => s.trim())
    .filter((s) => s.length > 25 && !s.includes('Ảnh:') && !s.includes('Nguồn:'));

  const leadCount = summaryLength === 'concise' ? 2 : 4;
  const leadSentences = sentences.slice(0, leadCount);
  const summary = leadSentences.join(' ');

  const keyPoints = sentences
    .filter((s) => s.length > 30 && s.length < 180)
    .slice(0, summaryLength === 'concise' ? 3 : 4);

  const cleanTitle = title || 'Bản tin audio';
  const cleanSource = source || 'Báo điện tử';

  const speechScript = `Chào quý thính giả, sau đây là điểm tin từ bài báo: ${cleanTitle}, đăng trên ${cleanSource}.\n\n${summary}\n\nCảm ơn quý vị đã chú ý lắng nghe bản tin.`;

  return {
    title: cleanTitle,
    source: cleanSource,
    summary,
    keyPoints: keyPoints.length > 0 ? keyPoints : [summary],
    speechScript,
  };
}

/**
 * Main article processing route
 */
app.post('/api/process-article', async (req: Request, res: Response): Promise<void> => {
  try {
    const { url, rawText, voice = 'StandardVi', summaryLength = 'standard' } = req.body;

    if (!url && !rawText) {
      res.status(400).json({ error: 'Vui lòng cung cấp link bài báo hoặc dán văn bản.' });
      return;
    }

    let articleContent = '';
    let extractedTitle = '';
    let sourceDomain = '';

    if (url) {
      try {
        const parsedUrl = new URL(url);
        sourceDomain = parsedUrl.hostname.replace(/^www\./, '');
      } catch {
        res.status(400).json({ error: 'Đường dẫn URL không hợp lệ. Vui lòng kiểm tra lại.' });
        return;
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'vi,en-US;q=0.9,en;q=0.8',
          },
        });
        clearTimeout(timeout);

        if (!response.ok) {
          throw new Error(`Trang web trả về mã phản hồi ${response.status}`);
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        extractedTitle =
          $('meta[property="og:title"]').attr('content') ||
          $('meta[name="twitter:title"]').attr('content') ||
          $('h1.title-detail, h1.article-title, h1').first().text().trim() ||
          $('title').text().trim();

        // Remove ads, scripts, nav
        $(
          'script, style, noscript, nav, header, footer, iframe, aside, svg, ' +
          '.ads, .advertisement, .ad, .social-share, .comments, .related-posts, ' +
          '#comments, .author-info, .sidebar, .banner, .menu'
        ).remove();

        const candidates = [
          'article',
          '[itemprop="articleBody"]',
          '.fck_detail',
          '.detail-content',
          '.article-content',
          '.article-body',
          '.content-detail',
          '.post-content',
          'main',
        ];

        let contentEl = null;
        for (const sel of candidates) {
          const el = $(sel);
          if (el.length > 0 && el.text().trim().length > 180) {
            contentEl = el;
            break;
          }
        }

        const paragraphs: string[] = [];
        if (contentEl) {
          contentEl.find('p, h2, h3').each((_, el) => {
            const t = $(el).text().trim();
            if (t.length > 25 && !t.includes('Ảnh:') && !t.includes('Nguồn:')) {
              paragraphs.push(t);
            }
          });
        }

        if (paragraphs.length === 0) {
          $('p').each((_, el) => {
            const t = $(el).text().trim();
            if (t.length > 30) paragraphs.push(t);
          });
        }

        articleContent = paragraphs.join('\n\n');
      } catch (fetchErr: any) {
        console.warn('Direct fetch warning:', fetchErr.message);
        articleContent = `Đường dẫn bài báo: ${url}.`;
      }
    }

    if (rawText && rawText.trim().length > 0) {
      articleContent = rawText.trim();
      if (!extractedTitle) {
        extractedTitle = articleContent.slice(0, 70).split('\n')[0];
      }
    }

    if (!articleContent || articleContent.length < 30) {
      res.status(400).json({
        error:
          'Không thể trích xuất nội dung từ bài báo. Bạn có thể chọn tab "Nhập Văn Bản" để dán trực tiếp đoạn tin tức.',
      });
      return;
    }

    const truncated = articleContent.slice(0, 18000);

    // Step 1: Article analysis & speech script compilation
    let finalTitle = extractedTitle || 'Bản tin audio';
    let finalSource = sourceDomain || 'Báo điện tử';
    let summary = '';
    let keyPoints: string[] = [];
    let speechScript = '';
    let isAiKeyAvailable = hasValidKey;

    if (isAiKeyAvailable) {
      try {
        const analysisPrompt = `Bạn là một biên tập viên phát thanh và phát thanh viên thời sự chuyên nghiệp của đài tiếng nói Việt Nam.
Nhiệm vụ của bạn là đọc nội dung bài báo sau, trích xuất thông tin cốt lõi và biên soạn thành một BẢN TIN PHÁT THANH NÓI TIẾNG VIỆT tự nhiên, truyền cảm, cuốn hút để chuyển thành giọng đọc AI.

Nội dung bài báo:
"""
${truncated}
"""

Yêu cầu biên soạn:
1. "title": Tiêu đề bài báo rõ ràng, chuẩn tiếng Việt.
2. "source": Tên cơ quan báo chí hoặc nguồn xuất bản (VD: VnExpress, Tuổi Trẻ, Dân Trí, v.v.).
3. "summary": Tóm tắt súc tích bài báo trong 2-3 câu ngắn.
4. "keyPoints": Mảng từ 3 đến 5 ý chính quan trọng nhất của bài báo.
5. "speechScript": Kịch bản đọc phát thanh hoàn chỉnh bằng tiếng Việt:
   - Phong cách: Tự nhiên, mở đầu thu hút ("Chào quý thính giả, sau đây là điểm tin chính từ bài báo [Tiêu đề]...").
   - Kỹ thuật TTS: Hãy phiên âm các con số, năm, phần trăm, tiền tệ thành chữ viết để giọng đọc AI phát âm chuẩn xác nhất (ví dụ: "năm 2025" đọc là "năm hai nghìn không trăm hai mươi lăm", "50%" -> "năm mươi phần trăm", "USD" -> "đô la Mỹ").
   - Độ dài kịch bản: ${summaryLength === 'concise' ? 'Khoảng 100-150 từ (súc tích)' : 'Khoảng 180-260 từ (chi tiết)'}.
   - Kết thúc bằng một lời kết ngắn gọn ("Cảm ơn quý vị đã chú ý theo dõi bản tin.").`;

        const geminiResponse = await Promise.race([
          ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: analysisPrompt,
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  source: { type: Type.STRING },
                  summary: { type: Type.STRING },
                  keyPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
                  speechScript: { type: Type.STRING },
                },
                required: ['title', 'source', 'summary', 'keyPoints', 'speechScript'],
              },
            },
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Gemini API timeout')), 14000)
          ),
        ]);

        const parsed = JSON.parse(geminiResponse.text || '{}');
        if (parsed.title) finalTitle = parsed.title;
        if (parsed.source) finalSource = parsed.source;
        summary = parsed.summary || '';
        keyPoints = parsed.keyPoints || [];
        speechScript = parsed.speechScript || '';
      } catch (geminiError: any) {
        console.warn('Gemini text analysis fallback:', geminiError.message);
        isAiKeyAvailable = false;
      }
    }

    if (!speechScript) {
      const fallback = localExtractAndSummarize(
        finalTitle,
        finalSource,
        truncated,
        summaryLength
      );
      finalTitle = fallback.title;
      finalSource = fallback.source;
      summary = fallback.summary;
      keyPoints = fallback.keyPoints;
      speechScript = fallback.speechScript;
    }

    // Step 2: High-Quality Vietnamese Speech Synthesis (MP3)
    let mp3Buffer: Buffer | null = null;
    let voiceUsed = 'Giọng Nữ chuẩn phát thanh (Tiếng Việt)';

    // If user explicitly picked a Gemini AI studio voice and API key is present:
    if (isAiKeyAvailable && ['Kore', 'Fenrir', 'Puck', 'Zephyr'].includes(voice)) {
      try {
        const ttsResponse = await Promise.race([
          ai.models.generateContent({
            model: 'gemini-3.8-flash-lite-tts',
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: speechScript,
                    speechMetadata: {
                      style: 'Giọng đọc phát thanh viên tiếng Việt truyền cảm, rõ ràng, tốc độ vừa phải, ngữ điệu tự nhiên chuẩn xác',
                    },
                  },
                ],
              },
            ],
            config: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: voice },
                },
              },
            },
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('TTS timeout')), 16000)
          ),
        ]);

        const base64Wav =
          ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Wav) {
          const wavBuffer = Buffer.from(base64Wav, 'base64');
          mp3Buffer = wavToMp3(wavBuffer);
          voiceUsed = `Gemini AI Studio (${voice})`;
        }
      } catch (ttsErr: any) {
        console.warn('Gemini TTS warning, switching to native Vietnamese TTS:', ttsErr.message);
      }
    }

    // Default & highly reliable: Native Vietnamese Speech Engine (Google Translate Vietnamese TTS)
    if (!mp3Buffer) {
      try {
        mp3Buffer = await synthesizeVietnameseTTS(speechScript);
        voiceUsed = 'Giọng Nữ phát thanh viên tiếng Việt';
      } catch (nativeTtsErr: any) {
        console.error('Lỗi tổng hợp giọng đọc tiếng Việt:', nativeTtsErr);
        throw new Error('Không thể tạo file âm thanh tiếng Việt. Vui lòng thử lại sau.');
      }
    }

    const safeSlug = sanitizeFilename(finalTitle) || 'ban_tin_audio';
    const fileName = `${safeSlug}.mp3`;
    const words = speechScript.trim().split(/\s+/).length;
    // Average reading rate: ~140 words/min
    const estimatedSeconds = Math.max(10, Math.round((words / 140) * 60));

    res.json({
      success: true,
      title: finalTitle,
      source: finalSource,
      summary,
      keyPoints,
      speechScript,
      audioBase64: mp3Buffer.toString('base64'),
      mimeType: 'audio/mp3',
      fileName,
      voiceName: voiceUsed,
      durationEstimateSeconds: estimatedSeconds,
      wordCount: words,
      originalUrl: url || null,
      usedGeminiTTS: voiceUsed.includes('Gemini'),
      hasGeminiKey: isAiKeyAvailable,
    });
  } catch (error: any) {
    console.error('Lỗi xử lý bài báo:', error);
    res.status(500).json({
      error: error.message || 'Đã xảy ra lỗi trong quá trình trích xuất và chuyển đổi giọng đọc.',
    });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    hasApiKey: hasValidKey,
  });
});

async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        port: PORT,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
