import Link from 'next/link';

const features = [
  {
    icon: '🚀',
    title: 'Git-Connected Deploys',
    description: 'Connect GitHub repositories and trigger instant production deploys from branch pushes with zero configuration.',
  },
  {
    icon: '🛡️',
    title: 'Resource Governance',  
    description: 'Pool-level RAM/CPU/bandwidth enforcement with per-project caps and subscription-safe allocation controls.',
  },
  {
    icon: '📊',
    title: 'Real-Time Monitoring',
    description: 'Live deployment events, centralized logs, usage metering, and comprehensive billing visibility.',
  },
  {
    icon: '💎',
    title: 'WebSocket Ready',
    description: 'Native WebSocket support with automatic SSL, custom domains, and enterprise-grade security.',
  },
  {
    icon: '⚡',
    title: 'Auto-Scaling',
    description: 'Intelligent container sleep/wake cycles and resource optimization for maximum cost efficiency.',
  },
  {
    icon: '🔐', 
    title: 'Enterprise Security',
    description: 'End-to-end encryption, audit logs, RBAC permissions, and SOC2-ready compliance features.',
  },
];

const stats = [
  { label: 'Deployments', value: '50K+' },
  { label: 'Uptime', value: '99.9%' },
  { label: 'Cost Savings', value: '70%' },
  { label: 'Avg Deploy Time', value: '45s' },
];

function HomePage() {
  return (
    <main className="min-h-screen w-full overflow-hidden">
      {/* Hero Section */}
      <section className="relative px-4 py-20 md:px-6 md:py-32">
        {/* Background Effects */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-20 left-1/4 h-64 w-64 rounded-full bg-gradient-to-br from-teal-400 to-blue-400 opacity-20 blur-3xl"></div>
          <div className="absolute bottom-32 right-1/4 h-80 w-80 rounded-full bg-gradient-to-br from-emerald-400 to-teal-400 opacity-15 blur-3xl"></div>
        </div>
        
        <div className="relative mx-auto max-w-7xl">
          <div className="text-center space-y-8">
            {/* Badge */}
            <div className="inline-flex items-center space-x-2 rounded-full bg-teal-50 px-4 py-2 text-sm font-medium text-teal-700 ring-1 ring-teal-200">
              <span className="h-2 w-2 rounded-full bg-teal-500 animate-pulse"></span>
              <span>Trusted by 1000+ developers</span>
            </div>
            
            {/* Main Heading */}
            <h1 className="mx-auto max-w-5xl text-5xl font-bold leading-tight tracking-tight text-slate-900 md:text-7xl">
              Deploy backends with
              <span className="bg-gradient-to-r from-teal-600 via-emerald-600 to-teal-700 bg-clip-text text-transparent"> zero hassle</span>
            </h1>
            
            {/* Subheading */}
            <p className="mx-auto max-w-2xl text-xl text-slate-600 md:text-2xl">
              The developer-first platform for Node.js deployments with WebSocket support, 
              strict resource controls, and <strong>70% cost savings</strong> vs traditional PaaS.
            </p>
            
            {/* CTA Buttons */}
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6">
              <Link 
                href="/signup" 
                className="btn-primary flex items-center space-x-2 px-8 py-4 text-lg font-semibold shadow-lg transition-all hover:shadow-xl hover:scale-105"
              >
                <span>Start deploying free</span>
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
              <Link 
                href="/login" 
                className="btn-secondary px-8 py-4 text-lg font-medium transition-all hover:shadow-md"
              >
                Sign in
              </Link>
            </div>
            
            {/* Trust Indicators */}
            <p className="text-sm text-slate-500">
              No credit card required • Deploy in 60 seconds • Cancel anytime
            </p>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="border-y border-slate-200 bg-white bg-opacity-50 px-4 py-12 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-3xl font-bold text-teal-700 md:text-4xl">{stat.value}</div>
                <div className="mt-1 text-sm font-medium text-slate-600 uppercase tracking-wide">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="px-4 py-20 md:px-6 md:py-32">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-slate-900 md:text-5xl">
              Everything you need to ship fast
            </h2>
            <p className="mt-4 text-xl text-slate-600 max-w-3xl mx-auto">
              Built for modern teams who need reliable infrastructure without the complexity or cost of enterprise platforms.
            </p>
          </div>
          
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, index) => (
              <div 
                key={index} 
                className="group relative rounded-2xl bg-white bg-opacity-80 p-8 shadow-sm ring-1 ring-slate-200 transition-all hover:shadow-lg hover:ring-teal-200 hover:-translate-y-1"
              >
                <div className="mb-4 text-4xl">{feature.icon}</div>
                <h3 className="mb-3 text-xl font-semibold text-slate-900">{feature.title}</h3>
                <p className="text-slate-600 leading-relaxed">{feature.description}</p>
                
                {/* Hover effect */}
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-teal-50 to-emerald-50 bg-opacity-50 opacity-0 transition-opacity group-hover:opacity-100 -z-10"></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative px-4 py-20 md:px-6 md:py-32">
        {/* Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-teal-600 via-teal-700 to-emerald-800"></div>
        <div className="absolute inset-0 bg-opacity-5 bg-white bg-repeat" 
             style={{backgroundImage: "url('data:image/svg+xml,%3Csvg width=\"60\" height=\"60\" viewBox=\"0 0 60 60\" xmlns=\"http://www.w3.org/2000/svg\"%3E%3Cg fill=\"none\" fill-rule=\"evenodd\"%3E%3Cg fill=\"%23ffffff\" fill-opacity=\"0.05\"%3E%3Ccircle cx=\"30\" cy=\"30\" r=\"1\"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')"}}></div>
        
        <div className="relative mx-auto max-w-4xl text-center">
          <h2 className="text-4xl font-bold text-white md:text-5xl">
            Ready to deploy your next project?
          </h2>
          <p className="mt-6 text-xl text-teal-100">
            Join thousands of developers who've made the switch to cost-effective, reliable backend hosting.
          </p>
          
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6">
            <Link 
              href="/signup"
              className="inline-flex items-center space-x-3 rounded-xl bg-white px-8 py-4 text-lg font-semibold text-teal-700 shadow-lg transition-all hover:bg-teal-50 hover:shadow-xl hover:scale-105"
            >
              <span>Get started for free</span>
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            
            <div className="text-teal-100">
              <p className="text-sm">
                ✓ Free tier included • ✓ No setup fees • ✓ Cancel anytime
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export default HomePage;