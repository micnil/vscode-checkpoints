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

    let disposableClearFileCommand = vscode.commands.registerCommand("checkpoints.clearFromFile", checkpointNode => {
        checkpointsModel.remove(checkpointNode.filePath);
    });

    let disposableRestoreCheckpointCommand = vscode.commands.registerCommand('checkpoints.restoreCheckpoint', checkpointNode => {
        activeEditor.edit( editorBuilder => {
            
            // Create a range spanning the entire content of the file
            let lastLine = activeEditor.document.lineAt(activeEditor.document.lineCount - 1);
            let documentRange = new vscode.Range(new vscode.Position(0, 0), lastLine.rangeIncludingLineBreak.end);

            // Replace the content of the document with the text of the checkpoint.
            editorBuilder.replace(documentRange, checkpointsModel.getCheckpoint(checkpointNode.filePath, checkpointNode.checkpointId).text);
        })
    });
    
    context.subscriptions.push(
        disposableAddCheckpointCommand,
        disposableRefreshCommand,
        disposableDeleteCheckpointCommand,
        disposableClearFileCommand,
        disposableRestoreCheckpointCommand
    );
}

// this method is called when your extension is deactivated
export function deactivate() {
}