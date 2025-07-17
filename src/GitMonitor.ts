import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Monitors the current Git branch of the active workspace and emits events when the branch changes.
 *
 * This class sets up file system watchers on the `.git/HEAD` file and the `.git/refs/heads/*` directory
 * to detect branch changes in a Git repository. When a branch change is detected, it emits an event
 * with the new branch name.
 *
 * @example
 * ```typescript
 * const monitor = new GitMonitor(outputChannel);
 * monitor.onBranchChange((branch) => {
 *   console.log('Branch changed to:', branch);
 * });
 * ```
 *
 * @remarks
 * - Emits the short SHA string when in detached HEAD state.
 * - Requires a valid Git repository in the workspace.
 * - Call `dispose()` to clean up resources when done.
 *
 * @method getCurrentBranch - Returns the current branch name or short SHA in detached HEAD state.
 * @method checkBranchChange - Checks for branch changes and emits an event if a change is
 * @method setupGitMonitoring - Sets up file system watchers to monitor branch changes.
 * @method dispose - Disposes file watchers and event emitters.
 *
 * @constructor
 * @param outputChannel - An instance of vscode.OutputChannel for logging output.
 *
 * @eventProperty onBranchChange - Event fired when the current branch changes.
 */
export class GitMonitor {
  private currentBranch: string = ''
  private branchChangeEmitter = new vscode.EventEmitter<string>()
  private fileWatcher: vscode.FileSystemWatcher | undefined

  constructor(private outputChannel: vscode.OutputChannel) {
    this.setupGitMonitoring()
  }

  get onBranchChange(): vscode.Event<string> {
    return this.branchChangeEmitter.event
  }

  private setupGitMonitoring() {
    if (!vscode.workspace.workspaceFolders) {
      return
    }

    const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath
    const gitPath = path.join(workspacePath, '.git')

    if (!fs.existsSync(gitPath)) {
      this.outputChannel.appendLine('No git repository found')
      return
    }

    // Get initial branch
    this.currentBranch = this.getCurrentBranch(workspacePath)
    this.outputChannel.appendLine(`Initial branch: ${this.currentBranch}`)

    // Watch for branch changes
    this.fileWatcher = vscode.workspace.createFileSystemWatcher('**/.git/HEAD')
    this.fileWatcher.onDidChange(() => {
      this.checkBranchChange(workspacePath)
    })

    // Also watch for git operations that might not update HEAD directly
    const gitRefWatcher = vscode.workspace.createFileSystemWatcher('**/.git/refs/heads/*')
    gitRefWatcher.onDidChange(() => {
      setTimeout(() => this.checkBranchChange(workspacePath), 100)
    })
  }

  private getCurrentBranch(workspacePath: string): string {
    try {
      const gitHeadPath = path.join(workspacePath, '.git', 'HEAD')
      if (!fs.existsSync(gitHeadPath)) {
        return ''
      }

      const headContent = fs.readFileSync(gitHeadPath, 'utf8').trim()

      if (headContent.startsWith('ref: refs/heads/')) {
        return headContent.replace('ref: refs/heads/', '')
      } else {
        // Detached HEAD state
        return headContent.substring(0, 7) // Short SHA
      }
    } catch (error) {
      this.outputChannel.appendLine(`Failed to get current branch: ${error}`)
      return ''
    }
  }

  private checkBranchChange(workspacePath: string) {
    const newBranch = this.getCurrentBranch(workspacePath)

    if (newBranch && newBranch !== this.currentBranch) {
      this.outputChannel.appendLine(`Branch changed from ${this.currentBranch} to ${newBranch}`)
      this.currentBranch = newBranch
      this.branchChangeEmitter.fire(newBranch)
    }
  }

  dispose() {
    if (this.fileWatcher) {
      this.fileWatcher.dispose()
    }
    this.branchChangeEmitter.dispose()
  }
}
