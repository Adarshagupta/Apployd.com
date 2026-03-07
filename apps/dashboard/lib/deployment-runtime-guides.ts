export type DeploymentServiceType = 'web_service' | 'python' | 'static_site';

export interface DeploymentRuntimeGuide {
  title: string;
  summary: string;
  fields: {
    rootDirectory: string;
    buildCommand: string;
    port: string;
    startCommand?: string;
    outputDirectory?: string;
  };
  fallbackBuild: string;
  fallbackStart?: string;
  details: Array<{
    title: string;
    body: string;
  }>;
}

const deploymentRuntimeGuides: Record<DeploymentServiceType, DeploymentRuntimeGuide> = {
  web_service: {
    title: 'Node web service',
    summary:
      'Use this for APIs, SSR apps, workers with HTTP endpoints, and full-stack services that need a running Node process.',
    fields: {
      rootDirectory: 'apps/api',
      buildCommand: 'npm run build',
      startCommand: 'npm run start:prod',
      port: '3000',
    },
    fallbackBuild:
      'Auto-detects npm run build when package.json contains a production build script.',
    fallbackStart:
      'Auto-detects start:prod, start, serve, package.json main, then common compiled entrypoints such as dist/server.js.',
    details: [
      {
        title: 'Build behavior',
        body: 'Runs your custom build command first. Without one, Apployd will run npm run build when it finds a non-dev build script.',
      },
      {
        title: 'Start behavior',
        body: 'Prefers an explicit start command, then start:prod, start, serve, package.json main, and compiled Node entrypoints.',
      },
      {
        title: 'Port requirements',
        body: 'Your app must listen on 0.0.0.0:$PORT. Dev commands like npm run dev, nodemon, tsx watch, and next dev are ignored.',
      },
    ],
  },
  python: {
    title: 'Python web app',
    summary:
      'Use this for Django, Flask, FastAPI, and other WSGI or ASGI services that expose an HTTP server.',
    fields: {
      rootDirectory: 'backend',
      buildCommand: 'python manage.py collectstatic --noinput',
      startCommand: 'uvicorn main:app --host 0.0.0.0 --port $PORT',
      port: '3000',
    },
    fallbackBuild:
      'No build step is required unless your project needs setup work such as asset compilation or collectstatic.',
    fallbackStart:
      'Auto-detects Django manage.py, Flask app.py, FastAPI main.py, wsgi.py, asgi.py, or falls back to main.py and app.py.',
    details: [
      {
        title: 'Dependency install',
        body: 'Supports requirements.txt, Pipfile, pyproject.toml, and setup.py. Common runtime servers such as gunicorn and uvicorn are installed automatically.',
      },
      {
        title: 'Entrypoint detection',
        body: 'Prefers your custom start command, then detects Django, Flask, FastAPI, wsgi.py, and asgi.py entrypoints automatically.',
      },
      {
        title: 'Port requirements',
        body: 'Bind your process to 0.0.0.0:$PORT. Use the build command only for setup tasks, not for the long-running web server.',
      },
    ],
  },
  static_site: {
    title: 'Frontend static site',
    summary:
      'Use this for React, Vue, Vite, Astro, and exported Next.js sites that produce files instead of a long-running server.',
    fields: {
      rootDirectory: 'apps/web',
      buildCommand: 'npm run build',
      outputDirectory: 'dist',
      port: '3000',
    },
    fallbackBuild:
      'Runs your custom build command or npm run build when package.json contains a production build script.',
    details: [
      {
        title: 'Publish directory',
        body: 'Set Output directory to the built asset folder, usually dist, build, or out. Combine it with Root directory for monorepos.',
      },
      {
        title: 'Serving model',
        body: 'Apployd serves the generated files with nginx, applies SPA fallback to index.html, and adds long-lived static asset caching.',
      },
      {
        title: 'When not to use it',
        body: 'Choose Web Service instead when the app needs a running Node server, server-side rendering, or backend APIs at runtime.',
      },
    ],
  },
};

export const getDeploymentRuntimeGuide = (serviceType?: string | null): DeploymentRuntimeGuide => {
  if (serviceType === 'python' || serviceType === 'static_site' || serviceType === 'web_service') {
    return deploymentRuntimeGuides[serviceType];
  }

  return deploymentRuntimeGuides.web_service;
};
