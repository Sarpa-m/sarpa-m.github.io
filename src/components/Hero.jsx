export default function Hero() {
  return (
    <header className="hero" id="hero">
      <div className="container">
        <p className="hero__eyebrow">Portfólio</p>

        <h1 className="hero__name">
          Maurício<br />Sarpa
        </h1>

        <p className="hero__role">
          <span className="prefix">{'>'}</span>
          Segurança da Informação · GRC &amp; Automação
          <span className="cursor" aria-hidden="true" />
        </p>

        <p className="hero__status">
          <span className="hero__status-dot" />
          Aberto a novas oportunidades
        </p>

        <div className="hero__cta">
          <a href="#experiencia" className="btn-primary">Ver experiência</a>
          <a href="#contato" className="btn-outline">Contato</a>
        </div>
      </div>

      <div className="hero__scroll" aria-hidden="true">
        <span>scroll</span>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 1v12M1 7l6 6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    </header>
  );
}
