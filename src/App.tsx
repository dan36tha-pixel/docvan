import React, { useState, useRef, useEffect } from 'react';
import {
  Headphones,
  Link2,
  Download,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  FileText,
  Sparkles,
  CheckCircle2,
  Copy,
  Check,
  Globe,
  Radio,
  Clock,
  ChevronRight,
  ClipboardPaste,
  History,
  Trash2,
  AlertCircle,
  Share2,
  SlidersHorizontal,
  Smartphone,
  CheckCheck,
} from 'lucide-react';

interface ProcessResult {
  title: string;
  source: string;
  summary: string;
  keyPoints: string[];
  speechScript: string;
  audioBase64: string;
  mimeType: string;
  fileName: string;
  voiceName: string;
  durationEstimateSeconds: number;
  wordCount: number;
  originalUrl?: string | null;
  usedGeminiTTS?: boolean;
  hasGeminiKey?: boolean;
  timestamp?: number;
}

interface HistoryItem {
  id: string;
  title: string;
  source: string;
  summary: string;
  keyPoints: string[];
  speechScript: string;
  fileName: string;
  voiceName: string;
  durationEstimateSeconds: number;
  wordCount: number;
  timestamp: number;
  audioBase64: string;
  mimeType: string;
}

const SAMPLE_ARTICLES = [
  {
    name: 'VnExpress (Thời sự & Ngoại giao)',
    url: 'https://vnexpress.net/tong-bi-thu-chu-tich-nuoc-to-lam-viet-nam-muon-cung-nhat-ban-dong-hanh-dong-kien-tao-5142057.html',
    badge: 'Thời sự',
  },
  {
    name: 'Tuổi Trẻ (Khoa học công nghệ)',
    url: 'https://tuoitre.vn/khoa-hoc-cong-nghe.htm',
    badge: 'Khoa học',
  },
  {
    name: 'Dân Trí (Kinh tế số hoá)',
    url: 'https://dantri.com.vn/kinh-doanh.htm',
    badge: 'Kinh tế',
  },
];

const VOICES = [
  {
    id: 'StandardVi',
    label: 'Giọng Nữ chuẩn Việt',
    desc: 'Trong trẻo, tự nhiên, rõ chữ, chuẩn ngữ điệu tiếng Việt',
    tag: 'Khuyên dùng',
  },
  {
    id: 'Kore',
    label: 'Kore (Nữ truyền cảm)',
    desc: 'Giọng nữ ấm áp, phong cách phát thanh tin tức Gemini AI',
    tag: 'Phòng thu AI',
  },
  {
    id: 'Fenrir',
    label: 'Fenrir (Nam trầm ấm)',
    desc: 'Giọng nam chững chạc, uy lực, thời sự Gemini AI',
    tag: 'Thời sự',
  },
  {
    id: 'Puck',
    label: 'Puck (Nam hiện đại)',
    desc: 'Giọng nam tự nhiên, phong cách podcast năng động',
    tag: 'Podcast',
  },
];

export default function App() {
  const [url, setUrl] = useState('');
  const [rawText, setRawText] = useState('');
  const [inputMode, setInputMode] = useState<'url' | 'text'>('url');
  const [voice, setVoice] = useState('StandardVi');
  const [summaryLength, setSummaryLength] = useState<'standard' | 'concise'>('standard');
  const [autoDownload, setAutoDownload] = useState(true);
  const [showOptions, setShowOptions] = useState(false);

  // Processing state
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Result state
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [activeTab, setActiveTab] = useState<'script' | 'points'>('script');
  const [copied, setCopied] = useState(false);
  const [downloadToast, setDownloadToast] = useState(false);

  // History state
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Load history from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('bao_noi_history_v3');
      if (saved) {
        setHistory(JSON.parse(saved));
      }
    } catch (e) {
      console.warn('Could not load history:', e);
    }
  }, []);

  const saveToHistory = (item: ProcessResult) => {
    try {
      const newItem: HistoryItem = {
        id: Date.now().toString(),
        title: item.title,
        source: item.source,
        summary: item.summary,
        keyPoints: item.keyPoints,
        speechScript: item.speechScript,
        fileName: item.fileName,
        voiceName: item.voiceName,
        durationEstimateSeconds: item.durationEstimateSeconds,
        wordCount: item.wordCount,
        timestamp: Date.now(),
        audioBase64: item.audioBase64,
        mimeType: item.mimeType,
      };
      const updated = [newItem, ...history.filter((h) => h.title !== item.title)].slice(0, 10);
      setHistory(updated);
      localStorage.setItem('bao_noi_history_v3', JSON.stringify(updated));
    } catch (e) {
      console.warn('Could not save history:', e);
    }
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('bao_noi_history_v3');
  };

  // Convert base64 MP3 to Blob and automatically trigger download
  const createAudioBlobAndDownload = (
    base64: string,
    mime: string,
    fileName: string,
    triggerAuto: boolean
  ) => {
    try {
      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: mime || 'audio/mp3' });
      const newUrl = URL.createObjectURL(blob);
      setAudioUrl(newUrl);

      // Reset playback state
      setIsPlaying(false);
      setCurrentTime(0);

      if (triggerAuto) {
        const downloadLink = document.createElement('a');
        downloadLink.href = newUrl;
        downloadLink.download = fileName || 'tin_tuc_audio.mp3';
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);

        setDownloadToast(true);
        setTimeout(() => setDownloadToast(false), 5000);
      }
    } catch (e) {
      console.error('Lỗi khởi tạo file audio:', e);
    }
  };

  const handleProcess = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (inputMode === 'url' && !url.trim()) {
      setError('Vui lòng dán liên kết bài báo cần chuyển đổi.');
      return;
    }
    if (inputMode === 'text' && !rawText.trim()) {
      setError('Vui lòng dán hoặc nhập nội dung bài báo.');
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }

    setLoading(true);
    setError(null);
    setCurrentStep(1);

    const stepInterval = setInterval(() => {
      setCurrentStep((prev) => (prev < 3 ? prev + 1 : prev));
    }, 1500);

    try {
      const response = await fetch('/api/process-article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: inputMode === 'url' ? url.trim() : undefined,
          rawText: inputMode === 'text' ? rawText.trim() : undefined,
          voice,
          summaryLength,
        }),
      });

      clearInterval(stepInterval);

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Xảy ra lỗi trong quá trình xử lý bài báo.');
      }

      setCurrentStep(4);
      setResult(data);
      saveToHistory(data);
      createAudioBlobAndDownload(data.audioBase64, data.mimeType, data.fileName, autoDownload);

      // Smooth scroll to audio player
      setTimeout(() => {
        window.scrollTo({ top: 380, behavior: 'smooth' });
      }, 250);
    } catch (err: any) {
      clearInterval(stepInterval);
      setError(err.message || 'Không thể trích xuất bài báo. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  const handleManualDownload = () => {
    if (!result || !audioUrl) return;
    const a = document.createElement('a');
    a.href = audioUrl;
    a.download = result.fileName || 'tin_tuc_audio.mp3';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setDownloadToast(true);
    setTimeout(() => setDownloadToast(false), 4000);
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        if (text.startsWith('http://') || text.startsWith('https://')) {
          setInputMode('url');
          setUrl(text.trim());
        } else {
          setInputMode('text');
          setRawText(text.trim());
        }
      }
    } catch {
      setError('Trình duyệt chưa cho phép đọc bộ nhớ tạm. Bạn vui lòng nhấn giữ để dán.');
    }
  };

  const handleCopyScript = () => {
    if (!result?.speechScript) return;
    navigator.clipboard.writeText(result.speechScript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (!result) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: result.title,
          text: `Bản tin audio: ${result.title} (${result.source})`,
          url: result.originalUrl || window.location.href,
        });
      } catch {
        // User cancelled
      }
    } else {
      handleCopyScript();
    }
  };

  // Audio Player Controls
  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(console.error);
      setIsPlaying(true);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      setDuration(audioRef.current.duration || result?.durationEstimateSeconds || 0);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackRate(speed);
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  };

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds <= 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const loadHistoryItem = (item: HistoryItem) => {
    setResult({
      title: item.title,
      source: item.source,
      summary: item.summary,
      keyPoints: item.keyPoints,
      speechScript: item.speechScript,
      fileName: item.fileName,
      voiceName: item.voiceName,
      durationEstimateSeconds: item.durationEstimateSeconds,
      wordCount: item.wordCount,
      audioBase64: item.audioBase64,
      mimeType: item.mimeType,
    });
    createAudioBlobAndDownload(item.audioBase64, item.mimeType, item.fileName, false);
    setShowHistory(false);
    window.scrollTo({ top: 380, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#fafaf9] text-zinc-900 antialiased flex flex-col justify-between selection:bg-emerald-100 selection:text-emerald-900">
      {/* Hidden audio element for true native MP3 playback */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => setIsPlaying(false)}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />
      )}

      {/* Auto Download Toast Notification */}
      {downloadToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[94%] max-w-md bg-zinc-950 text-white px-4 py-3.5 rounded-2xl shadow-2xl flex items-center justify-between border border-emerald-500/40 backdrop-blur-md animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0">
              <Download className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <p className="text-xs sm:text-sm font-bold text-white flex items-center space-x-1.5">
                <span>Đã tự động tải file MP3 về máy!</span>
                <span className="text-[10px] bg-emerald-500 text-zinc-950 font-extrabold px-1.5 py-0.2 rounded-full">
                  MP3
                </span>
              </p>
              <p className="text-[11px] text-zinc-300">Giọng đọc tiếng Việt đã lưu trong thư mục Downloads.</p>
            </div>
          </div>
          <button
            onClick={() => setDownloadToast(false)}
            className="text-xs text-zinc-400 hover:text-white px-2.5 py-1 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Header */}
      <header className="border-b border-zinc-200/80 bg-white/90 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-zinc-900 text-white flex items-center justify-center shadow-xs">
              <Headphones className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-base tracking-tight">Báo Nói AI</span>
                <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Giọng Việt Chuẩn
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 hidden sm:block">
                Dán link báo • Giọng đọc tiếng Việt tự nhiên • Tự động tải MP3
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {history.length > 0 && (
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 active:bg-zinc-300 rounded-xl transition-all"
                title="Lịch sử các bài báo đã chuyển đổi"
              >
                <History className="w-3.5 h-3.5 text-zinc-600" />
                <span className="hidden sm:inline">Lịch sử</span>
                <span className="w-4 h-4 rounded-full bg-zinc-300 text-[10px] flex items-center justify-center font-bold text-zinc-800">
                  {history.length}
                </span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-3xl mx-auto px-4 py-6 sm:py-10 flex-1 w-full">
        {/* Banner Section */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-zinc-100 border border-zinc-200 text-zinc-700 text-xs font-medium mb-3">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            <span>Giọng đọc tiếng Việt tự nhiên, rõ từng chữ, chuẩn ngữ điệu phát thanh</span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-zinc-900 mb-2.5 font-serif-editorial">
            Chuyển Bài Báo Thành Giọng Đọc & Tải MP3
          </h1>

          <p className="text-xs sm:text-sm text-zinc-600 max-w-lg mx-auto leading-relaxed">
            Dán đường link bài báo từ VnExpress, Tuổi Trẻ, Dân Trí... Hệ thống sẽ trích xuất thông tin,
            lồng tiếng bằng giọng đọc tiếng Việt rõ ràng và tự động tải file MP3 về máy bạn.
          </p>
        </div>

        {/* Input Form Card */}
        <div className="bg-white rounded-2xl border border-zinc-200/90 shadow-sm p-4 sm:p-6 mb-8 transition-all">
          {/* Mode Switch Tabs */}
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3 mb-4">
            <div className="flex items-center space-x-1 bg-zinc-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setInputMode('url');
                  setError(null);
                }}
                className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  inputMode === 'url'
                    ? 'bg-white text-zinc-900 shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>Dán Link Bài Báo</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setInputMode('text');
                  setError(null);
                }}
                className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  inputMode === 'text'
                    ? 'bg-white text-zinc-900 shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Dán Văn Bản</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handlePasteClipboard}
              className="inline-flex items-center space-x-1 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 px-3 py-1.5 rounded-xl transition-colors border border-emerald-200"
            >
              <ClipboardPaste className="w-3.5 h-3.5 text-emerald-700" />
              <span>Dán nhanh</span>
            </button>
          </div>

          <form onSubmit={handleProcess}>
            {inputMode === 'url' ? (
              <div className="relative mb-3">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
                  <Globe className="w-5 h-5" />
                </div>
                <input
                  type="url"
                  placeholder="https://vnexpress.net/tieu-de-bai-bao..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={loading}
                  className="w-full pl-11 pr-20 py-3.5 bg-zinc-50 hover:bg-zinc-100/60 focus:bg-white border border-zinc-200 rounded-xl text-xs sm:text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all"
                />
                {url && (
                  <button
                    type="button"
                    onClick={() => setUrl('')}
                    className="absolute inset-y-0 right-2 px-2.5 flex items-center text-xs text-zinc-400 hover:text-zinc-700"
                  >
                    Xoá
                  </button>
                )}
              </div>
            ) : (
              <div className="mb-3">
                <textarea
                  rows={4}
                  placeholder="Dán nội dung bài báo, đoạn tin tức hoặc bài viết cần chuyển đổi giọng đọc vào đây..."
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  disabled={loading}
                  className="w-full p-3.5 bg-zinc-50 focus:bg-white border border-zinc-200 rounded-xl text-xs sm:text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all resize-y"
                />
              </div>
            )}

            {/* Sample link pills */}
            {inputMode === 'url' && (
              <div className="mb-4">
                <p className="text-[11px] text-zinc-500 mb-1.5 flex items-center space-x-1">
                  <span>Hoặc bấm thử các bài báo mẫu:</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {SAMPLE_ARTICLES.map((sample, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setUrl(sample.url)}
                      className="text-xs bg-zinc-100 hover:bg-zinc-200 text-zinc-700 px-2.5 py-1 rounded-lg border border-zinc-200 transition-colors flex items-center space-x-1.5"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span>{sample.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Voice & Duration Settings */}
            <div className="pt-2 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => setShowOptions(!showOptions)}
                className="flex items-center justify-between w-full text-xs font-semibold text-zinc-600 hover:text-zinc-900 py-1 transition-colors"
              >
                <span className="flex items-center space-x-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-500" />
                  <span>
                    Tùy chọn giọng đọc & độ dài ({VOICES.find((v) => v.id === voice)?.label})
                  </span>
                </span>
                <span className="text-[11px] text-zinc-400">
                  {showOptions ? 'Thu gọn ▲' : 'Tùy chỉnh ▼'}
                </span>
              </button>

              {showOptions && (
                <div className="mt-3 p-3.5 bg-zinc-50 rounded-xl border border-zinc-200 space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 mb-1.5">
                      Chọn phong cách giọng đọc tiếng Việt:
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {VOICES.map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => setVoice(v.id)}
                          className={`text-left p-2.5 rounded-xl border text-xs transition-all flex items-start justify-between ${
                            voice === v.id
                              ? 'bg-white border-zinc-900 shadow-xs font-semibold text-zinc-900'
                              : 'bg-white/70 border-zinc-200 text-zinc-600 hover:bg-white'
                          }`}
                        >
                          <div>
                            <div className="flex items-center space-x-1.5">
                              <Radio
                                className={`w-3.5 h-3.5 ${
                                  voice === v.id ? 'text-emerald-600' : 'text-zinc-400'
                                }`}
                              />
                              <span className="font-bold text-zinc-900">{v.label}</span>
                            </div>
                            <p className="text-[10px] text-zinc-500 mt-0.5 pl-5">{v.desc}</p>
                          </div>
                          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600">
                            {v.tag}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2.5 border-t border-zinc-200/80">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-zinc-700">Độ dài bản tin:</span>
                      <button
                        type="button"
                        onClick={() => setSummaryLength('standard')}
                        className={`px-3 py-1 text-xs rounded-lg transition-all ${
                          summaryLength === 'standard'
                            ? 'bg-zinc-900 text-white font-bold'
                            : 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300'
                        }`}
                      >
                        Đầy đủ (~2 phút)
                      </button>
                      <button
                        type="button"
                        onClick={() => setSummaryLength('concise')}
                        className={`px-3 py-1 text-xs rounded-lg transition-all ${
                          summaryLength === 'concise'
                            ? 'bg-zinc-900 text-white font-bold'
                            : 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300'
                        }`}
                      >
                        Súc tích (~1 phút)
                      </button>
                    </div>

                    <label className="flex items-center space-x-2 text-xs font-semibold text-zinc-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoDownload}
                        onChange={(e) => setAutoDownload(e.target.checked)}
                        className="w-4 h-4 rounded text-zinc-900 focus:ring-zinc-900 border-zinc-300"
                      />
                      <span>Tự động tải file MP3 khi xong</span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Error Message */}
            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start space-x-2.5">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-bold">Lỗi xử lý bài báo</p>
                  <p className="mt-0.5 text-red-600 leading-relaxed">{error}</p>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <div className="mt-5">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-6 rounded-xl font-bold text-sm text-white bg-zinc-900 hover:bg-zinc-800 active:scale-[0.99] disabled:bg-zinc-400 disabled:pointer-events-none transition-all shadow-sm flex items-center justify-center space-x-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Đang trích xuất & tạo giọng đọc tiếng Việt...</span>
                  </>
                ) : (
                  <>
                    <Headphones className="w-4 h-4 text-emerald-400" />
                    <span>Trích Xuất & Tự Động Tải MP3</span>
                    <ChevronRight className="w-4 h-4 text-zinc-400" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Loading Progress Stepper */}
        {loading && (
          <div className="bg-white rounded-2xl border border-zinc-200 p-5 sm:p-6 mb-8 shadow-xs animate-in fade-in duration-300">
            <div className="flex items-center space-x-2 mb-4">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              <h3 className="text-sm font-bold text-zinc-900">Tiến trình tạo giọng đọc MP3:</h3>
            </div>

            <div className="space-y-3.5">
              {[
                {
                  step: 1,
                  title: 'Bóc tách nội dung chính từ bài báo',
                  desc: 'Loại bỏ quảng cáo, menu và định dạng văn bản chuẩn',
                },
                {
                  step: 2,
                  title: 'Biên tập bản tin phát thanh tiếng Việt',
                  desc: 'Chuẩn hóa chữ số, tỷ lệ, ngày tháng và ngắt nghỉ tự nhiên',
                },
                {
                  step: 3,
                  title: 'Tổng hợp giọng đọc tiếng Việt chất lượng cao',
                  desc: 'Tạo giọng đọc chuẩn ngữ điệu, trong trẻo, dễ nghe',
                },
                {
                  step: 4,
                  title: 'Xuất file MP3 & Tự động tải về thiết bị',
                  desc: 'Lưu trực tiếp tệp MP3 vào máy của bạn',
                },
              ].map((item) => (
                <div key={item.step} className="flex items-start space-x-3">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                      currentStep > item.step
                        ? 'bg-emerald-600 text-white'
                        : currentStep === item.step
                        ? 'bg-zinc-900 text-white animate-pulse'
                        : 'bg-zinc-100 text-zinc-400'
                    }`}
                  >
                    {currentStep > item.step ? <Check className="w-3.5 h-3.5" /> : item.step}
                  </div>
                  <div>
                    <p
                      className={`text-xs font-semibold ${
                        currentStep >= item.step ? 'text-zinc-900' : 'text-zinc-400'
                      }`}
                    >
                      {item.title}
                    </p>
                    <p className="text-[11px] text-zinc-500">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Audio Player Card */}
        {result && (
          <div className="bg-white rounded-2xl border border-zinc-200/90 shadow-sm overflow-hidden mb-8 transition-all animate-in fade-in duration-300">
            {/* Header / Article Info */}
            <div className="p-5 sm:p-6 border-b border-zinc-100 bg-gradient-to-b from-zinc-50/50 to-white">
              <div className="flex flex-wrap items-center gap-2 mb-2.5">
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  {result.source}
                </span>
                <span className="text-xs text-zinc-500 flex items-center space-x-1 font-mono">
                  <Clock className="w-3 h-3 text-zinc-400" />
                  <span>~{formatTime(result.durationEstimateSeconds)}</span>
                </span>
                <span className="text-xs text-zinc-500">• {result.wordCount} từ</span>
                <span className="text-xs text-zinc-500">• MP3</span>
              </div>

              <h2 className="text-lg sm:text-2xl font-extrabold text-zinc-900 font-serif-editorial tracking-tight leading-snug mb-2.5">
                {result.title}
              </h2>

              <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
                {result.summary}
              </p>
            </div>

            {/* Custom Embedded Audio Player */}
            <div className="p-5 sm:p-6 bg-zinc-900 text-white">
              <div className="flex flex-col space-y-4">
                {/* Visualizer & Speed Controls */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5 h-8">
                    {Array.from({ length: 28 }).map((_, i) => (
                      <div
                        key={i}
                        className={`w-1 bg-emerald-400 rounded-full transition-all duration-300 ${
                          isPlaying ? 'animate-wave-bar' : 'h-2 opacity-40'
                        }`}
                        style={{
                          height: isPlaying
                            ? `${Math.max(12, (Math.sin(i * 0.6) + 1) * 14 + 4)}px`
                            : '4px',
                          animationDelay: `${(i % 5) * 0.16}s`,
                        }}
                      />
                    ))}
                  </div>

                  <div className="flex items-center space-x-2">
                    <div className="flex items-center space-x-1 bg-zinc-800 p-0.5 rounded-lg text-xs">
                      {[0.8, 1, 1.25, 1.5].map((speed) => (
                        <button
                          key={speed}
                          onClick={() => handleSpeedChange(speed)}
                          className={`px-2 py-1 rounded text-[11px] font-bold transition-colors ${
                            playbackRate === speed
                              ? 'bg-emerald-500 text-zinc-950'
                              : 'text-zinc-300 hover:text-white'
                          }`}
                        >
                          {speed}x
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={toggleMute}
                      className="p-2 text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                      title={isMuted ? 'Bật âm lượng' : 'Tắt tiếng'}
                    >
                      {isMuted ? (
                        <VolumeX className="w-4 h-4 text-red-400" />
                      ) : (
                        <Volume2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Scrubber Timeline */}
                <div className="space-y-1">
                  <input
                    type="range"
                    min="0"
                    max={duration || result.durationEstimateSeconds || 60}
                    step="0.1"
                    value={currentTime}
                    onChange={handleSeek}
                    className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                  />
                  <div className="flex justify-between text-[11px] text-zinc-400 font-mono">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration || result.durationEstimateSeconds)}</span>
                  </div>
                </div>

                {/* Primary Player Actions */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
                  <div className="flex items-center space-x-3.5">
                    <button
                      onClick={togglePlay}
                      className="w-12 h-12 rounded-full bg-emerald-400 text-zinc-950 flex items-center justify-center hover:bg-emerald-300 active:scale-95 transition-all shadow-md flex-shrink-0"
                      title={isPlaying ? 'Tạm dừng' : 'Phát giọng đọc tiếng Việt'}
                    >
                      {isPlaying ? (
                        <Pause className="w-5 h-5 fill-current" />
                      ) : (
                        <Play className="w-5 h-5 fill-current ml-0.5" />
                      )}
                    </button>

                    <div>
                      <p className="text-xs font-bold text-white">
                        {isPlaying ? 'Đang phát giọng đọc tiếng Việt...' : 'Sẵn sàng nghe bài báo'}
                      </p>
                      <p className="text-[11px] text-zinc-400">
                        {result.voiceName} • Tệp MP3 chuẩn
                      </p>
                    </div>
                  </div>

                  {/* Manual Download Button */}
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={handleManualDownload}
                      className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-white rounded-xl text-xs font-bold border border-zinc-700 transition-all shadow-xs"
                    >
                      <Download className="w-4 h-4 text-emerald-400" />
                      <span>Tải lại file MP3</span>
                    </button>

                    <button
                      onClick={handleShare}
                      className="p-2.5 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-zinc-300 hover:text-white rounded-xl border border-zinc-700 transition-colors"
                      title="Chia sẻ hoặc sao chép"
                    >
                      <Share2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Tab navigation */}
            <div className="border-b border-zinc-200 bg-zinc-50 flex items-center justify-between px-4 sm:px-6">
              <div className="flex space-x-4">
                <button
                  onClick={() => setActiveTab('script')}
                  className={`py-3 text-xs font-bold border-b-2 transition-colors flex items-center space-x-1.5 ${
                    activeTab === 'script'
                      ? 'border-zinc-900 text-zinc-900'
                      : 'border-transparent text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Kịch bản đọc phát thanh</span>
                </button>
                <button
                  onClick={() => setActiveTab('points')}
                  className={`py-3 text-xs font-bold border-b-2 transition-colors flex items-center space-x-1.5 ${
                    activeTab === 'points'
                      ? 'border-zinc-900 text-zinc-900'
                      : 'border-transparent text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Ý chính bài báo ({result.keyPoints?.length || 0})</span>
                </button>
              </div>

              {activeTab === 'script' && (
                <button
                  onClick={handleCopyScript}
                  className="inline-flex items-center space-x-1 text-xs text-zinc-600 hover:text-zinc-900 font-semibold py-1 px-2 rounded-lg hover:bg-zinc-200 transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Đã chép</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Sao chép kịch bản</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Tab Content */}
            <div className="p-5 sm:p-6 text-sm text-zinc-800">
              {activeTab === 'script' ? (
                <div className="space-y-3 font-serif-editorial text-base sm:text-lg leading-relaxed text-zinc-800 whitespace-pre-line bg-zinc-50 p-4 rounded-xl border border-zinc-100">
                  {result.speechScript}
                </div>
              ) : (
                <ul className="space-y-2.5">
                  {result.keyPoints.map((point, index) => (
                    <li
                      key={index}
                      className="flex items-start space-x-3 text-xs sm:text-sm text-zinc-700 bg-zinc-50 p-3 rounded-xl border border-zinc-100"
                    >
                      <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">
                        {index + 1}
                      </span>
                      <span className="leading-relaxed">{point}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Footer summary */}
            <div className="p-4 bg-zinc-50 border-t border-zinc-100 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="text-zinc-500 flex items-center space-x-1.5">
                <CheckCheck className="w-4 h-4 text-emerald-600" />
                <span className="font-medium">Tệp MP3 giọng đọc tiếng Việt đã được tải về máy của bạn</span>
              </div>

              <button
                onClick={() => {
                  setResult(null);
                  setUrl('');
                  setRawText('');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="px-3.5 py-1.5 rounded-xl border border-zinc-200 bg-white text-zinc-800 font-bold hover:bg-zinc-100 transition-colors shadow-2xs"
              >
                + Chuyển bài báo mới
              </button>
            </div>
          </div>
        )}

        {/* History Modal */}
        {showHistory && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full max-h-[85vh] flex flex-col shadow-2xl border border-zinc-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50">
                <div className="flex items-center space-x-2">
                  <History className="w-4 h-4 text-zinc-800" />
                  <h3 className="text-sm font-bold text-zinc-900">Lịch sử bài báo đã chuyển đổi</h3>
                </div>
                <div className="flex items-center space-x-2">
                  {history.length > 0 && (
                    <button
                      onClick={clearHistory}
                      className="text-xs text-red-600 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 flex items-center space-x-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Xóa hết</span>
                    </button>
                  )}
                  <button
                    onClick={() => setShowHistory(false)}
                    className="text-xs text-zinc-400 hover:text-zinc-600 p-1"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="p-4 overflow-y-auto space-y-3 flex-1">
                {history.length === 0 ? (
                  <p className="text-xs text-zinc-400 text-center py-8">
                    Chưa có bài báo nào được lưu trong lịch sử.
                  </p>
                ) : (
                  history.map((item) => (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-xl border border-zinc-200/90 bg-white hover:border-zinc-400 transition-all flex flex-col space-y-2 shadow-2xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-zinc-100 text-zinc-700 border border-zinc-200">
                            {item.source}
                          </span>
                          <h4 className="text-xs font-bold text-zinc-900 mt-1 line-clamp-1">
                            {item.title}
                          </h4>
                        </div>
                        <span className="text-[10px] text-zinc-400 font-mono flex-shrink-0">
                          {new Date(item.timestamp).toLocaleDateString('vi-VN')}
                        </span>
                      </div>

                      <p className="text-[11px] text-zinc-500 line-clamp-2 leading-relaxed">
                        {item.summary}
                      </p>

                      <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
                        <span className="text-[10px] text-zinc-500 font-mono">
                          ~{formatTime(item.durationEstimateSeconds)} • MP3
                        </span>
                        <button
                          onClick={() => loadHistoryItem(item)}
                          className="px-3 py-1 text-xs font-bold bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-colors flex items-center space-x-1"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>Mở nghe & Tải lại</span>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Feature Cards Grid */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-center">
          <div className="p-4 rounded-2xl bg-white border border-zinc-200/80 shadow-2xs">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto mb-2.5">
              <Download className="w-4 h-4" />
            </div>
            <h4 className="text-xs font-bold text-zinc-900 mb-1">Tự động tải MP3</h4>
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              Tải file âm thanh MP3 về máy tức thì ngay khi hoàn thành, tương thích mọi thiết bị.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-zinc-200/80 shadow-2xs">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center mx-auto mb-2.5">
              <Radio className="w-4 h-4" />
            </div>
            <h4 className="text-xs font-bold text-zinc-900 mb-1">Giọng Việt rõ từng chữ</h4>
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              Phát âm chuẩn tiếng Việt, xử lý chính xác chữ số, ngày tháng, phần trăm và từ viết tắt.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-zinc-200/80 shadow-2xs">
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center mx-auto mb-2.5">
              <Smartphone className="w-4 h-4" />
            </div>
            <h4 className="text-xs font-bold text-zinc-900 mb-1">Tối ưu trên di động</h4>
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              Giao diện tối giản, nút chạm lớn, hoạt động mượt mà trên Chrome, Safari di động.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200/80 bg-white py-6 mt-8 text-center text-xs text-zinc-500">
        <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <Headphones className="w-4 h-4 text-zinc-700" />
            <span className="font-bold text-zinc-800">Báo Nói AI</span>
            <span>— Chuyển báo điện tử thành giọng đọc tiếng Việt & Tải file MP3</span>
          </div>
          <p className="text-zinc-400 text-[11px]">
            Hỗ trợ VnExpress, Tuổi Trẻ, Dân Trí, VietnamNet và các bài báo tiếng Việt
          </p>
        </div>
      </footer>
    </div>
  );
}
