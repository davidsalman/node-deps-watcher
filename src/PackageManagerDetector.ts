import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

/**
 * PackageManagerInfo interface to represent the details of a package manager.
 * It includes the name, lock file, install command, clean install command,
 * and list command for the package manager.
 */
export interface PackageManagerInfo {
  name: string
  lockFile: string
  installCommand: string
  cleanInstallCommand: string
  listCommand: string
}

/**
 * PackageManagerDetector class to detect the package manager used in a Node.js project.
 * It checks for lock files, available package managers, and provides methods to
 * execute commands related to the detected package manager.
 *
 * Usage:
 * - Create an instance of PackageManagerDetector with an OutputChannel.
 * - Call `detectPackageManager(workspacePath)` to detect the package manager in the specified workspace.
 * - Call `getInstalledPackages(workspacePath, packageManager)` to get installed packages for the detected package manager.
 *
 * @example
 * ```typescript
 * const detector = new PackageManagerDetector(outputChannel);
 * const pm = await detector.detectPackageManager(workspacePath);
 * console.log('Detected package manager:', pm);
 * ```
 *
 * @remarks
 * - Supports npm, yarn, and pnpm as package managers.
 * - Requires a valid Node.js project with a package.json file.
 * - Handles various version formats and checks compatibility.
 *
 * @method detectPackageManager - Detects the package manager used in the specified workspace.
 * @method getInstalledPackages - Gets installed packages for the specified package manager.
 * @method executeCommand - Executes a command using the detected package manager.
 *
 * @constructor
 * @param outputChannel - An instance of vscode.OutputChannel for logging output.
 */
export class PackageManagerDetector {
  private packageManagers: PackageManagerInfo[] = [
    {
      name: 'pnpm',
      lockFile: 'pnpm-lock.yaml',
      installCommand: 'pnpm install',
      cleanInstallCommand: 'pnpm install --frozen-lockfile',
      listCommand: 'pnpm list --depth=0 --silent --json',
    },
    {
      name: 'yarn',
      lockFile: 'yarn.lock',
      installCommand: 'yarn install',
      cleanInstallCommand: 'yarn install --frozen-lockfile',
      listCommand: 'yarn list --depth=0 --silent --json',
    },
    {
      name: 'npm',
      lockFile: 'package-lock.json',
      installCommand: 'npm install',
      cleanInstallCommand: 'npm ci',
      listCommand: 'npm list --depth=0 --silent --json',
    },
  ]
  private fileChangeEmitter = new vscode.EventEmitter<string>()
  private packageJsonWatcher: vscode.FileSystemWatcher | undefined
  private lockFileWatcher: vscode.FileSystemWatcher | undefined

  constructor(private outputChannel: vscode.OutputChannel) {
    this.setupFileWatchers()
  }

  get onFileChange(): vscode.Event<string> {
    return this.fileChangeEmitter.event
  }

  private setupFileWatchers() {
    if (!vscode.workspace.workspaceFolders) {
      return
    }

    const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath
    const packageJsonPath = path.join(workspacePath, 'package.json')
    if (!fs.existsSync(packageJsonPath)) {
      this.outputChannel.appendLine('No package.json found, skipping file watchers setup')
      return
    }

    // Watch for package.json changes
    this.packageJsonWatcher = vscode.workspace.createFileSystemWatcher('**/package.json')
    this.packageJsonWatcher.onDidChange(() => {
      this.fileChangeEmitter.fire('package.json')
    })

    // Watch for lock file changes
    this.lockFileWatcher = vscode.workspace.createFileSystemWatcher('**/{package-lock.json,yarn.lock,pnpm-lock.yaml}')
    this.lockFileWatcher.onDidChange((e: vscode.Uri) => {
      this.fileChangeEmitter.fire(`${e.fsPath}`)
    })
  }

  async detectPackageManager(workspacePath: string): Promise<string> {
    const config = vscode.workspace.getConfiguration('nodeDepsWatcher')
    const preferred = config.get('preferredPackageManager', 'auto')

    if (preferred !== 'auto') {
      this.outputChannel.appendLine(`Using preferred package manager: ${preferred}`)
      return preferred
    }

    // Check for lock files
    for (const pm of this.packageManagers) {
      const lockFilePath = path.join(workspacePath, pm.lockFile)
      if (fs.existsSync(lockFilePath)) {
        this.outputChannel.appendLine(`Found ${pm.lockFile}, using ${pm.name}`)
        return pm.name
      }
    }

    // Check for package manager availability
    for (const pm of this.packageManagers) {
      try {
        await execAsync(`${pm.name} --version`)
        this.outputChannel.appendLine(`${pm.name} is available, using it as default`)
        return pm.name
      } catch (error) {
        this.outputChannel.appendLine(`${pm.name} is not available: ${error}`)
      }
    }

    // Default to npm
    this.outputChannel.appendLine('Defaulting to npm')
    return 'npm'
  }

  getPackageManagerInfo(name: string): PackageManagerInfo {
    const pm = this.packageManagers.find(p => p.name === name)
    if (!pm) {
      throw new Error(`Unsupported package manager: ${name}`)
    }
    return pm
  }

  async getInstalledPackages(workspacePath: string, packageManager: string): Promise<Record<string, string>> {
    const pmInfo = this.getPackageManagerInfo(packageManager)

    // Get installed packages using the package manager's list command
    let commandOutput: string = ''
    try {
      this.outputChannel.appendLine(`Running command: ${pmInfo.listCommand}`)
      const { stdout } = await execAsync(pmInfo.listCommand, { cwd: workspacePath })
      commandOutput = stdout
    } catch (error) {
      this.outputChannel.appendLine(`Failed to get installed packages: ${error}`.trim())
      this.outputChannel.appendLine(`Running command: output=$(${pmInfo.listCommand} 2>&1) || echo "$output"`)
      const { stdout } = await execAsync(`output=$(${pmInfo.listCommand} 2>&1) || echo "$output"`, {
        cwd: workspacePath,
      })
      commandOutput = stdout
    }

    // Parse the command output to extract package names and versions
    const packages: Record<string, string> = {}
    try {
      const result = JSON.parse(commandOutput)
      switch (packageManager) {
        case 'yarn':
          if (result.data && result.data.trees) {
            result.data.trees.forEach((tree: { name: string }) => {
              if (tree.name && tree.name.includes('@')) {
                // Extract package name and version accounting for scope packages
                // e.g., @scope/package@1.0.0
                const match = tree.name.match(/^(.*)@([^@]+)$/)
                if (match) {
                  const [, name, version] = match
                  packages[name] = version
                }
              }
            })
          }
          break
        case 'pnpm':
        case 'npm':
          if (result.dependencies) {
            Object.keys(result.dependencies).forEach(name => {
              if (result.dependencies[name].version) {
                packages[name] = result.dependencies[name].version
              }
            })
          }
          break
      }
    } catch (error) {
      this.outputChannel.appendLine(`Failed to parse installed packages: ${error}`)
    } finally {
      return packages
    }
  }

  async executeCommand(command: string, workspacePath: string): Promise<void> {
    this.outputChannel.appendLine(`Executing: ${command}`)

    return new Promise((resolve, reject) => {
      const process = exec(command, { cwd: workspacePath })

      process.stdout?.on('data', data => {
        this.outputChannel.append(data.toString())
      })

      process.stderr?.on('data', data => {
        this.outputChannel.append(data.toString())
      })

      process.on('close', code => {
        if (code === 0) {
          this.outputChannel.appendLine(`Command completed successfully`)
          resolve()
        } else {
          this.outputChannel.appendLine(`Command failed with code ${code}`)
          reject(new Error(`Command failed with code ${code}`))
        }
      })
    })
  }

  dispose() {
    if (this.packageJsonWatcher) {
      this.packageJsonWatcher.dispose()
    }
    if (this.lockFileWatcher) {
      this.lockFileWatcher.dispose()
    }
    this.fileChangeEmitter.dispose()
  }
}
