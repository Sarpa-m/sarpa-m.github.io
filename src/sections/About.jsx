import { useReveal } from '../hooks/useReveal';

const skills = [
  {
    label: 'Desenvolvimento',
    items: ['PHP', 'Node.js', 'Git', 'APIs REST'],
  },
  {
    label: 'Dados & IA',
    items: ['LLMs', 'Banco de Dados', 'Zabbix', 'Automação'],
  },
  {
    label: 'Infra & Redes',
    items: ['Linux', 'Windows Server', 'VMware', 'Active Directory', 'FortiGate', 'Redes L2/L3'],
  },
  {
    label: 'Idiomas',
    items: ['Espanhol (Intermediário)', 'Inglês (Básico)'],
  },
];

export default function About() {
  const headerRef = useReveal();
  const textRef = useReveal();
  const skillsRef = useReveal();

  return (
    <section id="sobre" className="section">
      <div className="container">
        <div className="section-header reveal" ref={headerRef}>
          <span className="section-number">01</span>
          <span className="section-label">Sobre mim</span>
          <h2 className="section-title">Quem sou eu</h2>
        </div>

        <div className="about-grid">
          <div className="about-text reveal" ref={textRef}>
            <p>
              Profissional de TI cursando <strong>Engenharia da Computação</strong>,
              com base sólida em infraestrutura, redes e desenvolvimento de software.
            </p>
            <p>
              Perfil analítico e proativo, com forte interesse em{' '}
              <strong>IA aplicada, automação de processos e análise de dados</strong>.
              Busco transformar lógica de programação e experiência técnica em
              soluções que otimizem operações e gerem resultados reais.
            </p>
            <p>
              Baseado em <strong>Mogi Mirim, SP</strong> — disponível para
              oportunidades remotas ou híbridas.
            </p>
          </div>

          <div className="skills-section reveal" ref={skillsRef}>
            <h3>Competências</h3>
            {skills.map((group) => (
              <div key={group.label} className="skills-group stagger is-revealed">
                <span className="skills-group__label">{group.label}</span>
                <div className="skills-group__chips">
                  {group.items.map((item) => (
                    <span key={item} className="skill-chip">{item}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
