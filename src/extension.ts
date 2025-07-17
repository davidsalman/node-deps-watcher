import * as vscode from 'vscode'
import { DependencyChecker } from './DependencyChecker'
import { PackageManagerDetector } from './PackageManagerDetector'
import { GitMonitor } from './GitMonitor'

let dependencyChecker: DependencyChecker
let packageManagerDetector: PackageManagerDetector
let gitMonitor: GitMonitor
let statusBarItem: vscode.StatusBarItem
let outputChannel: vscode.OutputChannel

export function activate(context: vscode.ExtensionContext) {
  console.log('Node Dependency Watcher is now active!')

  // Initialize output channel
  outputChannel = vscode.window.createOutputChannel('Node Deps Watcher')
  context.subscriptions.push(outputChannel)

  // Initialize status bar item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
  statusBarItem.command = 'nodeDepsWatcher.checkDependencies'
  context.subscriptions.push(statusBarItem)

  // Initialize core components
  packageManagerDetector = new PackageManagerDetector(outputChannel)
  dependencyChecker = new DependencyChecker(packageManagerDetector, outputChannel)
  gitMonitor = new GitMonitor(outputChannel)

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('nodeDepsWatcher.checkDependencies', checkDependencies),
    vscode.commands.registerCommand('nodeDepsWatcher.cleanInstall', cleanInstall),
    vscode.commands.registerCommand('nodeDepsWatcher.detectPackageManager', detectPackageManager),
    vscode.commands.registerCommand('nodeDepsWatcher.toggleAutoCheck', toggleAutoCheck),
    vscode.commands.registerCommand(
      'nodeDepsWatcher.toggleDeleteNodeModulesOnCleanInstall',
      toggleDeleteNodeModulesOnCleanInstall,
    ),
  )

  // Set up workspace monitoring
  setupWorkspaceMonitoring(context)

  // Initial check
  if (vscode.workspace.workspaceFolders) {
    checkDependencies()
  }

  updateStatusBar('$(sync~spin) Initializing...')
}

/* Utilities */

function setupWorkspaceMonitoring(context: vscode.ExtensionContext) {
  // Monitor git branch changes
  gitMonitor.onBranchChange(branchName => {
    const config = vscode.workspace.getConfiguration('nodeDepsWatcher')
    if (config.get('autoCheckOnBranchSwitch', true)) {
      outputChannel.appendLine(`Branch changed to: ${branchName}`)
      checkDependencies()
    }
  })

  // Monitor package.json changes
  const packageJsonWatcher = vscode.workspace.createFileSystemWatcher('**/package.json')
  packageJsonWatcher.onDidChange(() => {
    outputChannel.appendLine('package.json changed, checking dependencies...')
    checkDependencies()
  })
  context.subscriptions.push(packageJsonWatcher)

  // Monitor lock file changes
  const lockFileWatcher = vscode.workspace.createFileSystemWatcher('**/{package-lock.json,yarn.lock,pnpm-lock.yaml}')
  lockFileWatcher.onDidChange(() => {
    outputChannel.appendLine('Lock file changed, checking dependencies...')
    checkDependencies()
  })
  context.subscriptions.push(lockFileWatcher)
}

function updateStatusBar(text: string) {
  const config = vscode.workspace.getConfiguration('nodeDepsWatcher')
  if (config.get('showStatusBarItem', true)) {
    statusBarItem.text = text
    statusBarItem.show()
  } else {
    statusBarItem.hide()
  }
}

/* Commands */

async function checkDependencies() {
  if (!vscode.workspace.workspaceFolders) {
    updateStatusBar('$(warning) No workspace')
    return
  }

  updateStatusBar('$(sync~spin) Checking dependencies...')

  try {
    const workspaceFolder = vscode.workspace.workspaceFolders[0]
    const result = await dependencyChecker.checkDependencies(workspaceFolder.uri.fsPath)

    if (result.isValid) {
      updateStatusBar('$(check) Dependencies OK')
      vscode.window.showInformationMessage('Dependencies are up to date!')
    } else {
      updateStatusBar('$(warning) Dependencies out of sync')

      const messages = []
      if (result.missingPackages.length > 0) {
        messages.push(`Missing: ${result.missingPackages.join(', ')}`)
      }
      if (result.extraPackages.length > 0) {
        messages.push(`Extra: ${result.extraPackages.join(', ')}`)
      }
      if (result.outdatedPackages.length > 0) {
        messages.push(`Outdated: ${result.outdatedPackages.join(', ')}`)
      }

      const message = `Dependencies out of sync. ${messages.join('. ')}`
      const action = await vscode.window.showWarningMessage(message, 'Clean Install', 'Ignore')

      if (action === 'Clean Install') {
        await cleanInstall()
      }
    }
  } catch (error) {
    updateStatusBar('$(error) Check failed')
    vscode.window.showErrorMessage(`Failed to check dependencies: ${error}`)
    outputChannel.appendLine(`Error: ${error}`)
  }
}

async function cleanInstall() {
  if (!vscode.workspace.workspaceFolders) {
    vscode.window.showErrorMessage('No workspace folder found')
    return
  }

  updateStatusBar('$(sync~spin) Installing dependencies...')

  try {
    const workspaceFolder = vscode.workspace.workspaceFolders[0]
    const packageManager = await packageManagerDetector.detectPackageManager(workspaceFolder.uri.fsPath)

    outputChannel.appendLine(`Using package manager: ${packageManager}`)

    await dependencyChecker.cleanInstall(workspaceFolder.uri.fsPath, packageManager)

    updateStatusBar('$(check) Dependencies installed')
    vscode.window.showInformationMessage('Dependencies successfully installed!')
  } catch (error) {
    updateStatusBar('$(error) Install failed')
    vscode.window.showErrorMessage(`Failed to install dependencies: ${error}`)
    outputChannel.appendLine(`Error: ${error}`)
  }
}

async function detectPackageManager() {
  if (!vscode.workspace.workspaceFolders) {
    vscode.window.showErrorMessage('No workspace folder found')
    return
  }

  try {
    const workspaceFolder = vscode.workspace.workspaceFolders[0]
    const packageManager = await packageManagerDetector.detectPackageManager(workspaceFolder.uri.fsPath)

    vscode.window.showInformationMessage(`Detected package manager: ${packageManager}`)
    outputChannel.appendLine(`Detected package manager: ${packageManager}`)
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to detect package manager: ${error}`)
    outputChannel.appendLine(`Error: ${error}`)
  }
}

async function toggleAutoCheck() {
  const config = vscode.workspace.getConfiguration('nodeDepsWatcher')
  const current = config.get('autoCheckOnBranchSwitch', true)

  await config.update('autoCheckOnBranchSwitch', !current, vscode.ConfigurationTarget.Workspace)

  const status = !current ? 'enabled' : 'disabled'
  vscode.window.showInformationMessage(`Auto-check on branch switch ${status}`)
}

async function toggleDeleteNodeModulesOnCleanInstall() {
  const config = vscode.workspace.getConfiguration('nodeDepsWatcher')
  const current = config.get('deleteNodeModulesOnCleanInstall', false)

  await config.update('deleteNodeModulesOnCleanInstall', !current, vscode.ConfigurationTarget.Workspace)
  const status = !current ? 'enabled' : 'disabled'
  vscode.window.showInformationMessage(`Delete node_modules on clean install ${status}`)
}

export function deactivate() {
  if (statusBarItem) {
    statusBarItem.dispose()
  }
  if (outputChannel) {
    outputChannel.dispose()
  }
}
