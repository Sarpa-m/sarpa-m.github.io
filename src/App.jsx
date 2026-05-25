import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import About from "./sections/About";
import Experience from "./sections/Experience";
import Contact from "./sections/Contact";
import "./App.css";

export default function App() {
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
