import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import About from "./sections/About";
import Experience from "./sections/Experience";
import Contact from "./sections/Contact";
import PontoApp from "./pages/PontoApp";
import PomodoroApp from "./pages/PomodoroApp";
import "./App.css";

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
      <Routes>
        <Route path="/" element={<Portfolio />} />
        <Route path="/ponto" element={<PontoApp />} />
        <Route path="/pomodoro" element={<PomodoroApp />} />
      </Routes>
    </BrowserRouter>
  );
}
