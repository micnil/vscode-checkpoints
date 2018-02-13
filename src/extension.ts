'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { CheckpointsModel } from './CheckpointsModel';
import { CheckpointsProvider } from './CheckpointsProvider';

// this method is called when the extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    let activeEditor = vscode.window.activeTextEditor;
    let checkpointsModel: CheckpointsModel = new CheckpointsModel(context);
    let checkpointsProvider: CheckpointsProvider = new CheckpointsProvider(checkpointsModel, context);
    
    if (!activeEditor) {
        return;
    }
    
    // initial selection of slot context.
    checkpointsModel.checkpointContext = activeEditor.document.fileName;

    vscode.window.onDidChangeActiveTextEditor(editor => {
        activeEditor = editor;
        checkpointsModel.checkpointContext = activeEditor.document.fileName;
    }, null, context.subscriptions);
    
    vscode.window.registerTreeDataProvider('checkpointsExplorer', checkpointsProvider);

    // Register commands
    let disposableAddCheckpointCommand = vscode.commands.registerCommand('checkpoints.addCheckpoint', () => {
        checkpointsModel.add(activeEditor.document);
    });

    let disposableRefreshCommand = vscode.commands.registerCommand("checkpoints.refresh", node => {
        checkpointsProvider.refresh();
    });

    let disposableDeleteCheckpointCommand = vscode.commands.registerCommand("checkpoints.deleteCheckpoint", checkpointNode => {
        checkpointsModel.remove(checkpointNode.filePath, checkpointNode.checkpointId);
    });

    let disposableClearFileCommand = vscode.commands.registerCommand("checkpoints.clearFile", checkpointNode => {
        checkpointsModel.remove(checkpointNode.filePath);
    });

    let disposableClearAllCommand = vscode.commands.registerCommand("checkpoints.clearAll", node => {
        checkpointsModel.clearAll();
    });

    let disposableRestoreCheckpointCommand = vscode.commands.registerCommand('checkpoints.restoreCheckpoint', checkpointNode => {
        console.log(`Restoring checkpoint: '${checkpointNode.checkpointId}', from file: '${checkpointNode.parent}'`);

        // Currently, you can only restore checkpoints if it comes from the currently active document. 
        if (checkpointNode.filePath !== checkpointsModel.checkpointContext) {
            console.error(`Failed to restore checkpoint to file '${checkpointsModel.checkpointContext}'.`)
            return;
        }

        activeEditor.edit( editorBuilder => {
            
            // Create a range spanning the entire content of the file
            let lastLine = activeEditor.document.lineAt(activeEditor.document.lineCount - 1);
            let documentRange = new vscode.Range(new vscode.Position(0, 0), lastLine.rangeIncludingLineBreak.end);

            // Replace the content of the document with the text of the checkpoint.
            editorBuilder.replace(documentRange, checkpointsModel.getCheckpoint(checkpointNode.filePath, checkpointNode.checkpointId).text);
        })
    });

    let disposableOpenFileCommand = vscode.commands.registerCommand("checkpoints.openFile", checkpointNode => {
        console.log(`Opening file: '${checkpointNode.filePath}'`);

        vscode.workspace.openTextDocument(checkpointNode.filePath)
            .then( 
                // On success:
                textDocument => {
                    vscode.window.showTextDocument(textDocument, {
                            preserveFocus: false,
                            preview: true,
                        }
                    );
                }, 
                // on failure:
                error => {
                    vscode.window.showErrorMessage(`Cannot open file ${checkpointNode.filePath}.`);
                    console.error(error.message);
                }
            )
    });

    let disposableRenameCheckpointCommand = vscode.commands.registerCommand("checkpoints.renameCheckpoint", checkpointNode => {
        console.log(`Rename checkpoint command invoked on checkpoint: '${checkpointNode.label}'`);

        vscode.window.showInputBox(
            { 
                ignoreFocusOut: true, 
                prompt: "Type in a new name for the checkpoint.",
                value: checkpointNode.label,
                valueSelection: undefined
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

                checkpointsModel.renameCheckpoint(checkpointNode.filePath, checkpointNode.checkpointId, result);
            })

    });
    
    context.subscriptions.push(
        disposableAddCheckpointCommand,
        disposableRefreshCommand,
        disposableDeleteCheckpointCommand,
        disposableClearFileCommand,
        disposableClearAllCommand,
        disposableRestoreCheckpointCommand,
        disposableOpenFileCommand,
        disposableRenameCheckpointCommand
    );
}

// this method is called when your extension is deactivated
export function deactivate() {
}