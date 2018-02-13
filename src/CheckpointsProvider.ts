'use strict';

import * as vscode from "vscode";
import { CheckpointsModel } from "./CheckpointsModel";
import { Uri } from "vscode";
import * as path from 'path';

export class CheckpointsProvider implements vscode.TreeDataProvider<CheckpointNode> {

    private _onDidChangeTreeData: vscode.EventEmitter<CheckpointNode | undefined> = new vscode.EventEmitter<CheckpointNode | undefined>();
    readonly onDidChangeTreeData: vscode.Event<CheckpointNode | undefined> = this._onDidChangeTreeData.event;

    private readonly maxLengthLabel = 35;

    constructor (private model: CheckpointsModel, private context: vscode.ExtensionContext) {

        // register to the models events.
        // TODO: Improve performance by only updating the affected file nodes.
        model.onDidChangeCheckpointContext( filename => {
            this._onDidChangeTreeData.fire();
        });

        model.onDidAddCheckpoint( checkpoint => {
            this._onDidChangeTreeData.fire();
        })

        model.onDidRemoveCheckpoint( checkpoint => {
            this._onDidChangeTreeData.fire();
        })

        model.onDidUpdateCheckpoint( checkpoint => {
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
     * Assigns the TreeItem specific fields in the checkpoint node elements. 
     * Will be called for each node before render, and every time they are updated.
     * @param element 
     */
    getTreeItem(element: CheckpointNode): vscode.TreeItem | Thenable<vscode.TreeItem> {

        // File nodes
        if(!element.checkpointId) {

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
            // Truncate the label if it is too long
            if (element.label.length > this.maxLengthLabel) {
                element.label = '...' + element.label.substr(
                    element.label.length - this.maxLengthLabel, 
                    element.label.length - 1
                );
            }

            // Control the collapsed state of the file. We want it to expand when the file is selected
            // and collapse when it is not selected.
            element.collapsibleState = this.model.checkpointContext === element.filePath ? 
                vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed; 

            // Set the file icon
            if (this.model.checkpointContext === element.filePath) {
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

            element.command = {
                command: "checkpoints.openFile",
                arguments: [element],
                title: "Open File",
            };

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
            
        // checkpoint nodes
        element.collapsibleState = vscode.TreeItemCollapsibleState.None;
        element.contextValue = "checkpoint";
        element.label = this.model.getCheckpoint(element.filePath, element.checkpointId).name;
        return element;
    }

    /**
     * This function will be used to recursively get all items in the tree.
     * First time it is called with a null argument that indicates to get 
     * the top level nodes.
     * @param element The element to get the children from.
     */
    getChildren(element?: CheckpointNode): vscode.ProviderResult<CheckpointNode[]> {

        // If this is the root, get all files that have been saved
        if (!element) {
            let savedFiles: string[] = this.model.files;
            return savedFiles.map( file => {
                return new CheckpointNode(file);
            })
        }

        // This element must be a file, get all checkpoints for the file.
        if (!element.checkpointId) {
            let checkpoints = this.model.getCheckpoints(element.filePath);
            return checkpoints.map( checkpoint => {
                return new CheckpointNode(element.filePath, checkpoint.id);
            });
        }
        
        // if this element is a checkpoint, it has no children
        return [];
    }
}

/** 
 * One node in the tree view. Can either represent a file (collapsible root)
 * or a checkpoint.
*/
class CheckpointNode extends vscode.TreeItem {

    // TreeItem fields:
    label: string;
    iconPath?: string | vscode.Uri | { light: string | vscode.Uri; dark: string | vscode.Uri; };
    command?: vscode.Command;
    collapsibleState?: vscode.TreeItemCollapsibleState;
    contextValue?: string;
    id?: string;

    // Custom fields:
    filePath: string;
    checkpointId?: string;

    constructor(
        filePath: string,
        checkpointId?: string
    ) {
        // Will assign TreeItem fields later.
        super("");

        this.filePath = filePath;
        this.checkpointId = checkpointId;
    }

}