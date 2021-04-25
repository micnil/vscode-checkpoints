'use strict';
import { ExtensionContext, commands, workspace, TextDocument, WorkspaceEdit } from 'vscode';
import { CheckpointsModel } from './CheckpointsModel';
import { CheckpointsTreeView } from './CheckpointsTreeView';
import { CheckpointsController } from './CheckpointsController';
import { CheckpointsDocumentView } from './CheckpointsDocumentView';

// this method is called when the extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {

    // Initialize views, models and controllers.
	let checkpointsModel: CheckpointsModel = new CheckpointsModel(context);
	let checkpointsTreeView: CheckpointsTreeView = new CheckpointsTreeView(
        context,
		checkpointsModel
	);
	let checkpointsDocumentView: CheckpointsDocumentView = new CheckpointsDocumentView(
        context, 
        checkpointsModel
    );
	let checkpointsController: CheckpointsController = new CheckpointsController(
		context,
		checkpointsModel,
		checkpointsTreeView,
		checkpointsDocumentView,
    );

    workspace.onDidSaveTextDocument((document: TextDocument) => {
        const config = workspace.getConfiguration('checkpoints');        
		const addCheckpointOnSave: boolean = config.get('addCheckpointOnSave');
        if (addCheckpointOnSave === true) {
            commands.executeCommand("checkpoints.addCheckpoint").then((edit: WorkspaceEdit) => {
                if (!edit) throw Error;
                return workspace.applyEdit(edit);
            }) .then(undefined, err => {
               console.error('Failed to add checkpoint on document save', err);
            });
        }
	});
    
    checkpointsController.initialize();
}

// this method is called when your extension is deactivated
export function deactivate() {}
