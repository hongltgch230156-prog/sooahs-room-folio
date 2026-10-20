import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MagicTreeScene, type ViewMode } from './scene';
import MemePage from './MemePage';
import {
  SEASONS,
  SEASON_ORDER,
  BLOSSOM_SWATCHES,
  type SeasonId,
  type BlossomId,
  type Palette,
} from './scene/palette';
import { SPECIES, SPECIES_ORDER, type SpeciesId } from './scene/species';
import {
  SpringIcon,
  SummerIcon,
  AutumnIcon,
  ShareIcon,
  InfoIcon,
  BrandMark,
  OakIcon,
  PineIcon,
  WillowIcon,
  BirchIcon,
} from './ui/icons';

// Lấy API Key Giphy từ file .env
const GIPHY_KEY = import.meta.env.VITE_GIPHY_API_KEY as string | undefined;

// Danh sách từ khóa ngẫu nhiên để tìm meme
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

/**
 * Hàm gọi Giphy API để lấy ngẫu nhiên 1 đường link ảnh GIF trực tiếp
 */
async function fetchRandomGiphyUrl(): Promise<string> {
  const fallbackUrl = 'https://media.giphy.com/media/26u4cqiYI30juCOGY/giphy.gif';
  if (!GIPHY_KEY) {
    console.warn('Chưa cấu hình VITE_GIPHY_API_KEY trong .env');
    return fallbackUrl;
  }
  try {
    const params = new URLSearchParams({
      api_key: GIPHY_KEY,
      q: pick(MEME_KEYWORDS),
      limit: '1',
      offset: String(Math.floor(Math.random() * MAX_OFFSET)),
      rating: 'g',
    });
    const res = await fetch(`https://api.giphy.com/v1/gifs/search?${params}`);
    if (!res.ok) return fallbackUrl;
    const json = await res.json();
    const gifUrl = json?.data?.[0]?.images?.original?.url as string | undefined;
    return gifUrl || fallbackUrl;
  } catch (err) {
    console.error('Lỗi khi lấy GIF từ Giphy:', err);
    return fallbackUrl;
  }
}

const SEASON_ICONS: Record<SeasonId, () => React.ReactElement> = {
  spring: SpringIcon,
  summer: SummerIcon,
  autumn: AutumnIcon,
};

const SPECIES_ICONS: Record<SpeciesId, () => React.ReactElement> = {
  oak: OakIcon,
  pine: PineIcon,
  willow: WillowIcon,
  birch: BirchIcon,
};

/** Tạm dừng việc tái tạo lại cây để tránh chạy quá nhiều mỗi lần gõ phím. */
const REBUILD_DELAY = 500;

function MagicTreeApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<MagicTreeScene | null>(null);

  const [draft, setDraft] = useState('');
  // Trạng thái lưu URL thực sự được nạp vào QR
  const [committed, setCommitted] = useState('');
  const [season, setSeason] = useState<SeasonId>('summer');
  const [species, setSpecies] = useState<SpeciesId>('oak');
  const [blossom, setBlossom] = useState<BlossomId>('blush');
  const [mode, setMode] = useState<ViewMode>('tree');
  const [showInfo, setShowInfo] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const palette = useMemo<Palette>(() => {
    const base = SEASONS[season];
    if (season !== 'spring') return base;
    const swatch = BLOSSOM_SWATCHES.find((s) => s.id === blossom) ?? BLOSSOM_SWATCHES[0];
    return { ...base, leaf: [...swatch.leaf], qrLeaf: [...swatch.qr] };
  }, [season, blossom]);

  // Khởi tạo một GIF ngẫu nhiên ban đầu làm QR mặc định
  useEffect(() => {
    void fetchRandomGiphyUrl().then((url) => {
      setCommitted(url);
    });
  }, []);

  // ---- scene lifecycle ---------------------------------------------------
  useEffect(() => {
    if (!canvasRef.current) return;
    const scene = new MagicTreeScene(canvasRef.current, committed || 'https://giphy.com', palette, SPECIES[species]);
    sceneRef.current = scene;

    const onResize = () => scene.resize();
    window.addEventListener('orientationchange', onResize);

    const ro = new ResizeObserver(onResize);
    ro.observe(canvasRef.current);

    return () => {
      window.removeEventListener('orientationchange', onResize);
      ro.disconnect();
      scene.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sceneRef.current?.setPalette(palette);
  }, [palette]);

  useEffect(() => {
    if (committed) {
      sceneRef.current?.setText(committed);
    }
  }, [committed]);

  useEffect(() => {
    sceneRef.current?.setMode(mode);
  }, [mode]);

  useEffect(() => {
    sceneRef.current?.setSpecies(species);
  }, [species]);

  useEffect(() => {
    const el = dockRef.current;
    if (!el) return;
    const report = () => sceneRef.current?.setDockHeight(el.getBoundingClientRect().height);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Xử lý ô nhập: nếu có link -> gán link; nếu trống -> tự gọi Giphy lấy link ngẫu nhiên
  useEffect(() => {
    const t = window.setTimeout(() => {
      const trimmed = draft.trim();
      if (trimmed) {
        setCommitted(trimmed);
      } else {
        void fetchRandomGiphyUrl().then((url) => {
          setCommitted(url);
        });
      }
    }, REBUILD_DELAY);
    return () => window.clearTimeout(t);
  }, [draft]);

  // 1. Vòng lặp tự động đổi meme sau mỗi 1 phút (60 giây) nếu ô nhập đang trống
  useEffect(() => {
    const intervalTimer = setInterval(() => {
      if (!draft.trim()) {
        void fetchRandomGiphyUrl().then((url) => {
          setCommitted(url);
        });
      }
    }, 60000); // 60000 ms = đúng 1 phút

    return () => clearInterval(intervalTimer);
  }, [draft]);

  // 2. Xử lý ô nhập: nếu có link -> gán link; nếu trống -> tự gọi Giphy lấy link ngẫu nhiên
  useEffect(() => {
    const t = window.setTimeout(() => {
      const trimmed = draft.trim();
      if (trimmed) {
        setCommitted(trimmed);
      } else {
        void fetchRandomGiphyUrl().then((url) => {
          setCommitted(url);
        });
      }
    }, REBUILD_DELAY);
    return () => window.clearTimeout(t);
  }, [draft]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  // ---- interactions ----------------------
  const toggleMode = useCallback(() => {
    setMode((m) => (m === 'tree' ? 'code' : 'tree'));
  }, []);

  const share = useCallback(async () => {
    const url = committed;
    const payload = {
      title: 'Magic Tree',
      text: 'A tree that is also a scannable QR code.',
      url,
    };
    try {
      if (navigator.share) {
        await navigator.share(payload);
        return;
      }
      await navigator.clipboard.writeText(url);
      setToast('Link copied');
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') setToast('Could not share');
    }
  }, [committed]);

  const onCanvasKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleMode();
    }
  };

  const hint = mode === 'tree' ? 'Tap the tree to see the QR code' : 'Tap to see the tree';

  return (
    <div className="stage" style={{ background: palette.ground }}>
      <a className="brand" href="/" aria-label="Magic Tree home">
        <BrandMark />
        <span className="brand__text">
          <span className="brand__name">Magic Tree</span>
          <span className="brand__tag">3D QR</span>
        </span>
      </a>
      <div className="info">
        <button
          className="info__btn"
          type="button"
          aria-expanded={showInfo}
          aria-label="About this project"
          onClick={() => setShowInfo((v) => !v)}
        >
          <InfoIcon />
        </button>
        {showInfo && (
          <div className="info__card" role="dialog" aria-label="About Magic Tree">
            <p>
              <strong>1. Scan the tree.</strong> The ground is secretly a QR code. 
              Yes, the tree is hiding it.
            </p>
            <p>
              <strong>2. Watch it grow.</strong> Scan the code and let the leaves 
              fall into place, one by one.
            </p>
            <p>
              <strong>3. Enjoy the magic.</strong> Built with React & three.js. 
              No watering required. 🌳
            </p>
          </div>
        )}
      </div>
      <canvas
        ref={canvasRef}
        className="stage__canvas"
        role="button"
        tabIndex={0}
        aria-label={hint}
        onClick={toggleMode}
        onKeyDown={onCanvasKey}
      />
      <div className="dock" ref={dockRef}>
        <div className="dock__toast-anchor">
          {toast && <div className="toast">{toast}</div>}
          <button className="hint" type="button" onClick={toggleMode}>
            {hint}
          </button>
        </div>
        <div className="field">
          <input
            className="field__input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Enter your link..."
            aria-label="Link to encode"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
          <button
            className="field__action"
            type="button"
            onClick={share}
            aria-label="Share this tree"
          >
            <ShareIcon />
          </button>
        </div>
        <div className="field__status">
          Leave empty for a random surprise🤫👀
        </div>
        <div className="trees">
          {SPECIES_ORDER.map((id) => {
            const Icon = SPECIES_ICONS[id];
            return (
              <button
                key={id}
                className="tree"
                type="button"
                title={SPECIES[id].label}
                aria-pressed={species === id}
                onClick={() => setSpecies(id)}
              >
                <Icon />
                <span className="tree__label">{SPECIES[id].label}</span>
              </button>
            );
          })}
        </div>
        <div className="seasons">
          {SEASON_ORDER.map((id) => {
            const Icon = SEASON_ICONS[id];
            return (
              <button
                key={id}
                className="season"
                type="button"
                aria-pressed={season === id}
                onClick={() => setSeason(id)}
              >
                <Icon />
                <span className="season__label">{SEASONS[id].label}</span>
              </button>
            );
          })}
        </div>
        <div className="blossoms">
          {season === 'spring' &&
            BLOSSOM_SWATCHES.map((s) => (
              <button
                key={s.id}
                className="blossom"
                type="button"
                aria-pressed={blossom === s.id}
                aria-label={`${s.label} blossom`}
                style={{ background: s.leaf[0] }}
                onClick={() => setBlossom(s.id)}
              />
            ))}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const isMemePage = new URLSearchParams(window.location.search).has('meme');
  return isMemePage ? <MemePage /> : <MagicTreeApp />;
}