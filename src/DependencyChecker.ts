import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import * as semver from 'semver'
import { PackageManagerDetector } from './PackageManagerDetector'

/**
 * DependencyCheckResult interface to represent the result of a dependency check.
 * It includes information about missing, extra, and outdated packages,
 * as well as any errors encountered during the check.
 */
export interface DependencyCheckResult {
  isValid: boolean
  missingPackages: string[]
  extraPackages: string[]
  outdatedPackages: string[]
  errors: string[]
}
/**
 * DependencyChecker class to check and manage dependencies in a Node.js project.
 * It uses the PackageManagerDetector to identify the package manager and perform checks.
 * It also provides methods for checking dependencies, performing clean installs, and validating versions.
 *
 * Usage:
 * - Create an instance of DependencyChecker with a PackageManagerDetector and an OutputChannel.
 * - Call `checkDependencies(workspacePath)` to check the dependencies in the specified workspace.
 * - Call `cleanInstall(workspacePath, packageManager)` to perform a clean install of
 *  dependencies using the specified package manager.
 *
 * Events:
 * - `onDependencyCheck`: Event fired when dependency checks are completed.
 * - `onCleanInstall`: Event fired when a clean install is performed.
 *
 * @example
 * ```typescript
 * const dependencyChecker = new DependencyChecker(packageManagerDetector, outputChannel);
 * const result = await dependencyChecker.checkDependencies(workspacePath);
 * if (result.isValid) {
 *  console.log('Dependencies are valid');
 * } else {
 * console.log('Dependencies are not valid:', result);
 * }
 * await dependencyChecker.cleanInstall(workspacePath, 'npm');
 * ```
 * @remarks
 * - Requires a valid Node.js project with a package.json file.
 * - The package manager must be installed and available in the system PATH.
 * - Handles various version formats and checks compatibility.
 * - Provides methods to delete directories and check version compatibility.
 *
 * @method checkDependencies - Checks the dependencies in the specified workspace.
 * @method cleanInstall - Performs a clean install of dependencies using the specified package manager.
 * @method isVersionCompatible - Checks if a required version is compatible with an installed version.
 * @method deleteDirectory - Deletes a directory and its contents.
 * @method dispose - Disposes resources used by the DependencyChecker.
 *
 * @constructor
 * @param packageManagerDetector - An instance of PackageManagerDetector to detect the package manager.
 * @param outputChannel - An instance of vscode.OutputChannel for logging output.
 *
 * @eventProperty onDependencyCheck - Event fired when dependency checks are completed.
 * @eventProperty onCleanInstall - Event fired when a clean install is performed.
 */
export class DependencyChecker {
  constructor(
    private packageManagerDetector: PackageManagerDetector,
    private outputChannel: vscode.OutputChannel,
  ) {}

  async checkDependencies(workspacePath: string): Promise<DependencyCheckResult> {
    const result: DependencyCheckResult = {
      isValid: true,
      missingPackages: [],
      extraPackages: [],
      outdatedPackages: [],
      errors: [],
    }

    try {
      // Read package.json
      const packageJsonPath = path.join(workspacePath, 'package.json')
      if (!fs.existsSync(packageJsonPath)) {
        result.errors.push('package.json not found')
        result.isValid = false
        return result
      }

      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
      const requiredDependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      }

      // Detect package manager and get installed packages
      const packageManager = await this.packageManagerDetector.detectPackageManager(workspacePath)
      const installedPackages = await this.packageManagerDetector.getInstalledPackages(workspacePath, packageManager)

      // Check for missing packages
      for (const [name, version] of Object.entries(requiredDependencies)) {
        if (!installedPackages[name]) {
          result.missingPackages.push(name)
          result.isValid = false
        } else {
          // Check version compatibility
          const installedVersion = installedPackages[name]
          if (!this.isVersionCompatible(version as string, installedVersion)) {
            result.outdatedPackages.push(`${name}@${installedVersion} (required: ${version})`)
            result.isValid = false
          }
        }
      }

      // Check for extra packages (this is less critical, so we'll just log them)
      for (const name of Object.keys(installedPackages)) {
        if (!requiredDependencies[name]) {
          result.extraPackages.push(name)
        }
      }

      this.outputChannel.appendLine(`Dependency check completed for ${workspacePath}`)
      this.outputChannel.appendLine(`Missing: ${result.missingPackages.length}`)
      this.outputChannel.appendLine(`Extra: ${result.extraPackages.length}`)
      this.outputChannel.appendLine(`Outdated: ${result.outdatedPackages.length}`)
    } catch (error) {
      result.errors.push(`Failed to check dependencies: ${error}`)
      result.isValid = false
      this.outputChannel.appendLine(`Error checking dependencies: ${error}`)
    }

    return result
  }

  async cleanInstall(workspacePath: string, packageManager: string): Promise<void> {
    const pmInfo = this.packageManagerDetector.getPackageManagerInfo(packageManager)

    this.outputChannel.appendLine(`Performing clean install with ${packageManager} in ${workspacePath}`)

    const config = vscode.workspace.getConfiguration('nodeDepsWatcher')
    if (config.get('deleteNodeModulesOnCleanInstall', false)) {
      // Remove node_modules if it exists
      const nodeModulesPath = path.join(workspacePath, 'node_modules')
      if (fs.existsSync(nodeModulesPath)) {
        this.outputChannel.appendLine('Removing existing node_modules...')
        await this.deleteDirectory(nodeModulesPath)
      }
    }

    // Run clean install command
    await this.packageManagerDetector.executeCommand(pmInfo.cleanInstallCommand, workspacePath)
  }

  private isVersionCompatible(required: string, installed: string): boolean {
    try {
      // Handle various version formats
      if (required.startsWith('file:') || required.startsWith('git+')) {
        return true // Skip version check for local/git dependencies
      }

      const cleanRequired = required.replace(/^[\^~]/, '')
      const cleanInstalled = installed.replace(/^v/, '')

      if (required.startsWith('^')) {
        return semver.satisfies(cleanInstalled, `^${cleanRequired}`)
      } else if (required.startsWith('~')) {
        return semver.satisfies(cleanInstalled, `~${cleanRequired}`)
      } else {
        return semver.satisfies(cleanInstalled, cleanRequired)
      }
    } catch (error) {
      this.outputChannel.appendLine(`Version comparison failed for ${required} vs ${installed}: ${error}`)
      return false
    }
  }

  private async deleteDirectory(dirPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      fs.rm(dirPath, { recursive: true, force: true }, err => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }
}
