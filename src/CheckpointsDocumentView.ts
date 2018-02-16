import { TextDocumentContentProvider, ExtensionContext, Uri, Event, EventEmitter, commands } from 'vscode';
import { CheckpointsModel, ICheckpoint } from './CheckpointsModel';
import * as path from 'path';

export class CheckpointsDocumentView implements TextDocumentContentProvider {
	private _onDidChange: EventEmitter<Uri> = new EventEmitter<Uri>();
	readonly onDidChange: Event<Uri> = this._onDidChange.event;

	readonly context: ExtensionContext;
	constructor(context: ExtensionContext, private model: CheckpointsModel) {
        this.context = context;

        context.subscriptions.push(
            model.onDidRemoveCheckpoint( (checkpoint: ICheckpoint) => {
                this._onDidChange.fire(this.getCheckpointUri(checkpoint));
            })
        );
        
        context.subscriptions.push(
            model.onDidUpdateCheckpoint( checkpoint => {
                this._onDidChange.fire(this.getCheckpointUri(checkpoint));
            })
        );
    }

	/**
	 * Diff a checkpoint against a document.
	 * @param comparisonDocumentUri The uri to the document to diff against.
	 * @param checkpointId The id of the checkpoint.
	 */
	public showDiff(comparisonDocumentUri: Uri, checkpointId: string) {
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
        const comparingDocumentName = path.basename(checkpointUri.fsPath);
        const diffTitle = `${comparingDocumentName}<->${checkpoint.name}`;
        commands.executeCommand('vscode.diff', comparisonDocumentUri, checkpointUri, diffTitle);
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
		return checkpoint.text;
    }

    /**
     * Get the uri for the (fake) document. 
     * @param checkpoint The checkpoint
     */
    private getCheckpointUri(checkpoint: ICheckpoint): Uri {
        const filePath = Uri.file(checkpoint.parent);

        // Set the checkpoint id to be the 'fragment' of the uri.
        // The uri's 'path' part needs to be a file (fake or not) that has the
        // right file extension for syntax highlighting to work. We use the parent
        // files path
        return Uri.parse(`checkpointsDocumentView://checkpoint/${filePath.path}#${checkpoint.id}`);
    }
}
