import { useCallback, useEffect, useState } from 'react';

const GIPHY_KEY = import.meta.env.VITE_GIPHY_API_KEY as string | undefined;

const MEME_KEYWORDS = [
  'funny meme',
  'cat meme',
  'dog meme',
  'wtf meme',
  'dank meme',
  'reaction meme',
  'trứng bắc thảo meme',
  've tró',
];

const MAX_OFFSET = 50;
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

interface Meme {
  url: string;
  title: string;
  page: string;
}

async function fetchRandomMeme(): Promise<Meme> {
  const fallback = {
    url: 'https://media.giphy.com/media/26u4cqiYI30juCOGY/giphy.gif',
    title: 'meme',
    page: 'https://giphy.com',
  };
  if (!GIPHY_KEY) return fallback;

  try {
    const params = new URLSearchParams({
      api_key: GIPHY_KEY,
      q: pick(MEME_KEYWORDS),
      limit: '1',
      offset: String(Math.floor(Math.random() * MAX_OFFSET)),
      rating: 'g',
    });
    const res = await fetch(`https://api.giphy.com/v1/gifs/search?${params}`);
    if (!res.ok) return fallback;
    const json = await res.json();
    const gif = json?.data?.[0];
    if (!gif) return fallback;
    return {
      url: gif.images.original.url as string,
      title: (gif.title as string) || 'meme',
      page: gif.url as string,
    };
  } catch {
    return fallback;
  }
}

export default function MemePage() {
  const [meme, setMeme] = useState<Meme | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false); // Bật/tắt tự động đổi meme

  const load = useCallback(async () => {
    setLoading(true);
    const newMeme = await fetchRandomMeme();
    setMeme(newMeme);
    setLoading(false);
  }, []);

  // Tải meme lần đầu khi mở trang
  useEffect(() => {
    void load();
  }, [load]);

  // Tự động đổi meme mỗi 4 giây nếu người dùng bật chế độ auto-slide (tùy chọn)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      void load();
    }, 4000);
    return () => clearInterval(interval);
  }, [autoRefresh, load]);

  return (
    <div className="meme" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#111', color: '#fff', padding: '20px', textAlign: 'center' }}>
      {loading && <p className="meme__msg">Đang triệu hồi meme độc lạ... 🔍</p>}
      
      {meme && !loading && (
        <a href={meme.page} target="_blank" rel="noopener noreferrer">
          <img className="meme__img" src={meme.url} alt={meme.title} style={{ maxWidth: '100%', maxHeight: '60vh', borderRadius: '12px', objectFit: 'contain' }} />
        </a>
      )}

      <div style={{ marginTop: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button 
          className="meme__again" 
          type="button" 
          onClick={() => void load()}
          style={{ padding: '12px 20px', borderRadius: '8px', background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}
        >
          🎲 Đổi meme khác ngay
        </button>

        <button 
          type="button" 
          onClick={() => setAutoRefresh(!autoRefresh)}
          style={{ padding: '12px 20px', borderRadius: '8px', background: autoRefresh ? '#ef4444' : '#10b981', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}
        >
          {autoRefresh ? '⏸ Tắt tự động chạy' : '▶ Tự động đổi mỗi 4s'}
        </button>
      </div>

      <span className="meme__credit" style={{ marginTop: '15px', fontSize: '12px', opacity: 0.6 }}>Powered by GIPHY • Mỗi người một cảm xúc!</span>
    </div>
  );
}