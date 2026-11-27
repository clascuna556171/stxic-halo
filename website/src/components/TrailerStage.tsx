import { useRef, useState } from 'react';
import { Play } from 'lucide-react';

export function TrailerStage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [hasStarted, setHasStarted] = useState(false);

  const handlePlayTrailer = () => {
    setHasStarted(true);
    const video = videoRef.current;
    if (video) {
      void video.play();
    }
  };

  return (
    <section id="trailer" className="studio-section studio-section--tinted">
      <div className="section-shell">
        <div className="section-header-narrow trailer-header">
          <h2>Watch Halo in action</h2>
          <p>
            See the top-bezel notch, hover capsule, multi-provider telemetry, and local proof of work in a 25-second
            launch walkthrough.
          </p>
        </div>

        <div className="trailer-frame">
          <div className="trailer-player-shell">
            <video
              ref={videoRef}
              className="trailer-video"
              src="./stxic-halo-launch.mp4"
              poster="./og-preview.png"
              controls={hasStarted}
              playsInline
              preload="metadata"
              aria-label="STXIC Halo 25-second launch trailer"
            />
            {!hasStarted && (
              <div className="trailer-cover-overlay">
                <button
                  type="button"
                  className="primary-pill-cta trailer-play-btn"
                  onClick={handlePlayTrailer}
                >
                  <Play size={16} fill="currentColor" aria-hidden="true" />
                  Watch 25s launch trailer
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
