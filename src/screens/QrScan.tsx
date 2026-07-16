import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { validateJobCode } from '../api';
import { Layout } from '../components/Layout';
import { ArrowLeft } from 'lucide-react';
import { playSound } from '../utils/audio';

export function QrScan() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const validatingRef = useRef(false);
  const previousErrorRef = useRef<string | null>(null);

  useEffect(() => {
    const nextError = error;
    if (nextError && nextError !== previousErrorRef.current) {
      playSound('invalidCode', 0.8);
    }
    previousErrorRef.current = nextError;
  }, [error]);

  useEffect(() => {
    let mounted = true;
    const scanner = new Html5Qrcode('qr-reader');
    scannerRef.current = scanner;

    const startScanner = async () => {
      try {
        await scanner.start(
          { facingMode: 'user' },
          {
            fps: 24,
            qrbox: { width: 240, height: 240 },
            aspectRatio: 1.0,
            disableFlip: false,
          },
          async (decodedText) => {
            if (validatingRef.current || !mounted) return;

            let code = decodedText;
            try {
              const parsed = JSON.parse(decodedText);
              if (parsed.code) code = parsed.code;
            } catch {
              // Not JSON, use raw code.
            }

            validatingRef.current = true;
            scanner.pause();

            const result = await validateJobCode(code);
            if (!mounted) return;

            if (result.job) {
              sessionStorage.setItem('arox_current_job', JSON.stringify(result.job));
              scanner.stop().then(() => {
                navigate(`/confirm/${result.job!.id}`, { state: { job: result.job } });
              }).catch(() => {
                navigate(`/confirm/${result.job!.id}`, { state: { job: result.job } });
              });
            } else {
              setError(result.error || 'Invalid QR code. Please try again.');
              setTimeout(() => {
                if (mounted) {
                  setError(null);
                  validatingRef.current = false;
                  scanner.resume();
                }
              }, 3000);
            }
          },
          () => {}
        );
      } catch {
        if (mounted) setCameraError(true);
      }
    };

    startScanner();

    return () => {
      mounted = false;
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, [navigate]);

  return (
    <Layout>
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-6xl mx-auto pb-4 md:pb-6">
        <div className="w-full flex items-center justify-center mb-8 relative">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="absolute left-0 h-16 px-6 flex items-center gap-3 bg-white border border-gray-200 rounded-xl shadow-sm text-xl font-bold text-gray-700 active:bg-gray-100 z-10 focus:outline-none focus-visible:outline-none focus-visible:ring-0"
          >
            <ArrowLeft size={28} />
            Back
          </button>
          <h2 className="text-4xl md:text-5xl font-extrabold text-gray-900 text-center tracking-tight">
            Scan QR Code
          </h2>
        </div>

        <div className="w-full flex flex-col items-center justify-center gap-6">
          {cameraError ? (
            <div className="w-full max-w-[420px] h-[420px] bg-gray-200 rounded-3xl flex flex-col items-center justify-center p-8 text-center border border-gray-300 shadow-sm">
              <span className="text-2xl font-bold text-red-600 mb-4">Camera Error</span>
              <span className="text-xl text-gray-700">Unable to access the device camera. Please try entering your code manually.</span>
            </div>
          ) : (
            <div className="w-full max-w-[420px] aspect-square relative rounded-3xl overflow-hidden border-4 border-gray-300 shadow-xl bg-black mx-auto">
              <div id="qr-reader" className="absolute inset-0 w-full h-full" style={{ border: 'none' }} />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="w-[260px] h-[260px] rounded-3xl border-4 border-white/85 shadow-[0_0_0_9999px_rgba(0,0,0,0.18)]" />
              </div>
              {error && (
                <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-20 p-6 text-center">
                  <span className="text-2xl font-bold text-white bg-red-600 px-8 py-4 rounded-xl shadow-lg">
                    {error}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="text-center text-xl text-gray-600 font-medium max-w-md">
            Hold your QR code steady inside the frame
          </div>
        </div>
      </div>
    </Layout>
  );
}