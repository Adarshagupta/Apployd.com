const vscode = require('vscode');

const SECRET_TOKEN_KEY = 'apployd.authToken';
const SELECTED_ORGANIZATION_KEY = 'apployd.selectedOrganizationId';
const DEFAULT_API_BASE_URL = 'https://sylicaai.com/api/v1';
const DEFAULT_DASHBOARD_BASE_URL = 'https://sylicaai.com';

class ApiError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

const trimTrailingSlash = (value) => value.replace(/\/+$/, '');

const toApiBaseUrl = () =>
  trimTrailingSlash(
    vscode.workspace
      .getConfiguration('apployd')
      .get('apiBaseUrl', DEFAULT_API_BASE_URL),
  );

const toDashboardBaseUrl = () =>
  trimTrailingSlash(
    vscode.workspace
      .getConfiguration('apployd')
      .get('dashboardBaseUrl', DEFAULT_DASHBOARD_BASE_URL),
  );

const toErrorMessage = (error) => {
  if (!error) {
    return 'Unknown error';
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
};

const formatDateTime = (value) => {
  if (!value) {
    return '-';
  }
  try {
    return new Date(value).toLocaleString();
  } catch {
    return '-';
  }
};

const isDeploymentInProgress = (status) =>
  ['queued', 'building', 'deploying'].includes(String(status || '').toLowerCase());

const deploymentStatusIcon = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'ready') return 'check';
  if (normalized === 'failed') return 'error';
  if (normalized === 'rolled_back') return 'discard';
  if (isDeploymentInProgress(normalized)) return 'sync~spin';
  return 'history';
};

class ApploydClient {
  constructor(context) {
    this.context = context;
  }

  async getToken() {
    return this.context.secrets.get(SECRET_TOKEN_KEY);
  }

  async setToken(token) {
    await this.context.secrets.store(SECRET_TOKEN_KEY, token);
  }

  async clearToken() {
    await this.context.secrets.delete(SECRET_TOKEN_KEY);
  }

  async request(path, options = {}) {
    const token = await this.getToken();
    const method = options.method || 'GET';
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const url = `${toApiBaseUrl()}${path}`;
    let response;

    try {
      response = await fetch(url, {
        ...options,
        method,
        headers,
      });
    } catch (error) {
      throw new Error(`Unable to reach Apployd API at ${toApiBaseUrl()}: ${error.message}`);
    }

    const bodyText = await response.text();
    let body = {};
    if (bodyText) {
      try {
        body = JSON.parse(bodyText);
      } catch {
        body = {};
      }
    }

    if (!response.ok) {
      if (response.status === 401) {
        await this.clearToken();
      }

      const bodyMessage = typeof body.message === 'string' ? body.message : '';
      const message = bodyMessage
        ? `${bodyMessage} (HTTP ${response.status}) [${method} ${url}]`
        : `Request failed with HTTP ${response.status} [${method} ${url}]`;
      throw new ApiError(message, response.status);
    }

    return body;
  }

  async login(email, password) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async me() {
    return this.request('/auth/me');
  }

  async organizations() {
    return this.request('/organizations');
  }

  async projects(organizationId) {
    const query = new URLSearchParams({
      organizationId,
      includeUsage: 'false',
    });
    return this.request(`/projects?${query.toString()}`);
  }

  async deployments(projectId) {
    const query = new URLSearchParams({ projectId });
    return this.request(`/deployments?${query.toString()}`);
  }

  async recentDeployments(organizationId, limit = 20) {
    const query = new URLSearchParams({
      organizationId,
      limit: String(limit),
    });
    return this.request(`/deployments/recent?${query.toString()}`);
  }

  async createDeployment(payload) {
    return this.request('/deployments', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async cancelDeployment(deploymentId) {
    return this.request(`/deployments/${encodeURIComponent(deploymentId)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  async logs(projectId, limit = 200) {
    const query = new URLSearchParams({
      projectId,
      limit: String(limit),
    });
    return this.request(`/logs?${query.toString()}`);
  }
}

class WorkspaceModel {
  constructor(context, client) {
    this.context = context;
    this.client = client;
    this.signedIn = false;
    this.loading = false;
    this.error = '';
    this.userEmail = '';
    this.organizations = [];
    this.selectedOrganization = null;
    this.projects = [];
    this.recentDeployments = [];
  }

  async refresh() {
    this.loading = true;
    this.error = '';

    try {
      const token = await this.client.getToken();
      this.signedIn = Boolean(token);

      if (!this.signedIn) {
        this.userEmail = '';
        this.organizations = [];
        this.selectedOrganization = null;
        this.projects = [];
        this.recentDeployments = [];
        return;
      }

      const [meResponse, organizationResponse] = await Promise.all([
        this.client.me(),
        this.client.organizations(),
      ]);

      this.userEmail = meResponse?.user?.email || '';
      this.organizations = Array.isArray(organizationResponse.organizations)
        ? organizationResponse.organizations
        : [];

      if (!this.organizations.length) {
        this.selectedOrganization = null;
        this.projects = [];
        this.recentDeployments = [];
        return;
      }

      const savedOrganizationId = this.context.globalState.get(
        SELECTED_ORGANIZATION_KEY,
      );
      const selectedOrganization =
        this.organizations.find((organization) => organization.id === savedOrganizationId) ||
        this.organizations[0];

      this.selectedOrganization = selectedOrganization;
      await this.context.globalState.update(
        SELECTED_ORGANIZATION_KEY,
        selectedOrganization.id,
      );

      const [projectResponse, deploymentResponse] = await Promise.all([
        this.client.projects(selectedOrganization.id),
        this.client.recentDeployments(selectedOrganization.id, 20),
      ]);

      this.projects = Array.isArray(projectResponse.projects)
        ? projectResponse.projects
        : [];
      this.recentDeployments = Array.isArray(deploymentResponse.deployments)
        ? deploymentResponse.deployments
        : [];
    } catch (error) {
      this.error = toErrorMessage(error);
      throw error;
    } finally {
      this.loading = false;
    }
  }
}

class InfoItem extends vscode.TreeItem {
  constructor(label, description = '', icon = 'info') {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = description || undefined;
    this.contextValue = 'apployd.info';
    this.iconPath = new vscode.ThemeIcon(icon);
  }
}

class ActionItem extends vscode.TreeItem {
  constructor(label, command, args = [], icon = 'arrow-right') {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'apployd.action';
    this.iconPath = new vscode.ThemeIcon(icon);
    this.command = {
      command,
      title: label,
      arguments: args,
    };
  }
}

class ProjectItem extends vscode.TreeItem {
  constructor(project) {
    super(project.name, vscode.TreeItemCollapsibleState.Collapsed);
    this.project = project;
    this.contextValue = 'apployd.project';
    this.description = project.slug;
    this.tooltip = `${project.name}\nSlug: ${project.slug}\nBranch: ${project.branch || '-'}\nRuntime: ${
      project.runtime || '-'
    }`;
    this.iconPath = new vscode.ThemeIcon(
      project.activeDeploymentId ? 'rocket' : 'symbol-module',
    );
  }
}

class ProjectActionItem extends ActionItem {
  constructor(label, command, project, icon = 'arrow-right') {
    super(label, command, [{ project }], icon);
    this.contextValue = 'apployd.projectAction';
  }
}

class DeploymentItem extends vscode.TreeItem {
  constructor(deployment) {
    const projectName = deployment?.project?.name || 'Unknown project';
    super(projectName, vscode.TreeItemCollapsibleState.Collapsed);
    this.deployment = deployment;
    this.description = `${String(deployment.status || '').toUpperCase()} · ${deployment.environment || 'production'}`;
    this.tooltip = `Deployment: ${deployment.id}\nProject: ${projectName}\nStatus: ${deployment.status}\nBranch: ${
      deployment.branch || '-'
    }\nCreated: ${formatDateTime(deployment.createdAt)}`;
    this.iconPath = new vscode.ThemeIcon(
      deploymentStatusIcon(deployment.status),
    );
    this.contextValue = isDeploymentInProgress(deployment.status)
      ? 'apployd.deployment.inProgress'
      : 'apployd.deployment';
  }
}

class DeploymentActionItem extends ActionItem {
  constructor(label, command, deployment, icon = 'arrow-right') {
    super(label, command, [{ deployment }], icon);
    this.contextValue = 'apployd.deploymentAction';
  }
}

class ApploydOverviewProvider {
  constructor(model) {
    this.model = model;
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  refresh() {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element) {
    return element;
  }

  async getChildren() {
    if (this.model.loading) {
      return [new InfoItem('Syncing workspace', '', 'sync~spin')];
    }

    if (!this.model.signedIn) {
      return [
        new InfoItem('Not signed in', 'Connect your Apployd account', 'account'),
        new ActionItem('Sign In', 'apployd.signIn', [], 'account-add'),
        new ActionItem('Open Dashboard', 'apployd.openDashboard', [], 'globe'),
      ];
    }

    const projectCount = this.model.projects.length;
    const liveCount = this.model.projects.filter((project) => Boolean(project.activeDeploymentId)).length;

    const items = [
      new InfoItem('Account', this.model.userEmail || 'Authenticated', 'account'),
      new InfoItem(
        'Organization',
        this.model.selectedOrganization
          ? `${this.model.selectedOrganization.name} (${this.model.selectedOrganization.role})`
          : 'No organization selected',
        'organization',
      ),
      new InfoItem('Projects', `${projectCount} total · ${liveCount} live`, 'folder-library'),
      new InfoItem('Recent Deployments', `${this.model.recentDeployments.length} items`, 'history'),
    ];

    if (this.model.error) {
      items.push(new InfoItem('Last Error', this.model.error, 'error'));
    }

    items.push(
      new ActionItem('Refresh Workspace', 'apployd.refresh', [], 'refresh'),
      new ActionItem('Switch Organization', 'apployd.selectOrganization', [], 'organization'),
      new ActionItem('Open Dashboard', 'apployd.openDashboard', [], 'link-external'),
      new ActionItem('Sign Out', 'apployd.signOut', [], 'sign-out'),
    );

    return items;
  }
}

class ApploydProjectsProvider {
  constructor(model) {
    this.model = model;
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  refresh() {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element) {
    return element;
  }

  async getChildren(element) {
    if (element instanceof ProjectItem) {
      return [
        new InfoItem('Branch', element.project.branch || '-', 'git-branch'),
        new InfoItem('Runtime', element.project.runtime || '-', 'symbol-namespace'),
        new InfoItem('Target Port', String(element.project.targetPort || '-'), 'plug'),
        new ProjectActionItem('Deploy Now', 'apployd.deployProject', element.project, 'rocket'),
        new ProjectActionItem('Show Logs', 'apployd.showProjectLogs', element.project, 'output'),
        new ProjectActionItem('Cancel Deployment', 'apployd.cancelDeployment', element.project, 'debug-stop'),
        new ProjectActionItem('Open Dashboard', 'apployd.openProjectDashboard', element.project, 'link-external'),
      ];
    }

    if (this.model.loading) {
      return [new InfoItem('Loading projects', '', 'sync~spin')];
    }

    if (!this.model.signedIn) {
      return [new ActionItem('Sign in to load projects', 'apployd.signIn', [], 'account-add')];
    }

    if (!this.model.selectedOrganization) {
      return [new InfoItem('No organization selected', '', 'organization')];
    }

    if (this.model.error) {
      return [
        new InfoItem('Unable to load projects', this.model.error, 'error'),
        new ActionItem('Retry', 'apployd.refresh', [], 'refresh'),
      ];
    }

    if (!this.model.projects.length) {
      return [new InfoItem('No projects yet', 'Create your first project in the dashboard', 'folder')];
    }

    return this.model.projects
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((project) => new ProjectItem(project));
  }
}

class ApploydDeploymentsProvider {
  constructor(model) {
    this.model = model;
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  refresh() {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element) {
    return element;
  }

  async getChildren(element) {
    if (element instanceof DeploymentItem) {
      const project = element.deployment?.project || null;
      const items = [
        new InfoItem('Deployment ID', element.deployment.id, 'symbol-key'),
        new InfoItem('Status', String(element.deployment.status || '-').toUpperCase(), deploymentStatusIcon(element.deployment.status)),
        new InfoItem('Environment', element.deployment.environment || '-', 'layers'),
        new InfoItem('Branch', element.deployment.branch || '-', 'git-branch'),
        new InfoItem('Commit', element.deployment.commitSha || '-', 'git-commit'),
        new InfoItem('Created', formatDateTime(element.deployment.createdAt), 'calendar'),
      ];

      items.push(
        new DeploymentActionItem('Copy Deployment ID', 'apployd.copyDeploymentId', element.deployment, 'copy'),
      );

      if (isDeploymentInProgress(element.deployment.status)) {
        items.push(
          new DeploymentActionItem('Cancel Deployment', 'apployd.cancelDeployment', element.deployment, 'debug-stop'),
        );
      }

      if (project?.id) {
        items.push(
          new DeploymentActionItem(
            'Open Project Dashboard',
            'apployd.openProjectDashboard',
            {
              ...element.deployment,
              project,
            },
            'link-external',
          ),
        );
      }

      return items;
    }

    if (this.model.loading) {
      return [new InfoItem('Loading deployments', '', 'sync~spin')];
    }

    if (!this.model.signedIn) {
      return [new ActionItem('Sign in to view deployments', 'apployd.signIn', [], 'account-add')];
    }

    if (!this.model.selectedOrganization) {
      return [new InfoItem('No organization selected', '', 'organization')];
    }

    if (this.model.error) {
      return [
        new InfoItem('Unable to load deployments', this.model.error, 'error'),
        new ActionItem('Retry', 'apployd.refresh', [], 'refresh'),
      ];
    }

    if (!this.model.recentDeployments.length) {
      return [new InfoItem('No recent deployments', '', 'history')];
    }

    return this.model.recentDeployments.map((deployment) => new DeploymentItem(deployment));
  }
}

const runSafeCommand = (task) => async (...args) => {
  try {
    await task(...args);
  } catch (error) {
    vscode.window.showErrorMessage(`Apployd: ${toErrorMessage(error)}`);
  }
};

const showApiConfigHint = () => {
  vscode.window.setStatusBarMessage(
    'Apployd API URL is configured in Settings under "apployd.apiBaseUrl".',
    5000,
  );
};

const appendLogsToChannel = (outputChannel, project, logs) => {
  outputChannel.clear();
  outputChannel.appendLine(`Apployd logs for ${project.name || 'Project'} (${project.slug || project.id})`);
  outputChannel.appendLine('='.repeat(80));
  if (!logs.length) {
    outputChannel.appendLine('No logs found.');
    outputChannel.show(true);
    return;
  }

  const ordered = logs.slice().reverse();
  for (const entry of ordered) {
    const timestamp = entry.timestamp
      ? new Date(entry.timestamp).toISOString()
      : new Date().toISOString();
    outputChannel.appendLine(
      `[${timestamp}] [${String(entry.level || 'info').toUpperCase()}] [${entry.source || 'unknown'}] ${
        entry.message || ''
      }`,
    );
  }
  outputChannel.show(true);
};

const resolveProjectFromItem = (item, model) => {
  if (item?.project) {
    return item.project;
  }

  if (item?.deployment?.project?.id) {
    const localProject = model.projects.find((project) => project.id === item.deployment.project.id);
    if (localProject) {
      return localProject;
    }

    return {
      id: item.deployment.project.id,
      name: item.deployment.project.name || 'Project',
      slug: item.deployment.project.slug || item.deployment.project.id,
      branch: item.deployment.branch || '',
      runtime: '-',
    };
  }

  return null;
};

const pickProject = async (model, explicitItem) => {
  const resolved = resolveProjectFromItem(explicitItem, model);
  if (resolved) {
    return resolved;
  }

  if (!model.projects.length) {
    vscode.window.showWarningMessage('Apployd: No projects available in the selected organization.');
    return null;
  }

  const selection = await vscode.window.showQuickPick(
    model.projects.map((project) => ({
      label: project.name,
      description: project.slug,
      detail: `Branch: ${project.branch || '-'} | Runtime: ${project.runtime || '-'}`,
      project,
    })),
    {
      title: 'Select Apployd Project',
      placeHolder: 'Choose a project',
    },
  );

  return selection ? selection.project : null;
};

async function activate(context) {
  const outputChannel = vscode.window.createOutputChannel('Apployd');
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 80);
  const client = new ApploydClient(context);
  const model = new WorkspaceModel(context, client);

  const overviewProvider = new ApploydOverviewProvider(model);
  const projectsProvider = new ApploydProjectsProvider(model);
  const deploymentsProvider = new ApploydDeploymentsProvider(model);

  statusBar.command = 'apployd.openControlCenter';
  statusBar.show();

  context.subscriptions.push(outputChannel);
  context.subscriptions.push(statusBar);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('apployd.overview', overviewProvider),
  );
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('apployd.projects', projectsProvider),
  );
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('apployd.deployments', deploymentsProvider),
  );

  const refreshViews = async () => {
    overviewProvider.refresh();
    projectsProvider.refresh();
    deploymentsProvider.refresh();

    await vscode.commands.executeCommand('setContext', 'apployd.signedIn', model.signedIn);
    await vscode.commands.executeCommand('setContext', 'apployd.hasOrganization', Boolean(model.selectedOrganization));
    await vscode.commands.executeCommand('setContext', 'apployd.hasProjects', model.projects.length > 0);

    if (model.loading) {
      statusBar.text = '$(sync~spin) Apployd: Syncing';
      statusBar.tooltip = 'Refreshing workspace data from Apployd';
      return;
    }

    if (!model.signedIn) {
      statusBar.text = '$(account) Apployd: Sign In';
      statusBar.tooltip = 'Sign in to Apployd';
      return;
    }

    if (model.selectedOrganization) {
      statusBar.text = `$(rocket) Apployd: ${model.selectedOrganization.name}`;
      statusBar.tooltip = `Organization: ${model.selectedOrganization.name}`;
      return;
    }

    statusBar.text = '$(organization) Apployd: No Org';
    statusBar.tooltip = 'Select an Apployd organization';
  };

  const refreshWorkspace = async (showErrors = true) => {
    try {
      await model.refresh();
    } catch (error) {
      if (showErrors) {
        vscode.window.showErrorMessage(`Apployd: ${toErrorMessage(error)}`);
      }
    } finally {
      await refreshViews();
    }
  };

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration('apployd.apiBaseUrl')) {
        showApiConfigHint();
        await refreshWorkspace(false);
      }
      if (event.affectsConfiguration('apployd.dashboardBaseUrl')) {
        await refreshWorkspace(false);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('apployd.openControlCenter', runSafeCommand(async () => {
      await vscode.commands.executeCommand('workbench.view.extension.apployd');
      try {
        await vscode.commands.executeCommand('apployd.overview.focus');
      } catch {
        // no-op
      }
    })),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('apployd.refresh', runSafeCommand(async () => {
      await refreshWorkspace(true);
    })),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('apployd.signIn', runSafeCommand(async () => {
      const email = await vscode.window.showInputBox({
        title: 'Apployd Sign In',
        prompt: 'Email',
        ignoreFocusOut: true,
        validateInput: (value) => (value.includes('@') ? null : 'Enter a valid email address.'),
      });
      if (!email) {
        return;
      }

      const password = await vscode.window.showInputBox({
        title: 'Apployd Sign In',
        prompt: 'Password',
        password: true,
        ignoreFocusOut: true,
      });
      if (!password) {
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Apployd: Signing in...',
        },
        async () => {
          const loginResult = await client.login(email, password);
          await client.setToken(loginResult.token);
          await refreshWorkspace(false);
          const emailLabel = model.userEmail || email;
          vscode.window.showInformationMessage(`Apployd: Signed in as ${emailLabel}.`);
        },
      );
    })),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('apployd.signOut', runSafeCommand(async () => {
      await client.clearToken();
      await context.globalState.update(SELECTED_ORGANIZATION_KEY, undefined);
      await refreshWorkspace(false);
      vscode.window.showInformationMessage('Apployd: Signed out.');
    })),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('apployd.selectOrganization', runSafeCommand(async () => {
      if (!model.signedIn) {
        vscode.window.showWarningMessage('Apployd: Sign in first.');
        return;
      }

      if (!model.organizations.length) {
        vscode.window.showInformationMessage('Apployd: No organizations found.');
        return;
      }

      const selection = await vscode.window.showQuickPick(
        model.organizations.map((organization) => ({
          label: organization.name,
          description: organization.slug,
          detail: `Role: ${organization.role}`,
          id: organization.id,
        })),
        {
          title: 'Select Organization',
          placeHolder: 'Choose an Apployd organization',
        },
      );
      if (!selection) {
        return;
      }

      await context.globalState.update(SELECTED_ORGANIZATION_KEY, selection.id);
      await refreshWorkspace(false);
      vscode.window.showInformationMessage(`Apployd: Switched to ${selection.label}.`);
    })),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('apployd.deployProject', runSafeCommand(async (item) => {
      const project = await pickProject(model, item);
      if (!project) {
        return;
      }

      const environmentChoice = await vscode.window.showQuickPick(
        [
          { label: 'Production', description: 'Deploy to production environment', value: 'production' },
          { label: 'Preview', description: 'Deploy to preview environment', value: 'preview' },
        ],
        {
          title: `Deploy ${project.name}`,
          placeHolder: 'Select environment',
        },
      );
      if (!environmentChoice) {
        return;
      }

      const branchInput = await vscode.window.showInputBox({
        title: `Deploy ${project.name}`,
        prompt: 'Branch (leave blank to use default branch)',
        value: project.branch || '',
        ignoreFocusOut: true,
      });
      if (branchInput === undefined) {
        return;
      }

      const commitInput = await vscode.window.showInputBox({
        title: `Deploy ${project.name}`,
        prompt: 'Commit SHA (optional)',
        ignoreFocusOut: true,
      });
      if (commitInput === undefined) {
        return;
      }

      const result = await client.createDeployment({
        projectId: project.id,
        environment: environmentChoice.value,
        ...(branchInput.trim() ? { branch: branchInput.trim() } : {}),
        ...(commitInput.trim() ? { commitSha: commitInput.trim() } : {}),
      });

      await refreshWorkspace(false);
      vscode.window.showInformationMessage(
        `Apployd: Deployment queued (${result.deploymentId || 'unknown id'}).`,
      );
    })),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('apployd.cancelDeployment', runSafeCommand(async (item) => {
      if (item?.deployment?.id) {
        const confirm = await vscode.window.showWarningMessage(
          `Cancel deployment ${item.deployment.id}?`,
          { modal: true },
          'Cancel Deployment',
        );
        if (confirm !== 'Cancel Deployment') {
          return;
        }

        await client.cancelDeployment(item.deployment.id);
        await refreshWorkspace(false);
        vscode.window.showInformationMessage(`Apployd: Deployment ${item.deployment.id} canceled.`);
        return;
      }

      const project = await pickProject(model, item);
      if (!project) {
        return;
      }

      const deploymentResponse = await client.deployments(project.id);
      const deployments = Array.isArray(deploymentResponse.deployments)
        ? deploymentResponse.deployments
        : [];
      const cancellable = deployments.filter((deployment) => isDeploymentInProgress(deployment.status));

      if (!cancellable.length) {
        vscode.window.showInformationMessage(
          `Apployd: No cancellable deployments for ${project.name}.`,
        );
        return;
      }

      const selection = await vscode.window.showQuickPick(
        cancellable.map((deployment) => ({
          label: `${String(deployment.status || '').toUpperCase()} ${deployment.id}`,
          description: deployment.branch || project.branch || '-',
          detail: deployment.createdAt ? new Date(deployment.createdAt).toLocaleString() : '',
          id: deployment.id,
        })),
        {
          title: `Cancel deployment for ${project.name}`,
          placeHolder: 'Select deployment',
        },
      );
      if (!selection) {
        return;
      }

      await client.cancelDeployment(selection.id);
      await refreshWorkspace(false);
      vscode.window.showInformationMessage(`Apployd: Deployment ${selection.id} canceled.`);
    })),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('apployd.showProjectLogs', runSafeCommand(async (item) => {
      const project = await pickProject(model, item);
      if (!project) {
        return;
      }

      const logsResponse = await client.logs(project.id, 200);
      const logs = Array.isArray(logsResponse.logs) ? logsResponse.logs : [];
      appendLogsToChannel(outputChannel, project, logs);
    })),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('apployd.copyDeploymentId', runSafeCommand(async (item) => {
      if (!item?.deployment?.id) {
        vscode.window.showWarningMessage('Apployd: Deployment ID not found.');
        return;
      }

      await vscode.env.clipboard.writeText(item.deployment.id);
      vscode.window.showInformationMessage(`Apployd: Copied deployment ID ${item.deployment.id}.`);
    })),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('apployd.openProjectDashboard', runSafeCommand(async (item) => {
      const project = await pickProject(model, item);
      if (!project?.id) {
        return;
      }

      const projectUrl = `${toDashboardBaseUrl()}/projects/${project.id}`;
      await vscode.env.openExternal(vscode.Uri.parse(projectUrl));
    })),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('apployd.openDashboard', runSafeCommand(async () => {
      await vscode.env.openExternal(vscode.Uri.parse(`${toDashboardBaseUrl()}/overview`));
    })),
  );

  await refreshWorkspace(false);
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
