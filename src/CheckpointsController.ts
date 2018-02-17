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
import { CheckpointsModel, ICheckpoint } from './CheckpointsModel';
import { CheckpointsTreeView, CheckpointNode } from './CheckpointsTreeView';
import { CheckpointsDocumentView } from './CheckpointsDocumentView';
import * as path from 'path';

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
		this.model.checkpointContext = this.activeEditor.document.uri;

		// Update the active editor on when it changes
		this.context.subscriptions.push(
			window.onDidChangeActiveTextEditor(
				editor => {
					this.activeEditor = editor;
					this.model.checkpointContext = this.activeEditor.document.uri;
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
			commands.registerCommand('checkpoints.clearFile', checkpointNode => {
				this.promptAreYouSure(`Are you sure you want to clear all checkpoints from file '${checkpointNode.nodeId}'?`,
					() => {
						this.model.remove(checkpointNode.nodeId);
					},
				);
			}),
			commands.registerCommand('checkpoints.clearAll', () => {
				this.promptAreYouSure(`Are you sure you want to clear ALL checkpoints?`, () => {
					this.model.remove();
				});
			}),
		);

		this.context.subscriptions.push(
			commands.registerCommand('checkpoints.refresh', this.treeView.refresh, this.treeView),
			commands.registerCommand('checkpoints.addCheckpoint', this.onAddCheckpoint, this),
			commands.registerCommand('checkpoints.diffToCurrent', this.onDiffToCurrent, this),
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
	private async onAddCheckpoint() {

		if (this.activeEditor.document.isUntitled) {
			console.log(`Failed to add file to store. Unsaved documents are currently not supported`);
			window.showInformationMessage("Untitled documents are currently not supported");
			return;
		}

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
		let result = await window.showInputBox({
			ignoreFocusOut: true,
			prompt: 'Give your checkpoint a name.',
			value: defaultName,
			valueSelection: undefined,
		})
		
		if (result === undefined) {
			console.log(`Add checkpoint canceled`);
			return;
		}

		// User provided no name.
		if (result === "") {
			result = "Untitled"
		}

		addCheckpoint(result);
	}

	/**
	 * Get the checkpoints saved document and replaces the text in the editor
	 * @param checkpointNode checkpoint node from the tree view
	 */
	private async onRestoreCheckpoint(checkpointNode: CheckpointNode) {
		console.log(
			`Restoring checkpoint: '${checkpointNode.label}', with id: '${checkpointNode.nodeId}'`,
		);

		let textDocument: TextDocument; 	
		let success: boolean;
		try {
			// Get the document to edit.
			textDocument = await this.openTextDocument(checkpointNode);

			// Create a range spanning the entire content of the file
			let lastLine = textDocument.lineAt(textDocument.lineCount - 1);
			let documentRange = new Range(new Position(0, 0), lastLine.rangeIncludingLineBreak.end);

			// Create an edit job
			let workspaceEdit = new WorkspaceEdit();
			workspaceEdit.replace(
				textDocument.uri, 
				documentRange, 
				this.model.getCheckpoint(checkpointNode.nodeId).text
			);

			// Apply the edit job
			success = await workspace.applyEdit(workspaceEdit);

			if (success) {
				// Only save if this is not an untitled document
				// (this happens if the original file is removed/replace/renamed)
				if (textDocument.isUntitled) {
					window.showInformationMessage(`Restored checkpoint '${checkpointNode.label}'`);		
				} else {
					window.showInformationMessage(`Restored '${textDocument.fileName}' to checkpoint '${checkpointNode.label}'`);
					textDocument.save();
				}
			}
		} catch (err) {
			window.showErrorMessage(`Failed to restore file '${checkpointNode.parentId}': ${err.message}`);
			console.error(err);
			return;
		}

		// The file is not open in the currently active editor, open it.
		if (success && checkpointNode.parentId !== this.model.checkpointContext.fsPath) {
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
	private onOpenFile(checkpointNode: CheckpointNode) {
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
				window.showErrorMessage(
					`Cannot open file ${
						checkpointNode.nodeId
					}, showing preview of most recent checkpoint instead`
				);
				console.error(error.message);
				let allCheckpoints: ICheckpoint[] = this.model.getCheckpoints(checkpointNode.nodeId);
				this.documentView.showPreview(allCheckpoints[0].id);
			},
		);
	};

	/**
	 * Opens a input dialog to request a new name for a checkpoint and
	 * updates the model.
	 * @param checkpointNode checkpoint node from the tree view
	 */
	private onRenameCheckpoint(checkpointNode: CheckpointNode) {
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
	 * Gets the text document passes it to the diff view.
	 * @param checkpointNode Checkpoint node to diff against
	 */
	private async onDiffToCurrent(checkpointNode: CheckpointNode) {
		try {
			let textDocument = await workspace.openTextDocument(checkpointNode.parentId);
			this.documentView.showDiff(textDocument.uri, checkpointNode.nodeId);
		} catch (err) {
			console.error(err);
			window.showErrorMessage(`Failed to show diff for ${checkpointNode.label}: ${err.message}`);
			this.documentView.showPreview(checkpointNode.nodeId);
		}
	}
	
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
	 * Wrapper for workspace.openTextDocument that will
	 * open an untitled (unsaved) text document if it has been removed.
	 * @param filePath The absolute file path
	 */
	private async openTextDocument(checkpoint: CheckpointNode) {
		try{
			return await workspace.openTextDocument(checkpoint.parentId);
		} catch (err) {
			window.showWarningMessage("Failed to open original document, opening untitled document instead.")
			return await workspace.openTextDocument({
				content: this.model.getCheckpoint(checkpoint.nodeId).text,
			});
		}
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
