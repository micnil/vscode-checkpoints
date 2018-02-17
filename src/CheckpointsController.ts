import {
	TextEditor,
	window,
	ExtensionContext,
	commands,
	Position,
	Range,
	MessageItem,
	workspace,
	TextDocument,
	WorkspaceEdit,
	Uri
} from 'vscode';
import { CheckpointsModel } from './CheckpointsModel';
import { CheckpointsTreeView } from './CheckpointsTreeView';
import { CheckpointsDocumentView } from './CheckpointsDocumentView';

export class CheckpointsController {
	private activeEditor: TextEditor;

	constructor(
		private context: ExtensionContext,
		private model: CheckpointsModel,
		private treeView: CheckpointsTreeView,
		private documentView: CheckpointsDocumentView,
	) {}

	public initialize() {
		this.activeEditor = window.activeTextEditor;
		if (!this.activeEditor) {
			return;
		}

		// initial selection of slot context.
		this.model.checkpointContext = this.activeEditor.document.fileName;

		// Update the active editor on when it changes
		this.context.subscriptions.push(
			window.onDidChangeActiveTextEditor(
				editor => {
					this.activeEditor = editor;
					this.model.checkpointContext = this.activeEditor.document.fileName;
				},
				null,
				this.context.subscriptions,
			),
		);

		this.context.subscriptions.push(
			window.registerTreeDataProvider('checkpointsTreeView', this.treeView),
			workspace.registerTextDocumentContentProvider('checkpointsDocumentView', this.documentView),
		);

		// Register commands
		// =================

		this.context.subscriptions.push(
			commands.registerCommand('checkpoints.deleteCheckpoint', checkpointNode => {
				this.promptAreYouSure(`Are you sure you want to delete checkpoint '${checkpointNode.label}'?`,
					() => {
						this.model.remove(checkpointNode.nodeId);
					},
				);
			}),
		);

		this.context.subscriptions.push(
			commands.registerCommand('checkpoints.clearFile', checkpointNode => {
				this.promptAreYouSure(`Are you sure you want to clear all checkpoints from file '${checkpointNode.nodeId}'?`,
					() => {
						this.model.remove(checkpointNode.nodeId);
					},
				);
			}),
		);

		this.context.subscriptions.push(
			commands.registerCommand('checkpoints.clearAll', () => {
				this.promptAreYouSure(`Are you sure you want to clear ALL checkpoints?`, () => {
					this.model.remove();
				});
			}),
		);

		this.context.subscriptions.push(
			commands.registerCommand('checkpoints.diffToCurrent', checkpointNode => {
				this.documentView.showDiff(this.activeEditor.document.uri, checkpointNode.nodeId);
			}),
		);

		this.context.subscriptions.push(
			commands.registerCommand('checkpoints.refresh', this.treeView.refresh, this.treeView),
			commands.registerCommand('checkpoints.addCheckpoint', this.onAddCheckpoint, this),
			commands.registerCommand('checkpoints.restoreCheckpoint', this.onRestoreCheckpoint, this),
			commands.registerCommand('checkpoints.openFile', this.onOpenFile, this),
			commands.registerCommand('checkpoints.renameCheckpoint', this.onRenameCheckpoint, this),
			commands.registerCommand('checkpoints.toggleTreeViewContext', this.onToggleShowActiveFileOnly, this)
		);
	}

	/** 
	 * Tries to add a new checkpoint from the current document to
	 * the checkpoint model.
	*/
	private onAddCheckpoint() {

		const timestamp = Date.now();
		
		// local helper method to a a checkpoint.
		let addCheckpoint = (name: string) => {
			try {
				this.model.add(this.activeEditor.document, name, timestamp);
				this.activeEditor.document.save();
				window.setStatusBarMessage(`Added checkpoint '${defaultName}'`, 5000)
			} catch (err) {
				window.showErrorMessage(`Add checkpoint failed: ${err.message}`)
			}
		}

		const config = workspace.getConfiguration('checkpoints');

		// create default name
		let locale: string = config.get('locale');
		const defaultName = new Date(timestamp).toLocaleString(locale);
		
		// If "ask for checkpoint name" is disabled, use default name.
		if (config.get('askForCheckpointName') === false) {
			addCheckpoint(defaultName);
			return;
		}

		// Ask the user for a checkpoint name
		window.showInputBox({
			ignoreFocusOut: true,
			prompt: 'Give your checkpoint a name.',
			value: defaultName,
			valueSelection: undefined,
		})
		.then(result => {

			if (result === undefined) {
				console.log(`Add checkpoint canceled`);
				return;
			}

			// User provided no name.
			if (result === "") {
				result = "Untitled"
			}

			addCheckpoint(result);
		});
	}

	/**
	 * Get the checkpoints saved document and replaces the text in the editor
	 * @param checkpointNode checkpoint node from the tree view
	 */
	private async onRestoreCheckpoint(checkpointNode) {
		console.log(
			`Restoring checkpoint: '${checkpointNode.label}', with id: '${checkpointNode.nodeId}'`,
		);
		
		let textDocument: TextDocument; 	
		let success: boolean;
		try {
			// Get the document to edit.
			textDocument = await workspace.openTextDocument(checkpointNode.parentId);

			// Create a range spanning the entire content of the file
			let lastLine = textDocument.lineAt(textDocument.lineCount - 1);
			let documentRange = new Range(new Position(0, 0), lastLine.rangeIncludingLineBreak.end);

			// Create an edit job
			let workspaceEdit = new WorkspaceEdit();
			workspaceEdit.replace(
				Uri.file(checkpointNode.parentId), 
				documentRange, 
				this.model.getCheckpoint(checkpointNode.nodeId).text
			);

			// Apply the edit job
			success = await workspace.applyEdit(workspaceEdit);

			if (success) {
				textDocument.save();
				window.showInformationMessage(`Restored '${textDocument.fileName}' to checkpoint '${checkpointNode.label}'`);
			}
		} catch (err) {
			window.showErrorMessage(`Failed to restore file '${checkpointNode.parentId}': ${err.message}`);
			console.error(err);
			return;
		}

		// The file is not open in the currently active editor, open it.
		if (success && checkpointNode.parentId !== this.model.checkpointContext) {
			let editor = await window.showTextDocument(textDocument, {
				preserveFocus: false,
				preview: true,
			});
		}
	};

	/**
	 * Opens the current file of the checkpoint.
	 * @param checkpointNode checkpoint node from the tree view
	 */
	private onOpenFile(checkpointNode) {
		console.log(`Opening file: '${checkpointNode.nodeId}'`);

		workspace.openTextDocument(checkpointNode.nodeId).then(
			// On success:
			textDocument => {
				window.showTextDocument(textDocument, {
					preserveFocus: false,
					preview: true,
				});
			},
			// On failure:
			error => {
				window.showErrorMessage(`Cannot open file ${checkpointNode.nodeId}.`);
				console.error(error.message);
			},
		);
	};

	/**
	 * Opens a input dialog to request a new name for a checkpoint and
	 * updates the model.
	 * @param checkpointNode checkpoint node from the tree view
	 */
	private onRenameCheckpoint(checkpointNode) {
		console.log(`Rename checkpoint command invoked on checkpoint: '${checkpointNode.label}'`);

		window
			.showInputBox({
				ignoreFocusOut: true,
				prompt: 'Type in a new name for the checkpoint.',
				value: checkpointNode.label,
				valueSelection: undefined,
			})
			.then(result => {
				if (result === undefined) {
					console.log(`Rename checkpoint canceled`);
					return;
				}

				if (result === checkpointNode.label) {
					console.log(`Checkpoint name is the same as before, returning.`);
					return;
				}

				this.model.renameCheckpoint(checkpointNode.nodeId, result);
			});
	};
	
	/** 
	 * Toggles the configuration showActiveFileOnly
	 * and refreshed the tree view.
	*/
	private onToggleShowActiveFileOnly() {
		let config = workspace.getConfiguration('checkpoints');
		let currentConfigValue = config.get('showActiveFileOnly'); 
		config.update('showActiveFileOnly', !currentConfigValue)
			.then(
			() => {
				window.setStatusBarMessage(`Set showActiveFileOnly config to '${!currentConfigValue}'`, 5000)
				this.treeView.refresh();
			},
			(err) => {
				console.error(err);
				window.showErrorMessage("Failed to toggle 'Show Active File Only'");
			})
	}

	/**
	 * Prompt the user with a modal before performing an action
	 * @param message Message to ask the user (yes/no question)
	 * @param cb Callback that will be called if answer is yes
	 */
	private promptAreYouSure(message: string, cb) {
		window
			.showWarningMessage<MessageItem>(
				message,
				{ modal: true },
				{ title: 'Yes', isCloseAffordance: false },
				{ title: 'No', isCloseAffordance: true },
			)
			.then(answer => {
				if (answer.title === 'Yes') {
					cb();
				}
			});
	}
}
