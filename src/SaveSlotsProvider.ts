'use strict';

import * as vscode from "vscode";
import { SaveSlots } from "./SaveSlots";
import { Uri } from "vscode";
import * as path from 'path';

export class SaveSlotsProvider implements vscode.TreeDataProvider<SaveSlotNode> {

    private _onDidChangeTreeData: vscode.EventEmitter<SaveSlotNode | undefined> = new vscode.EventEmitter<SaveSlotNode | undefined>();
    readonly onDidChangeTreeData: vscode.Event<SaveSlotNode | undefined> = this._onDidChangeTreeData.event;

    constructor (private saveSlots: SaveSlots, private context: vscode.ExtensionContext) {

        // register to the models events.
        // TODO: Improve performance by only updating the affected file nodes.
        saveSlots.onDidChangeSlotContext( filename => {
            this._onDidChangeTreeData.fire();
        });

        saveSlots.onDidAddSaveState( saveState => {
            this._onDidChangeTreeData.fire();
        })

        saveSlots.onDidRemoveSaveState( saveStates => {
            this._onDidChangeTreeData.fire();
        })
    }

    /** 
     * Refresh the entire tree view.
    */
    public refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    /**
     * Assigns the TreeItem specific fields in the save slot node elements. 
     * Will be called for each node before render, and every time they are updated.
     * @param element 
     */
    getTreeItem(element: SaveSlotNode): vscode.TreeItem | Thenable<vscode.TreeItem> {

        // File nodes
        if(!element.saveStateId) {

            // element.filePath is the absolute file path on disk,
            // we want the path relative the workspace root we are in as label

            // First create an uri object of the file path
            let fileUri = vscode.Uri.file(element.filePath);
            // Get the workspace folder object that contains this file.
            let workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);
            // Get the relative path from workspace root to the file. 
            let relativeFilePath = path.relative(workspaceFolder.uri.fsPath, element.filePath);
            // Add the folder name to the path aswell, so we know which workspace the file belongs to.
            element.label = path.join(workspaceFolder.name, relativeFilePath);

            // Control the collapsed state of the file. We want it to expand when the file is selected
            // and collapse when it is not selected.
            element.collapsibleState = this.saveSlots.slotContext === element.filePath ? 
                vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed; 

            // Set the file icon
            if (this.saveSlots.slotContext === element.filePath) {
                element.iconPath = {
                    light: this.context.asAbsolutePath("resources/light/document-selected.svg"),
                    dark: this.context.asAbsolutePath("resources/dark/document-selected.svg")
                }
            } else {
                element.iconPath = {
                    light: this.context.asAbsolutePath("resources/light/document.svg"),
                    dark: this.context.asAbsolutePath("resources/dark/document.svg")
                };
            }

            element.contextValue = "file";

            // The id of tree items is used to maintain the selection and collapsible state 
            // of nodes in the tree view. By default, the label is used to create an unique id,
            // But since we want to modify the collapsed state on each update (without 
            // modifying the label), we generate a new id for the node. 
            // To keep the dependencies of the extension to a minimum this little random 
            // id generator is used. The entropy is not that important, worst case 
            // scenario is that the node doesn't collapse/expand when it is supposed to.
            element.id = String(Math.floor(Math.random() * 9e15));
            return element;
        }
            
        // Save state nodes
        element.collapsibleState = vscode.TreeItemCollapsibleState.None;
        element.contextValue = "saveState";
        element.label = this.saveSlots.getSaveState(element.filePath, element.saveStateId).name;
        return element;
    }

    /**
     * This function will be used to recursively get all items in the tree.
     * First time it is called with a null argument that indicates to get 
     * the top level nodes.
     * @param element The element to get the children from.
     */
    getChildren(element?: SaveSlotNode): vscode.ProviderResult<SaveSlotNode[]> {

        // If this is the root, get all files that have been saved
        if (!element) {
            let savedFiles: string[] = this.saveSlots.files;
            return savedFiles.map( file => {
                return new SaveSlotNode(file);
            })
        }

        // This element must be a file, get all save states for the file.
        if (!element.saveStateId) {
            let saveStates = this.saveSlots.getSaveStates(element.filePath);
            return saveStates.map( saveState => {
                return new SaveSlotNode(element.filePath, saveState.id);
            });
        }
        
        // if this element is a save state, it has no children
        return [];
    }
}

/** 
 * One node in the tree view. Can either represent a file (collapsible root)
 * or a save state.
*/
class SaveSlotNode extends vscode.TreeItem {

    // TreeItem fields:
    label: string;
    iconPath?: string | vscode.Uri | { light: string | vscode.Uri; dark: string | vscode.Uri; };
    command?: vscode.Command;
    collapsibleState?: vscode.TreeItemCollapsibleState;
    contextValue?: string;
    id?: string;

    // Custom fields:
    filePath: string;
    saveStateId?: string;

    constructor(
        filePath: string,
        saveStateId?: string
    ) {
        // Will assign TreeItem fields later.
        super("");

        this.filePath = filePath;
        this.saveStateId = saveStateId;
    }

}