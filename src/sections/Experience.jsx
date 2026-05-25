import { useReveal } from '../hooks/useReveal';

const experiences = [
  {
    role: 'Assistente de Segurança da Informação',
    company: 'AuditSafe',
    location: 'São Paulo, SP · Híbrido',
    period: 'Mai 2026\nAtual',
    items: [
      'Atuação no time de GRC (Governança, Risco e Conformidade) com foco em auditoria de segurança da informação.',
    ],
  },
  {
    role: 'Analista de Suporte Júnior',
    company: 'EtheriumTech',
    location: 'Barueri, SP',
    period: 'Ago 2025\nAbr 2026',
    items: [
      'Administração de ambientes virtualizados (VMware) e infraestrutura de rede.',
      'Padronização e documentação de processos técnicos de infraestrutura.',
      'Implementação e monitoramento de políticas de segurança em firewalls FortiGate.',
      'Resolução analítica de problemas complexos de redes e sistemas.',
    ],
  },
  {
    role: 'Estagiário de Suporte e Redes',
    company: 'Prefeitura de Mogi Mirim',
    location: 'Mogi Mirim, SP',
    period: 'Jul 2023\nJul 2025',
    items: [
      'Coleta de dados e monitoramento de infraestrutura municipal via videomonitoramento e firewalls.',
      'Apoio na implantação de soluções tecnológicas para departamentos internos.',
      'Help Desk com documentação de atendimentos e soluções aplicadas.',
      'Troubleshooting em redes de fibra óptica e manutenção de hardware.',
    ],
  },
  {
    role: 'Presidente',
    company: 'Ordem DeMolay — Capítulo Mogi Mirim',
    location: 'Mogi Mirim, SP',
    period: 'Jul 2022\nJan 2023',
    items: [
      'Liderança de equipe com mais de 120 voluntários em projetos sociais e filantrópicos.',
      'Planejamento estratégico, gestão de recursos financeiros e resolução de crises.',
    ],
  },
];

export default function Experience() {
  const headerRef = useReveal();
  const timelineRef = useReveal(0.05);
  const educationRef = useReveal();

  return (
    <section id="experiencia" className="section experience-section">
      <div className="container">
        <div className="section-header reveal" ref={headerRef}>
          <span className="section-number">02</span>
          <span className="section-label">Trajetória</span>
          <h2 className="section-title">Experiência</h2>
        </div>

        <div className="timeline stagger" ref={timelineRef}>
          {experiences.map((exp, i) => (
            <div key={i} className="timeline-item">
              <div className="timeline-content">
                <p className="timeline-role">{exp.role}</p>
                <p className="timeline-company">{exp.company}</p>
                <p className="timeline-location">{exp.location}</p>
                <ul className="timeline-list">
                  {exp.items.map((item, j) => (
                    <li key={j}>{item}</li>
                  ))}
                </ul>
                <p className="timeline-period">
                  {exp.period.replace('\n', ' – ')}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="education-card reveal" ref={educationRef}>
          <div>
            <p className="education-card__title">Engenharia da Computação</p>
            <p className="education-card__sub">FHO | Fundação Hermínio Ometto — Araras, SP</p>
          </div>
          <span className="education-card__period">2020 — 2027</span>
        </div>
      </div>
    </section>
  );
}
