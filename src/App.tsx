/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Home } from './screens/Home';
import { ManualCode } from './screens/ManualCode';
import { QrScan } from './screens/QrScan';
import { Confirm } from './screens/Confirm';
import { Status } from './screens/Status';
import { LowSupply } from './screens/LowSupply';
import { AgentConsole } from './screens/AgentConsole';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SupportOverlay } from './components/SupportOverlay';
import { SupportContext } from './contexts/SupportContext';

export default function App() {
  const [showSupport, setShowSupport] = useState(false);

  return (
    <ErrorBoundary>
      <SupportContext.Provider value={() => setShowSupport(true)}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/code" element={<ManualCode />} />
            <Route path="/scan" element={<QrScan />} />
            <Route path="/confirm/:jobId" element={<Confirm />} />
            <Route path="/status/:jobId" element={<Status />} />
            <Route path="/low-supply" element={<LowSupply />} />
            <Route path="/agent" element={<AgentConsole />} />
          </Routes>
        </BrowserRouter>
        {showSupport && <SupportOverlay onClose={() => setShowSupport(false)} />}
      </SupportContext.Provider>
    </ErrorBoundary>
  );
}

