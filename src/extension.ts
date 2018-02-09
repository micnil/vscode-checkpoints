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
    let saveSlots: SaveSlots = new SaveSlots();
    let saveSlotsProvider: SaveSlotsProvider = new SaveSlotsProvider(saveSlots);
    
    if(!activeEditor){
        return;
    }
    
    saveSlots.setSlotContext(activeEditor.document.fileName);
    
    vscode.window.onDidChangeActiveTextEditor(editor => {
        activeEditor = editor;
        saveSlots.setSlotContext(activeEditor.document.fileName);
    }, null, context.subscriptions);
    
    vscode.window.registerTreeDataProvider('saveSlots', saveSlotsProvider);

    // Register commands
    let disposableQuickSave = vscode.commands.registerCommand('saveSlots.quickSave', () => {
        saveSlots.add(activeEditor.document);
        vscode.window.showInformationMessage('Quick save successfull.');
    });

    let disposableLoadSlot = vscode.commands.registerCommand('saveSlots.loadSlot', () => {
        vscode.window.showInformationMessage('Load file successfull.');
    });
    
    context.subscriptions.push(disposableQuickSave, disposableLoadSlot);
}

// this method is called when your extension is deactivated
export function deactivate() {
}