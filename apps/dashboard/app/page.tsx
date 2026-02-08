import Link from 'next/link';

import { LandingParallaxController } from '../components/landing-parallax-controller';
import { ProductStepTracker } from '../components/product-step-tracker';
import { SectionThreeBackground } from '../components/landing-section-three';
import { LandingThreeBackground } from '../components/landing-three-background';

import styles from './landing.module.css';

const navLinks = [
  { href: '#product', label: 'Product' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/about', label: 'About' },
  { href: '/blog', label: 'Blog' },
  { href: '/security', label: 'Security' },
];

const platformModules = [
  {
    id: '01',
    subtitle: 'Advanced Intelligent Analytics Platform',
    title: 'Analytics',
    labels: ['SYSTEM', 'REAL-TIME'],
    metrics: ['PERFORMANCE', 'PREDICTIVE'],
  },
  {
    id: '02',
    subtitle: 'Unified Deployment Data Control',
    title: 'Data',
    labels: ['SYSTEM', 'CONNECTED'],
    metrics: ['PERFORMANCE', 'TRACEABLE'],
  },
  {
    id: '03',
    subtitle: 'Adaptive Automation Workflow System',
    title: 'Automation',
    labels: ['SYSTEM', 'SMART'],
    metrics: ['PERFORMANCE', 'EFFICIENT'],
  },
  {
    id: '04',
    subtitle: 'Secure Production Runtime Layer',
    title: 'Security',
    labels: ['SYSTEM', 'ISOLATED'],
    metrics: ['PERFORMANCE', 'RESILIENT'],
  },
];

const featureCards = [
  {
    title: 'Intelligent Automation',
    copy: 'Smart workflows adapt, execute, and optimize deployment lifecycle tasks.',
    tag: 'AUTOMATED',
  },
  {
    title: 'Resource Precision',
    copy: 'CPU, RAM, and bandwidth pools align infrastructure to demand in real time.',
    tag: 'SCALABLE',
  },
  {
    title: 'Operational Reliability',
    copy: 'Live events and logs provide continuous deployment visibility for teams.',
    tag: 'RELIABLE',
  },
];

const workflowSteps = [
  {
    id: '01',
    title: 'Collect Data',
    copy: 'Source, branch, commands, and infrastructure constraints are gathered.',
  },
  {
    id: '02',
    title: 'Process Data',
    copy: 'Inputs are validated, normalized, and prepared for deterministic builds.',
  },
  {
    id: '03',
    title: 'Analyze Data',
    copy: 'Execution states and risk signals are evaluated before promotion.',
  },
  {
    id: '04',
    title: 'Deliver Data',
    copy: 'Deployments roll out with live logs, health checks, and traceable outcomes.',
  },
];

const integrationNames = ['GitHub', 'Docker', 'PostgreSQL', 'Redis', 'Sentry', 'OpenTelemetry', 'Prometheus', 'Slack'];

const heroStats = [
  { label: 'Deploy Latency', value: '47s' },
  { label: 'Uptime Target', value: '99.9%' },
  { label: 'Infra Savings', value: '70%' },
  { label: 'Active Streams', value: '24/7' },
];

/* Step 1: Analytics – bar chart / line graph / real-time dashboard */
function AnalyticsSvg() {
  return (
    <svg viewBox="0 0 760 520" className={styles.coreSvg} role="img" aria-label="Analytics visual">
      {/* dark base panel */}
      <rect x="80" y="60" width="600" height="400" rx="28" fill="#090a0f" stroke="#2a3042" strokeWidth="2" />
      {/* grid lines */}
      {[140, 200, 260, 320, 380].map(y => (
        <line key={y} x1="130" y1={y} x2="630" y2={y} stroke="#1a1f2e" strokeWidth="1" />
      ))}
      {/* bar chart group */}
      <g>
        {[
          { x: 170, h: 160, color: '#2a8dff', delay: 0 },
          { x: 225, h: 120, color: '#2a8dff', delay: 1 },
          { x: 280, h: 200, color: '#5cc1ff', delay: 2 },
          { x: 335, h: 90, color: '#2a8dff', delay: 3 },
          { x: 390, h: 240, color: '#5cc1ff', delay: 4 },
          { x: 445, h: 150, color: '#2a8dff', delay: 5 },
          { x: 500, h: 180, color: '#5cc1ff', delay: 6 },
          { x: 555, h: 130, color: '#2a8dff', delay: 7 },
        ].map(bar => (
          <rect key={bar.x} x={bar.x} y={400 - bar.h} width="38" height={bar.h} rx="4" fill={bar.color} opacity="0.7">
            <animate attributeName="height" from="0" to={bar.h} dur="0.8s" begin={`${bar.delay * 0.08}s`} fill="freeze" />
            <animate attributeName="y" from="400" to={400 - bar.h} dur="0.8s" begin={`${bar.delay * 0.08}s`} fill="freeze" />
          </rect>
        ))}
      </g>
      {/* trend line */}
      <polyline points="189,280 244,300 299,240 354,330 409,160 464,250 519,220 574,190" fill="none" stroke="#f4f5f8" strokeWidth="2.5" strokeLinejoin="round" opacity="0.6" />
      {/* data points on line */}
      {[
        [189, 280], [244, 300], [299, 240], [354, 330], [409, 160], [464, 250], [519, 220], [574, 190],
      ].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="4.5" fill="#eef2fc" stroke="#2a8dff" strokeWidth="2" />
      ))}
      {/* header labels */}
      <rect x="130" y="82" width="72" height="24" rx="4" fill="#2a8dff" opacity="0.15" />
      <rect x="216" y="82" width="56" height="24" rx="4" fill="none" stroke="#3a4358" strokeWidth="1" />
      <rect x="286" y="82" width="56" height="24" rx="4" fill="none" stroke="#3a4358" strokeWidth="1" />
      {/* live indicator */}
      <circle cx="600" cy="94" r="5" fill="#16ba8f" opacity="0.85">
        <animate attributeName="opacity" values="0.85;0.3;0.85" dur="1.6s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

/* Step 2: Data – connected nodes / data flow / database schema */
function DataSvg() {
  return (
    <svg viewBox="0 0 760 520" className={styles.coreSvg} role="img" aria-label="Data visual">
      {/* connection paths */}
      <path d="M380 120 L220 220" stroke="#3a4a62" strokeWidth="2" strokeDasharray="5 4" opacity="0.6" />
      <path d="M380 120 L540 220" stroke="#3a4a62" strokeWidth="2" strokeDasharray="5 4" opacity="0.6" />
      <path d="M220 220 L160 360" stroke="#3a4a62" strokeWidth="2" strokeDasharray="5 4" opacity="0.6" />
      <path d="M220 220 L320 360" stroke="#3a4a62" strokeWidth="2" strokeDasharray="5 4" opacity="0.6" />
      <path d="M540 220 L460 360" stroke="#3a4a62" strokeWidth="2" strokeDasharray="5 4" opacity="0.6" />
      <path d="M540 220 L600 360" stroke="#3a4a62" strokeWidth="2" strokeDasharray="5 4" opacity="0.6" />
      {/* animated data pulses along paths */}
      <circle r="3" fill="#5cc1ff" opacity="0.8">
        <animateMotion path="M380,120 L220,220" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle r="3" fill="#5cc1ff" opacity="0.8">
        <animateMotion path="M380,120 L540,220" dur="2.2s" repeatCount="indefinite" begin="0.3s" />
      </circle>
      <circle r="3" fill="#2a8dff" opacity="0.8">
        <animateMotion path="M220,220 L160,360" dur="1.8s" repeatCount="indefinite" begin="0.6s" />
      </circle>
      <circle r="3" fill="#2a8dff" opacity="0.8">
        <animateMotion path="M540,220 L460,360" dur="1.8s" repeatCount="indefinite" begin="0.9s" />
      </circle>
      {/* root node – database */}
      <g transform="translate(380 120)">
        <ellipse cx="0" cy="0" rx="52" ry="18" fill="#0b0d14" stroke="#5cc1ff" strokeWidth="2" />
        <rect x="-52" y="0" width="104" height="30" fill="#0b0d14" stroke="#5cc1ff" strokeWidth="2" strokeDasharray="0" />
        <ellipse cx="0" cy="30" rx="52" ry="18" fill="#0b0d14" stroke="#5cc1ff" strokeWidth="2" />
        <ellipse cx="0" cy="0" rx="52" ry="18" fill="#0e1118" stroke="#5cc1ff" strokeWidth="2" />
        <line x1="-52" y1="0" x2="-52" y2="30" stroke="#5cc1ff" strokeWidth="2" />
        <line x1="52" y1="0" x2="52" y2="30" stroke="#5cc1ff" strokeWidth="2" />
      </g>
      {/* mid-tier nodes */}
      {[
        { cx: 220, cy: 220, label: 'SYNC' },
        { cx: 540, cy: 220, label: 'CACHE' },
      ].map(node => (
        <g key={node.label} transform={`translate(${node.cx} ${node.cy})`}>
          <rect x="-44" y="-22" width="88" height="44" rx="12" fill="#0b0d14" stroke="#4a5670" strokeWidth="2" />
          <circle cx="-20" cy="0" r="4" fill="#2a8dff" />
          <line x1="-12" y1="0" x2="30" y2="0" stroke="#4a5670" strokeWidth="3" strokeLinecap="round" />
        </g>
      ))}
      {/* leaf nodes */}
      {[
        { cx: 160, cy: 360 },
        { cx: 320, cy: 360 },
        { cx: 460, cy: 360 },
        { cx: 600, cy: 360 },
      ].map(node => (
        <g key={node.cx} transform={`translate(${node.cx} ${node.cy})`}>
          <rect x="-36" y="-20" width="72" height="40" rx="8" fill="#0b0d14" stroke="#3a4358" strokeWidth="1.5" />
          <rect x="-24" y="-10" width="48" height="6" rx="2" fill="#2a3244" />
          <rect x="-24" y="2" width="32" height="6" rx="2" fill="#2a3244" />
        </g>
      ))}
      {/* data volume ring */}
      <g transform="translate(380 440)">
        <ellipse cx="0" cy="0" rx="180" ry="36" fill="none" stroke="#1a2034" strokeWidth="1.5" />
        <ellipse cx="0" cy="0" rx="180" ry="36" fill="none" stroke="#2a8dff" strokeWidth="2" strokeDasharray="120 1012" opacity="0.4">
          <animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="12s" repeatCount="indefinite" />
        </ellipse>
      </g>
    </svg>
  );
}

/* Step 3: Automation – pipeline / gears / workflow engine */
function AutomationSvg() {
  return (
    <svg viewBox="0 0 760 520" className={styles.coreSvg} role="img" aria-label="Automation visual">
      {/* pipeline track */}
      <path d="M100 260 H260 L310 180 H500 L550 260 H660" fill="none" stroke="#2a3042" strokeWidth="3" />
      <path d="M100 260 H260 L310 340 H500 L550 260 H660" fill="none" stroke="#2a3042" strokeWidth="3" />
      {/* animated flow particles – top pipe */}
      {[0, 0.4, 0.8, 1.2, 1.6].map((delay, i) => (
        <circle key={`t${i}`} r="4" fill="#5cc1ff" opacity="0.7">
          <animateMotion path="M100,260 L260,260 L310,180 L500,180 L550,260 L660,260" dur="3s" begin={`${delay}s`} repeatCount="indefinite" />
        </circle>
      ))}
      {/* animated flow particles – bottom pipe */}
      {[0.2, 0.6, 1.0, 1.4].map((delay, i) => (
        <circle key={`b${i}`} r="3.5" fill="#2a8dff" opacity="0.5">
          <animateMotion path="M100,260 L260,260 L310,340 L500,340 L550,260 L660,260" dur="3.4s" begin={`${delay}s`} repeatCount="indefinite" />
        </circle>
      ))}
      {/* gear 1 */}
      <g transform="translate(280 260)">
        <circle cx="0" cy="0" r="36" fill="#0b0d14" stroke="#4a5670" strokeWidth="2" />
        <circle cx="0" cy="0" r="14" fill="#090a0f" stroke="#626a7f" strokeWidth="2" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map(angle => (
          <rect key={angle} x="-5" y="-40" width="10" height="12" rx="2" fill="#4a5670" transform={`rotate(${angle})`} />
        ))}
        <animateTransform attributeName="transform" type="rotate" from="0 280 260" to="360 280 260" dur="8s" repeatCount="indefinite" additive="sum" />
      </g>
      {/* gear 2 (interlocked, opposite rotation) */}
      <g transform="translate(480 260)">
        <circle cx="0" cy="0" r="28" fill="#0b0d14" stroke="#4a5670" strokeWidth="2" />
        <circle cx="0" cy="0" r="10" fill="#090a0f" stroke="#626a7f" strokeWidth="2" />
        {[0, 60, 120, 180, 240, 300].map(angle => (
          <rect key={angle} x="-4.5" y="-32" width="9" height="10" rx="2" fill="#4a5670" transform={`rotate(${angle})`} />
        ))}
        <animateTransform attributeName="transform" type="rotate" from="360 480 260" to="0 480 260" dur="6s" repeatCount="indefinite" additive="sum" />
      </g>
      {/* stage boxes */}
      {[
        { x: 80, label: 'INPUT' },
        { x: 355, label: 'PROCESS' },
        { x: 640, label: 'OUTPUT' },
      ].map(stage => (
        <g key={stage.label} transform={`translate(${stage.x} 400)`}>
          <rect x="-40" y="-16" width="80" height="32" rx="6" fill="#0b0d14" stroke="#3a4a62" strokeWidth="1.5" />
          <line x1="-24" y1="-2" x2="24" y2="-2" stroke="#4a5670" strokeWidth="2" strokeLinecap="round" />
          <line x1="-24" y1="6" x2="12" y2="6" stroke="#3a4358" strokeWidth="2" strokeLinecap="round" />
        </g>
      ))}
      {/* connection arrows to pipeline */}
      <path d="M80 384 V300" stroke="#3a4358" strokeWidth="1.5" markerEnd="url(#arrowAuto)" />
      <path d="M380 384 V350" stroke="#3a4358" strokeWidth="1.5" markerEnd="url(#arrowAuto)" />
      <path d="M640 384 V300" stroke="#3a4358" strokeWidth="1.5" markerEnd="url(#arrowAuto)" />
      <defs>
        <marker id="arrowAuto" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill="#4a5670" />
        </marker>
      </defs>
      {/* status labels at top */}
      <rect x="310" y="120" width="140" height="36" rx="8" fill="#16ba8f" opacity="0.12" stroke="#16ba8f" strokeWidth="1" />
      <circle cx="330" cy="138" r="4" fill="#16ba8f">
        <animate attributeName="opacity" values="1;0.3;1" dur="1.4s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

/* Step 4: Security – shield / encryption / layered defense */
function SecuritySvg() {
  return (
    <svg viewBox="0 0 760 520" className={styles.coreSvg} role="img" aria-label="Security visual">
      {/* outer rotating ring */}
      <g transform="translate(380 250)">
        <circle cx="0" cy="0" r="190" fill="none" stroke="#1a2034" strokeWidth="1.5" />
        <circle cx="0" cy="0" r="190" fill="none" stroke="#2a8dff" strokeWidth="2" strokeDasharray="40 30" opacity="0.25">
          <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="30s" repeatCount="indefinite" />
        </circle>
        {/* middle ring */}
        <circle cx="0" cy="0" r="145" fill="none" stroke="#1f2634" strokeWidth="1.5" />
        <circle cx="0" cy="0" r="145" fill="none" stroke="#5cc1ff" strokeWidth="1.5" strokeDasharray="20 26" opacity="0.2">
          <animateTransform attributeName="transform" type="rotate" from="360" to="0" dur="24s" repeatCount="indefinite" />
        </circle>
      </g>
      {/* shield */}
      <g transform="translate(380 230)">
        <path d="M0-110 C60-100 100-70 100-20 C100 50 60 100 0 130 C-60 100-100 50-100-20 C-100-70-60-100 0-110Z" fill="#0b0d14" stroke="#4a5670" strokeWidth="2.5" />
        <path d="M0-80 C45-72 72-50 72-14 C72 38 45 72 0 96 C-45 72-72 38-72-14 C-72-50-45-72 0-80Z" fill="none" stroke="#2a8dff" strokeWidth="1.5" opacity="0.35" />
        {/* lock icon */}
        <rect x="-22" y="-10" width="44" height="36" rx="6" fill="#0e1118" stroke="#5cc1ff" strokeWidth="2" />
        <path d="M-12-10 V-24 C-12-38 12-38 12-24 V-10" fill="none" stroke="#5cc1ff" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="0" cy="8" r="5" fill="#5cc1ff" />
        <rect x="-1.5" y="12" width="3" height="10" rx="1.5" fill="#5cc1ff" />
      </g>
      {/* scanning lines */}
      <g opacity="0.3">
        <line x1="200" y1="250" x2="560" y2="250" stroke="#2a8dff" strokeWidth="1">
          <animate attributeName="y1" values="120;380;120" dur="4s" repeatCount="indefinite" />
          <animate attributeName="y2" values="120;380;120" dur="4s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.1;0.4;0.1" dur="4s" repeatCount="indefinite" />
        </line>
      </g>
      {/* checkmark nodes around shield */}
      {[
        { x: 160, y: 150, label: 'TLS 1.3' },
        { x: 560, y: 150, label: 'AES-256' },
        { x: 160, y: 370, label: 'RBAC' },
        { x: 560, y: 370, label: 'AUDIT' },
      ].map(node => (
        <g key={node.label} transform={`translate(${node.x} ${node.y})`}>
          <rect x="-42" y="-16" width="84" height="32" rx="8" fill="#0b0d14" stroke="#3a4a62" strokeWidth="1.5" />
          <circle cx="-26" cy="0" r="6" fill="none" stroke="#16ba8f" strokeWidth="1.5" />
          <path d="M-29 0 L-26 3 L-22-3" fill="none" stroke="#16ba8f" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="-14" y1="0" x2="30" y2="0" stroke="#3a4a62" strokeWidth="2" strokeLinecap="round" />
        </g>
      ))}
      {/* connecting lines from nodes to shield */}
      <path d="M202 150 L300 200" stroke="#1f2634" strokeWidth="1" strokeDasharray="4 4" />
      <path d="M518 150 L460 200" stroke="#1f2634" strokeWidth="1" strokeDasharray="4 4" />
      <path d="M202 370 L300 310" stroke="#1f2634" strokeWidth="1" strokeDasharray="4 4" />
      <path d="M518 370 L460 310" stroke="#1f2634" strokeWidth="1" strokeDasharray="4 4" />
    </svg>
  );
}

function FeatureGraphic() {
  return (
    <svg viewBox="0 0 680 420" className={styles.featureSvg} role="img" aria-label="Feature visual">
      <circle cx="120" cy="356" r="114" fill="#1c1d22" />
      <path d="M16 334c116 0 196 70 196 156" fill="none" stroke="#414857" strokeWidth="4" />
      <path d="M46 290c140 0 220 70 220 152" fill="none" stroke="#5a6172" strokeWidth="2" />
      <rect x="338" y="86" width="258" height="198" rx="16" fill="#0a0b10" stroke="#434a5b" />
      <path d="M338 86h258l-188 98v100l-70-32z" fill="url(#beam)" opacity="0.6" />
      <circle cx="506" cy="144" r="4" fill="#8d96ac" />
      <circle cx="522" cy="152" r="3" fill="#8d96ac" />
      <circle cx="536" cy="162" r="2.6" fill="#8d96ac" />
      <defs>
        <linearGradient id="beam" x1="338" x2="596" y1="86" y2="284">
          <stop offset="0%" stopColor="#f4f5f8" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#0d0f15" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function DonutChart() {
  return (
    <svg viewBox="0 0 220 220" className={styles.donutSvg} role="img" aria-label="Bottleneck donut">
      <circle cx="110" cy="110" r="72" className={styles.donutTrack} />
      <circle cx="110" cy="110" r="72" className={styles.donutProgress} />
      <circle cx="110" cy="110" r="44" fill="#07080c" />
    </svg>
  );
}

function ScatterChart() {
  const points = [
    [36, 114],
    [50, 106],
    [62, 101],
    [76, 92],
    [90, 85],
    [102, 78],
    [114, 70],
    [130, 60],
    [144, 53],
    [158, 46],
    [172, 40],
    [188, 34],
  ] as const;

  return (
    <svg viewBox="0 0 240 140" className={styles.scatterSvg} role="img" aria-label="Scatter chart">
      <rect x="1" y="1" width="238" height="138" fill="none" stroke="#2f3441" />
      <path d="M24 120H216M24 120V20" stroke="#4a5161" strokeWidth="1.5" />
      <path d="M24 120L214 32" stroke="#7d869a" strokeDasharray="6 6" strokeWidth="1.6" />
      {points.map((point, index) => (
        <circle key={`${point[0]}-${point[1]}`} cx={point[0]} cy={point[1]} r="3.1" className={styles.scatterDot} style={{ animationDelay: `${index * 80}ms` }} />
      ))}
    </svg>
  );
}

function WorkflowBlocks() {
  return (
    <svg viewBox="0 0 620 390" className={styles.workflowSvg} role="img" aria-label="Workflow blocks">
      <rect x="328" y="92" width="164" height="210" rx="24" fill="#0b0d13" stroke="#444c5f" strokeWidth="2" />
      <rect x="188" y="152" width="164" height="210" rx="24" fill="#0a0c12" stroke="#40485a" strokeWidth="2" />
      <rect x="70" y="190" width="164" height="210" rx="24" fill="#090b10" stroke="#3b4252" strokeWidth="2" />
      <rect x="370" y="130" width="80" height="120" rx="16" fill="#0f121b" stroke="#5a6581" />
      <rect x="232" y="188" width="80" height="120" rx="16" fill="#0f121b" stroke="#5a6581" />
      <rect x="114" y="226" width="80" height="120" rx="16" fill="#0f121b" stroke="#5a6581" />
      <path d="M392 176h36M392 196h36" stroke="#77a8ff" strokeWidth="5" strokeLinecap="round" />
      <path d="M248 244a22 22 0 1 1 30 30" fill="none" stroke="#5f677b" strokeWidth="8" />
      <path d="M282 272l18-4-7 17z" fill="#5f677b" />
      <rect x="138" y="264" width="30" height="30" rx="6" fill="none" stroke="#5f677b" strokeWidth="4" />
      <rect x="178" y="264" width="30" height="30" rx="6" fill="none" stroke="#5f677b" strokeWidth="4" />
      <rect x="138" y="304" width="30" height="30" rx="6" fill="none" stroke="#5f677b" strokeWidth="4" />
      <rect x="178" y="304" width="30" height="30" rx="6" fill="none" stroke="#5f677b" strokeWidth="4" />
    </svg>
  );
}

export default function HomePage() {
  return (
    <main className={styles.page}>
      <LandingParallaxController />
      <LandingThreeBackground className={styles.threeCanvas ?? ''} />
      <div className={styles.pageVignette} />

      <header className={styles.navWrap}>
        <div className={styles.navShell}>
          <a href="#hero" className={styles.brand}>
            <span className={styles.brandMark} />
            APployd
          </a>
          <nav className={styles.navLinks}>
            {navLinks.map((link) => (
              <a key={link.href} href={link.href} className={styles.navLink}>
                {link.label}
              </a>
            ))}
          </nav>
          <a href="/contact" className={styles.navButton}>
            Contact Us
          </a>
        </div>
      </header>

      <section id="hero" data-parallax-section className={`${styles.section} ${styles.heroSection}`}>
        <SectionThreeBackground className={styles.sectionThreeCanvas ?? ''} variant="hero" />
        <div className={`${styles.sectionBackdrop} ${styles.heroBackdrop}`} aria-hidden="true" />
        <div className={styles.container}>
          <div className={styles.heroContent}>
            <div className={styles.heroMeta}>
              <span>AI THAT WORKS.</span>
              <span>VISION</span>
              <span>SMART</span>
            </div>
            <div className={styles.heroLayout}>
              <div className={styles.heroMain}>
                <h1 className={styles.heroTitle}>Automate decisions with confidence.</h1>
                <p className={styles.heroCopy}>
                  Deploy backend systems with encrypted secrets, deterministic workflows, and live operational feedback.
                </p>
                <div className={styles.heroActions}>
                  <Link href="/signup" className={styles.primaryButton}>
                    Start Free
                  </Link>
                  <Link href="/login" className={styles.secondaryButton}>
                    Sign In
                  </Link>
                </div>
                <div className={styles.heroSignalRow}>
                  <span>PRECISE</span>
                  <span>SYSTEM +5</span>
                  <span>LIVE CONTROL</span>
                </div>
              </div>
              <aside className={styles.heroPanel}>
                <p>DEPLOY SIGNALS</p>
                <h3>47s</h3>
                <div>
                  <span>Median Deploy</span>
                  <strong>99.9% Uptime Target</strong>
                </div>
                <div>
                  <span>Runtime</span>
                  <strong>Queued {`>>>`} Live</strong>
                </div>
                <div className={styles.heroTerminal}>
                  <code>$ apployd deploy --project payments-api</code>
                  <code>[ready] build completed in 34s</code>
                  <code>[live] https://payments.apployd.run</code>
                </div>
              </aside>
            </div>
            <div className={styles.heroStats}>
              {heroStats.map((item) => (
                <article key={item.label} className={styles.heroStatCard}>
                  <p>{item.label}</p>
                  <h4>{item.value}</h4>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="product" data-parallax-section className={`${styles.section} ${styles.productSection}`}>
        <SectionThreeBackground className={styles.sectionThreeCanvas ?? ''} variant="product" />
        <div className={`${styles.sectionBackdrop} ${styles.productBackdrop}`} aria-hidden="true" />
        <div className={styles.container}>
          <div className={styles.productHeader}>
            <div className={`${styles.plusGrid} ${styles.parallaxSlow}`}>
              {Array.from({ length: 16 }, (_, index) => (
                <span key={index}>+</span>
              ))}
            </div>
            <p className={styles.sectionLabel}>ABOUT US</p>
            <h2 className={styles.sectionTitle}>The Core Platform Powering Tools</h2>
          </div>

          <ProductStepTracker />
          <div className={styles.productLayout}>
            <aside className={styles.stepRail}>
              {platformModules.map((module, index) => (
                <div key={module.id} className={styles.stepDot} data-step-index={index}>
                  {module.id}
                </div>
              ))}
            </aside>

            <div className={`${styles.platformVisual} ${styles.parallaxFast}`}>
              <div className={styles.visualStack}>
                <div className={styles.visualLayer} data-visual-index={0}><AnalyticsSvg /></div>
                <div className={styles.visualLayer} data-visual-index={1}><DataSvg /></div>
                <div className={styles.visualLayer} data-visual-index={2}><AutomationSvg /></div>
                <div className={styles.visualLayer} data-visual-index={3}><SecuritySvg /></div>
              </div>
            </div>

            <div className={styles.platformInfo}>
              {platformModules.map((module, index) => (
                <article key={module.id} className={styles.platformCard} data-card-index={index} style={{ animationDelay: `${index * 90}ms` }}>
                  <p className={styles.cardSubtitle}>{module.subtitle}</p>
                  <h3 className={styles.cardTitle}>{module.title}</h3>
                  <div className={styles.cardMeta}>
                    <div>
                      <span>{module.labels[0]}</span>
                      <strong>{module.labels[1]}</strong>
                    </div>
                    <div>
                      <span>{module.metrics[0]}</span>
                      <strong>{module.metrics[1]}</strong>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="features" data-parallax-section className={`${styles.section} ${styles.featuresSection}`}>
        <SectionThreeBackground className={styles.sectionThreeCanvas ?? ''} variant="features" />
        <div className={`${styles.sectionBackdrop} ${styles.featuresBackdrop}`} aria-hidden="true" />
        <div className={styles.container}>
          <div className={styles.featuresHeader}>
            <p className={styles.sectionLabel}>THE FEATURES</p>
            <h2 className={styles.sectionTitle}>Reliable, automated, scalable.</h2>
          </div>
          <div className={styles.featuresLayout}>
            <div className={`${styles.featureVisual} ${styles.parallaxSlow}`}>
              <FeatureGraphic />
            </div>
            <div className={styles.featureList}>
              {featureCards.map((feature, index) => (
                <article key={feature.title} className={styles.featureCard} style={{ animationDelay: `${index * 110}ms` }}>
                  <span>{feature.tag}</span>
                  <h3>{feature.title}</h3>
                  <p>{feature.copy}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="lab" data-parallax-section className={`${styles.section} ${styles.labSection}`}>
        <SectionThreeBackground className={styles.sectionThreeCanvas ?? ''} variant="lab" />
        <div className={`${styles.sectionBackdrop} ${styles.labBackdrop}`} aria-hidden="true" />
        <div className={styles.container}>
          <div className={styles.labHeader}>
            <h2 className={styles.sectionTitle}>
              From Manual
              <span className={styles.labToggle}>
                <span />
              </span>
              Intelligent
            </h2>
          </div>

          <div className={styles.labGrid}>
            <article className={styles.labCardTall}>
              <h3>Bottleneck Detected</h3>
              <DonutChart />
              <p>TASK COMPLETE</p>
            </article>

            <article className={styles.labCard}>
              <h3>Process Efficiency</h3>
              <div className={styles.efficiencyRow}>
                <strong>99%</strong>
                <span>Partially / Manual</span>
              </div>
            </article>

            <article className={styles.labCard}>
              <h3>Pipeline Signals</h3>
              <div className={styles.statusRows}>
                <div>
                  <span>Data Sync</span>
                  <b>Success</b>
                </div>
                <div>
                  <span>Validation</span>
                  <b>Success</b>
                </div>
                <div>
                  <span>Report</span>
                  <b>Success</b>
                </div>
              </div>
              <p>PARTIAL</p>
            </article>

            <article className={styles.labCard}>
              <h3>Data Scatter</h3>
              <ScatterChart />
            </article>
          </div>
        </div>
      </section>

      <section id="workflow" data-parallax-section className={`${styles.section} ${styles.workflowSection}`}>
        <SectionThreeBackground className={styles.sectionThreeCanvas ?? ''} variant="workflow" />
        <div className={`${styles.sectionBackdrop} ${styles.workflowBackdrop}`} aria-hidden="true" />
        <div className={styles.container}>
          <div className={styles.workflowLayout}>
            <div className={styles.workflowText}>
              <p className={styles.workflowBadge}>PARTIAL {`>>>`} TASK [04]</p>
              {workflowSteps.map((step) => (
                <article key={step.id} className={styles.workflowStep}>
                  <span>{step.id}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.copy}</p>
                  </div>
                </article>
              ))}
            </div>
            <div className={`${styles.workflowVisual} ${styles.parallaxFast}`}>
              <WorkflowBlocks />
            </div>
          </div>
        </div>
      </section>

      <section id="integration" data-parallax-section className={`${styles.section} ${styles.integrationSection}`}>
        <SectionThreeBackground className={styles.sectionThreeCanvas ?? ''} variant="integration" />
        <div className={`${styles.sectionBackdrop} ${styles.integrationBackdrop}`} aria-hidden="true" />
        <div className={styles.container}>
          <div className={styles.integrationHeader}>
            <p className={styles.sectionLabel}>INTEGRATION</p>
            <h2 className={styles.sectionTitle}>Connected systems. Unified intelligence.</h2>
          </div>
          <div className={styles.marquee}>
            <div className={styles.marqueeInner}>
              {integrationNames.concat(integrationNames).map((integration, index) => (
                <span key={`${integration}-${index}`} className={styles.integrationPill}>
                  {integration}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="contact" data-parallax-section className={`${styles.section} ${styles.ctaSection}`}>
        <SectionThreeBackground className={styles.sectionThreeCanvas ?? ''} variant="cta" />
        <div className={`${styles.sectionBackdrop} ${styles.ctaBackdrop}`} aria-hidden="true" />
        <div className={styles.container}>
          <article className={styles.ctaCard}>
            <p className={styles.sectionLabel}>GET A PERSONALIZED DEMO</p>
            <h2 className={styles.sectionTitle}>Ready to deploy your backend with confidence?</h2>
            <div className={styles.heroActions}>
              <Link href="/signup" className={styles.primaryButton}>
                Create Account
              </Link>
              <Link href="/login" className={styles.secondaryButton}>
                Open Dashboard
              </Link>
            </div>
          </article>
        </div>
      </section>

      {/* Footer */}
      <footer
        style={{
          position: 'relative',
          zIndex: 4,
          borderTop: '1px solid rgba(161,178,216,0.14)',
          padding: '3rem 0 2rem',
        }}
      >
        <div className={styles.container}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '2rem 3rem',
            }}
          >
            <div>
              <p style={{ margin: 0, fontWeight: 600, fontSize: '1rem' }}>APployd</p>
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.82rem', color: 'rgba(200,210,240,0.6)' }}>
                Self-hosted deployment platform for backend teams.
              </p>
            </div>
            <div>
              <p style={{ margin: 0, fontWeight: 600, fontSize: '0.82rem', letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'rgba(200,210,240,0.5)' }}>Product</p>
              <ul style={{ listStyle: 'none', margin: '0.6rem 0 0', padding: 0, display: 'grid', gap: '0.4rem' }}>
                <li><a href="#product" style={{ fontSize: '0.85rem', color: 'rgba(220,228,248,0.7)' }}>Features</a></li>
                <li><a href="/pricing" style={{ fontSize: '0.85rem', color: 'rgba(220,228,248,0.7)' }}>Pricing</a></li>
                <li><a href="/security" style={{ fontSize: '0.85rem', color: 'rgba(220,228,248,0.7)' }}>Security</a></li>
              </ul>
            </div>
            <div>
              <p style={{ margin: 0, fontWeight: 600, fontSize: '0.82rem', letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'rgba(200,210,240,0.5)' }}>Company</p>
              <ul style={{ listStyle: 'none', margin: '0.6rem 0 0', padding: 0, display: 'grid', gap: '0.4rem' }}>
                <li><a href="/about" style={{ fontSize: '0.85rem', color: 'rgba(220,228,248,0.7)' }}>About</a></li>
                <li><a href="/blog" style={{ fontSize: '0.85rem', color: 'rgba(220,228,248,0.7)' }}>Blog</a></li>
                <li><a href="/contact" style={{ fontSize: '0.85rem', color: 'rgba(220,228,248,0.7)' }}>Contact</a></li>
              </ul>
            </div>
          </div>
          <div
            style={{
              marginTop: '2.5rem',
              paddingTop: '1.2rem',
              borderTop: '1px solid rgba(161,178,216,0.1)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '0.78rem',
              color: 'rgba(200,210,240,0.4)',
            }}
          >
            <span>&copy; 2026 Apployd. All rights reserved.</span>
            <span>Built for developers, by developers.</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
