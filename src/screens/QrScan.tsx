import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { validateJobCode } from '../api';
import { Layout } from '../components/Layout';
import { ArrowLeft } from 'lucide-react';

export function QrScan() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const validatingRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    const scanner = new Html5Qrcode("qr-reader");
    scannerRef.current = scanner;

    const startScanner = async () => {
      try {
        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 30,
            qrbox: { width: 400, height: 400 },
            aspectRatio: 1.0,
            disableFlip: false,
          },
          async (decodedText) => {
            if (validatingRef.current || !mounted) return;
            
            let code = decodedText;
            try {
              const parsed = JSON.parse(decodedText);
              if (parsed.code) code = parsed.code;
            } catch (e) {
              // Not JSON, use raw
            }

            validatingRef.current = true;
            scanner.pause();
            
            const result = await validateJobCode(code);
            if (!mounted) return;

            if (result.job) {
              scanner.stop().then(() => {
                navigate(`/confirm/${result.job.id}`, { state: { job: result.job } });
              }).catch(() => {
                navigate(`/confirm/${result.job.id}`, { state: { job: result.job } });
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
          () => {} // ignore scan errors
        );
      } catch (err) {
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
      <div className="flex-1 flex flex-col items-center pb-8">
        <div className="w-full flex items-center mb-8 relative max-w-4xl mx-auto">
          <button
            onClick={() => navigate('/')}
            className="absolute left-0 h-16 px-6 flex items-center gap-3 bg-white border border-gray-200 rounded-xl shadow-sm text-xl font-bold text-gray-700 active:bg-gray-100 z-10"
          >
            <ArrowLeft size={28} />
            Back
          </button>
          <h2 className="text-3xl font-bold text-gray-900 w-full text-center">
            Scan QR Code
          </h2>
        </div>

        <div className="w-[600px] flex flex-col items-center">
          {cameraError ? (
            <div className="h-[400px] w-full bg-gray-200 rounded-2xl flex flex-col items-center justify-center p-8 text-center border border-gray-300">
              <span className="text-2xl font-bold text-red-600 mb-4">Camera Error</span>
              <span className="text-xl text-gray-700">Unable to access the device camera. Please try entering your code manually.</span>
            </div>
          ) : (
            <div className="w-full relative rounded-3xl overflow-hidden border-4 border-gray-300 shadow-lg bg-black">
              <div id="qr-reader" className="w-full" style={{ border: 'none' }}></div>
              {error && (
                <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-20">
                  <span className="text-2xl font-bold text-white bg-red-600 px-8 py-4 rounded-xl shadow-lg">
                    {error}
                  </span>
                </div>
              )}
            </div>
          )}
          
          <div className="mt-8 text-xl text-gray-600 font-medium">
            Hold your QR code steady inside the frame
          </div>
        </div>
      </div>
    </Layout>
  );
}
