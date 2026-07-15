import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { validateJobCode } from '../api';
import { Layout } from '../components/Layout';
import { ArrowLeft, Delete } from 'lucide-react';

export function ManualCode() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);

  const handlePadClick = (val: string) => {
    if (validating) return;
    setError(null);
    if (code.length < 6) {
      setCode(prev => prev + val);
    }
  };

  const handleDelete = () => {
    if (validating) return;
    setError(null);
    setCode(prev => prev.slice(0, -1));
  };

  const handleConfirm = async () => {
    if (code.length !== 6 || validating) return;
    setValidating(true);
    setError(null);

    const result = await validateJobCode(code);
    
    if (result.job) {
      navigate(`/confirm/${result.job.id}`, { state: { job: result.job } });
    } else {
      setError(result.error || 'Invalid pickup code. Please try again.');
      setCode('');
      setValidating(false);
    }
  };

  return (
    <Layout>
      <div className="flex-1 flex flex-col max-w-4xl w-full mx-auto pb-8">
        <div className="flex items-center mb-8 relative">
          <button
            onClick={() => navigate('/')}
            className="absolute left-0 h-16 px-6 flex items-center gap-3 bg-white border border-gray-200 rounded-xl shadow-sm text-xl font-bold text-gray-700 active:bg-gray-100"
          >
            <ArrowLeft size={28} />
            Back
          </button>
          <h2 className="text-3xl font-bold text-gray-900 w-full text-center">
            Enter Pickup Code
          </h2>
        </div>

        <div className="flex-1 flex gap-16 items-center justify-center">
          <div className="w-96 flex flex-col">
            <div className={`h-24 bg-white border-4 rounded-2xl flex items-center justify-center shadow-inner mb-4 transition-colors ${error ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}>
              <span className="text-4xl font-mono font-bold tracking-widest text-gray-900">
                ARX-{code.padEnd(6, '_')}
              </span>
            </div>
            
            <div className="h-8 mb-8 text-center">
              {error ? (
                <span className="text-xl font-bold text-red-600">{error}</span>
              ) : (
                <span className="text-xl text-gray-500">Enter the 6-digit code from your email</span>
              )}
            </div>

            <button
              onClick={handleConfirm}
              disabled={code.length !== 6 || validating}
              className={`h-16 w-full rounded-xl text-xl font-bold flex items-center justify-center shadow-md transition-opacity ${
                code.length === 6 && !validating 
                  ? 'bg-gradient-to-r from-rose-500 to-orange-500 border-0 text-white active:opacity-80' 
                  : 'bg-gray-300 text-gray-500 opacity-70'
              }`}
            >
              {validating ? (
                <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                'Confirm Code'
              )}
            </button>
          </div>

          <div className="w-96 grid grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
              <button
                key={num}
                onClick={() => handlePadClick(num.toString())}
                className="h-20 bg-white border border-gray-200 rounded-xl shadow-sm text-3xl font-bold text-gray-900 active:bg-gray-100 flex items-center justify-center"
              >
                {num}
              </button>
            ))}
            <div className="h-20"></div>
            <button
              onClick={() => handlePadClick('0')}
              className="h-20 bg-white border border-gray-200 rounded-xl shadow-sm text-3xl font-bold text-gray-900 active:bg-gray-100 flex items-center justify-center"
            >
              0
            </button>
            <button
              onClick={handleDelete}
              className="h-20 bg-white border border-gray-200 rounded-xl shadow-sm text-gray-700 active:bg-gray-100 flex items-center justify-center"
            >
              <Delete size={36} />
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
