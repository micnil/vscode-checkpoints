import {
	TextDocumentContentProvider,
	ExtensionContext,
	Uri,
	Event,
	EventEmitter,
	commands,
	window
} from 'vscode';
import { CheckpointsModel, ICheckpoint, IFile, ICheckpointStore, isCheckpoint, isFile } from './CheckpointsModel';
import * as path from 'path';

export class CheckpointsDocumentView implements TextDocumentContentProvider {
	private _onDidChange: EventEmitter<Uri> = new EventEmitter<Uri>();
	readonly onDidChange: Event<Uri> = this._onDidChange.event;

	readonly context: ExtensionContext;
	constructor(context: ExtensionContext, private model: CheckpointsModel) {
		this.context = context;

		context.subscriptions.push(
			model.onDidRemoveCheckpoint((removedItem: ICheckpoint | IFile | ICheckpointStore) => {
				if (isCheckpoint(removedItem)){
					this._onDidChange.fire(this.getCheckpointUri(removedItem));
				} else if (isFile(removedItem)) {
					this._onDidChange.fire(Uri.parse(removedItem.id));
				}
			}),
			model.onDidUpdateItem((updatedItem: ICheckpoint | IFile) => {
				if (isCheckpoint(updatedItem)){
					this._onDidChange.fire(this.getCheckpointUri(updatedItem));
				} else if (isFile(updatedItem)) {
					this._onDidChange.fire(Uri.parse(updatedItem.id));
				}
			}),
		);
	}

	/**
	 * Diff a checkpoint against a document.
	 * @param comparisonDocumentUri The uri to the document to diff against.
	 * @param checkpointId The id of the checkpoint.
	 */
	public showDiffWithDocument(comparisonDocumentUri: Uri, checkpointId: string) {
		console.log(`
            Show diff between document '${
				comparisonDocumentUri.path
			}' and checkpoint with id '${checkpointId}'
        `);

		const checkpoint = this.model.getCheckpoint(checkpointId);

		if (!checkpoint) {
			console.error(`The checkpoint with id: '${checkpointId}' does not exist`);
			return;
		}
		const checkpointUri = this.getCheckpointUri(checkpoint);
		const comparingDocumentName = path.basename(checkpointUri.toString());
		const diffTitle = `${comparingDocumentName}<->${checkpoint.name}`;
		commands.executeCommand('vscode.diff', comparisonDocumentUri, checkpointUri, diffTitle);
	}

	/**
	 * Diff two checkpoints against eachother.
	 * @param checkpointId1 checkpoint shown to the left
	 * @param checkpointId2 checkpoint shown to the right
	 */
	public showDiffWithCheckpoint(checkpointId1: string, checkpointId2: string): void {
		console.log(`
            Show diff between checkpoint '${
				checkpointId1
			}' and checkpoint '${checkpointId2}'
		`);
		
		const checkpoint1 = this.model.getCheckpoint(checkpointId1);
		const checkpoint2 = this.model.getCheckpoint(checkpointId2);

		if (!checkpoint1) {
			console.error(`The checkpoint with id: '${checkpointId1}' does not exist`);
			return;
		} else if (!checkpoint2) {
			console.error(`The checkpoint with id: '${checkpointId2}' does not exist`);
			return;
		}

		const checkpointUri1 = this.getCheckpointUri(checkpoint1);
		const checkpointUri2 = this.getCheckpointUri(checkpoint2);
		const diffTitle = `${checkpoint1.name}<->${checkpoint2.name}`;
		commands.executeCommand('vscode.diff', checkpointUri1, checkpointUri2, diffTitle);
	}	

	/**
	 * Preview the checkpoint in a readonly document.
	 * @param checkpointId The id of the checkpoint
	 */
	public showPreview(checkpointId: string) {
		console.log(`Show preview of checkpoint with id '${checkpointId}'`);

		const checkpoint = this.model.getCheckpoint(checkpointId);
		if (!checkpoint) {
			console.error(`The checkpoint with id: '${checkpointId}' does not exist`);
			return;
		}

		const checkpointUri = this.getCheckpointUri(checkpoint);
		window.showTextDocument(checkpointUri);
	}

	/**
	 * Provide textual content for a given uri.
	 * The editor will use the returned string-content to create a
	 * readonly document. Resources allocated should be released
	 * when the corresponding document has been closed.
	 */
	public provideTextDocumentContent(uri: Uri): string {
		let checkpointId = uri.fragment;
		let checkpoint = this.model.getCheckpoint(checkpointId);
		// Checkpoint was removed
		if (checkpoint) {
			return checkpoint.text;
		} else {
			console.warn("Checkpoint you are currently viewing has been removed.")
		}
	}

	/**
	 * Get the uri for the (fake) document.
	 * @param checkpoint The checkpoint
	 */
	private getCheckpointUri(checkpoint: ICheckpoint): Uri {
		const filePath = Uri.parse(checkpoint.parent);

		// Set the checkpoint id to be the 'fragment' of the uri.
		// The uri's 'path' part needs to be a file (fake or not) that has the
		// right file extension for syntax highlighting to work. We use the parent
		// files path
		return Uri.parse(`checkpointsDocumentView://checkpoint/${filePath.path}#${checkpoint.id}`);
	}
}
