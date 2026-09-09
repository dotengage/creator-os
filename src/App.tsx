import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { StoreProvider } from './lib/store'
import { ConfirmProvider, ToastProvider } from './components/ui'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Templates from './pages/Templates'
import Outreach from './pages/Outreach'
import Invoices from './pages/Invoices'
import InvoiceEditor from './pages/InvoiceEditor'
import Earnings from './pages/Earnings'
import Ideas from './pages/Ideas'
import Inspiration from './pages/Inspiration'
import Planner from './pages/Planner'
import Goals from './pages/Goals'
import Settings from './pages/Settings'

export default function App() {
  return (
    <StoreProvider>
      <ToastProvider>
        <ConfirmProvider>
          <HashRouter>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/planner" element={<Planner />} />
                <Route path="/ideas" element={<Ideas />} />
                <Route path="/templates" element={<Templates />} />
                <Route path="/inspiration" element={<Inspiration />} />
                <Route path="/outreach" element={<Outreach />} />
                <Route path="/invoices" element={<Invoices />} />
                <Route path="/invoices/:id" element={<InvoiceEditor />} />
                <Route path="/earnings" element={<Earnings />} />
                <Route path="/goals" element={<Goals />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
          </HashRouter>
        </ConfirmProvider>
      </ToastProvider>
    </StoreProvider>
  )
}
