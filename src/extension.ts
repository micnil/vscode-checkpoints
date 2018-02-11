'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { SaveSlots } from './SaveSlots';
import { SaveSlotsProvider } from './SaveSlotsProvider';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    let activeEditor = vscode.window.activeTextEditor;
    let saveSlots: SaveSlots = new SaveSlots(context);
    let saveSlotsProvider: SaveSlotsProvider = new SaveSlotsProvider(saveSlots, context);
    
    if (!activeEditor) {
        return;
    }
    
    // initial selection of slot context.
    saveSlots.slotContext = activeEditor.document.fileName;

    vscode.window.onDidChangeActiveTextEditor(editor => {
        activeEditor = editor;
        saveSlots.slotContext = activeEditor.document.fileName;
    }, null, context.subscriptions);
    
    vscode.window.registerTreeDataProvider('saveSlotsExplorer', saveSlotsProvider);

    // Register commands
    let disposableQuickSaveCommand = vscode.commands.registerCommand('saveSlots.quickSave', () => {
        saveSlots.add(activeEditor.document);
    });

    let disposableRefreshCommand = vscode.commands.registerCommand("saveSlots.refresh", node => {
        saveSlotsProvider.refresh();
    });

    let disposableDeleteSaveStateCommand = vscode.commands.registerCommand("saveSlots.deleteSaveState", saveSlotNode => {
        saveSlots.remove(saveSlotNode.filePath, saveSlotNode.saveStateId);
    });

    let disposableClearFileCommand = vscode.commands.registerCommand("saveSlots.clearFromFile", saveSlotNode => {
        saveSlots.remove(saveSlotNode.filePath);
    });

    let disposableRestoreSaveStateCommand = vscode.commands.registerCommand('saveSlots.restoreSaveState', saveSlotNode => {
        activeEditor.edit( editorBuilder => {

            // Create a range spanning the entire content of the file
            let lastLine = activeEditor.document.lineAt(activeEditor.document.lineCount - 1);
            let documentRange = new vscode.Range(new vscode.Position(0, 0), lastLine.rangeIncludingLineBreak.end);

            // Replace the content with the textx of the save slot.
            editorBuilder.replace(documentRange, saveSlots.getSaveState(saveSlotNode.filePath, saveSlotNode.saveStateId).text);
        })
    });
    
    context.subscriptions.push(
        disposableQuickSaveCommand,
        disposableRefreshCommand,
        disposableDeleteSaveStateCommand,
        disposableClearFileCommand,
        disposableRestoreSaveStateCommand
    );
}

// this method is called when your extension is deactivated
export function deactivate() {
}