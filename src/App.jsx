import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import About from "./sections/About";
import Experience from "./sections/Experience";
import Contact from "./sections/Contact";
import PontoApp from "./pages/PontoApp";
import PomodoroApp from "./pages/PomodoroApp";
import SodApp from "./pages/SodApp";
import "./App.css";

// Troca o <link rel="manifest"> e o theme-color conforme a rota atual,
// permitindo que cada ferramenta seja instalada como um PWA separado.
const MANIFESTS = {
  '/ponto':    { href: '/ponto.webmanifest',    themeColor: '#6366f1' },
  '/pomodoro': { href: '/pomodoro.webmanifest', themeColor: '#f87171' },
  '/sod':      { href: '/sod.webmanifest',      themeColor: '#22d3ee' },
};

function ManifestSwitcher() {
  const { pathname } = useLocation();

  useEffect(() => {
    const cfg = MANIFESTS[pathname];

    // <link rel="manifest">
    let link = document.querySelector('link[rel="manifest"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'manifest';
      document.head.appendChild(link);
    }
    link.href = cfg?.href ?? '/manifest.webmanifest';

    // <meta name="theme-color">
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = cfg?.themeColor ?? '#060912';
  }, [pathname]);

  return null;
}

function Portfolio() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <About />
        <Experience />
        <Contact />
      </main>
      <footer className="footer">
        <p>© {new Date().getFullYear()} Maurício Sarpa — sarpa.dev</p>
      </footer>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ManifestSwitcher />
      <Routes>
        <Route path="/" element={<Portfolio />} />
        <Route path="/ponto" element={<PontoApp />} />
        <Route path="/pomodoro" element={<PomodoroApp />} />
        <Route path="/sod" element={<SodApp />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
