'use strict';

import * as vscode from "vscode";
import { CheckpointsModel } from "./CheckpointsModel";

export class CheckpointsTreeView implements vscode.TreeDataProvider<CheckpointNode> {

    private _onDidChangeTreeData: vscode.EventEmitter<CheckpointNode | undefined> = new vscode.EventEmitter<CheckpointNode | undefined>();
    readonly onDidChangeTreeData: vscode.Event<CheckpointNode | undefined> = this._onDidChangeTreeData.event;

    constructor (private context: vscode.ExtensionContext, private model: CheckpointsModel) {

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

        // No parent => File nodes
        if(!element.parentId) {

            // Get the file from the model.
            let file = this.model.getFile(element.nodeId);

            // Control the collapsed state of the file. We want it to expand when the file is selected
            // and collapse when it is not selected.
            element.collapsibleState = this.model.checkpointContext === file.id ? 
                vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed; 

            // Set the file icon
            if (this.model.checkpointContext === file.id) {
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
            
            element.command = {
                command: "checkpoints.openFile",
                arguments: [element],
                title: "Open File",
            };

            element.label = file.name;
            element.contextValue = "file";
            
            // The id field of tree items is used to maintain the selection and collapsible state 
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
        let checkpoint = this.model.getCheckpoint(element.nodeId);
        element.collapsibleState = vscode.TreeItemCollapsibleState.None;
        element.contextValue = "checkpoint";
        element.label = checkpoint.name;
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
            return savedFiles.map( fileId => {
                return new CheckpointNode(fileId);
            })
        }

        // This element has no parent, it must be a file, 
        // get all checkpoints for the file.
        if (!element.parentId) {
            let checkpoints = this.model.getCheckpoints(element.nodeId);
            return checkpoints.map( checkpoint => {
                return new CheckpointNode(checkpoint.id, checkpoint.parent);
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
    nodeId: string;
    parentId?: string;

    constructor(
        nodeId: string,
        parentId?: string
    ) {
        // Will assign TreeItem fields later.
        super("");

        this.nodeId = nodeId;
        this.parentId = parentId;
    }

}