/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Home } from './screens/Home';
import { ManualCode } from './screens/ManualCode';
import { OrderFiles } from './screens/OrderFiles';
import { QrScan } from './screens/QrScan';
import { Confirm } from './screens/Confirm';
import { Status } from './screens/Status';
import { LowSupply } from './screens/LowSupply';
import { AgentConsole } from './screens/AgentConsole';
import { Health } from './screens/Health';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SupportOverlay } from './components/SupportOverlay';
import { SupportContext } from './contexts/SupportContext';
import { fetchKioskStatus } from './api';
import { OutOfStation } from './screens/OutOfStation';

export default function App() {
  const [showSupport, setShowSupport] = useState(false);
  const [kioskInMaintenance, setKioskInMaintenance] = useState(false);

  useEffect(() => {
    let active = true;
    const checkStatus = async () => {
      const status = await fetchKioskStatus();
      if (active && status) setKioskInMaintenance(status === 'maintenance');
    };
    void checkStatus();
    const timer = window.setInterval(() => { void checkStatus(); }, 5_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <ErrorBoundary>
      <SupportContext.Provider value={() => setShowSupport(true)}>
        <BrowserRouter>
          {kioskInMaintenance ? <OutOfStation /> : (
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/code" element={<ManualCode />} />
              <Route path="/files" element={<OrderFiles />} />
              <Route path="/scan" element={<QrScan />} />
              <Route path="/confirm/:jobId" element={<Confirm />} />
              <Route path="/status/:jobId" element={<Status />} />
              <Route path="/low-supply" element={<LowSupply />} />
              <Route path="/agent" element={<AgentConsole />} />
              <Route path="/health" element={<Health />} />
            </Routes>
          )}
        </BrowserRouter>
        {showSupport && !kioskInMaintenance && <SupportOverlay onClose={() => setShowSupport(false)} />}
      </SupportContext.Provider>
    </ErrorBoundary>
  );
}

