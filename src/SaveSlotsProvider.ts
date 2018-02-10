import * as vscode from "vscode";
import { SaveSlots } from "./SaveSlots";
import { Uri } from "vscode";
import * as path from 'path';

enum SaveSlotNodeType {
    File,
    SaveState 
}

export class SaveSlotsProvider implements vscode.TreeDataProvider<SaveSlotNode> {

    private _onDidChangeTreeData: vscode.EventEmitter<SaveSlotNode | undefined> = new vscode.EventEmitter<SaveSlotNode | undefined>();
    readonly onDidChangeTreeData: vscode.Event<SaveSlotNode | undefined> = this._onDidChangeTreeData.event;

    private saveStates: SaveSlotNode[] = [];

    constructor (private saveSlots: SaveSlots, private context: vscode.ExtensionContext) {

        //register to the models events.
        saveSlots.onDidChangeSlotContext( filename => {
            this._onDidChangeTreeData.fire();
        });

        saveSlots.onDidAddSaveSlot( saveState => {
            this._onDidChangeTreeData.fire();
        })
    }

    /**
     * Converts a save slot node to a tree view item. Will be called for each
     * node before render, and every time they are updated.
     * @param element 
     */
    getTreeItem(element: SaveSlotNode): vscode.TreeItem | Thenable<vscode.TreeItem> {

        if(element.type === SaveSlotNodeType.File) {

            // element.name is the absolute file path on disk,
            // we only want the path relative the workspace root we are in 

            // First create an uri object of the file path
            let fileUri = vscode.Uri.file(element.name);

            // Get the workspace folder object that contains this file.
            let workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);

            // Get the relative path from workspace root to the file. 
            let relativeFilePath = path.relative(workspaceFolder.uri.fsPath, element.name);

            // Add the folder name to the path aswell, so we know which workspace the file belongs to.
            let label = path.join(workspaceFolder.name, relativeFilePath)

            // Control the collapsed state of the file. We want it to expand when the file is selected
            // and collapse when it is not selected.
            let collapsibleState = this.saveSlots.slotContext === element.name ? 
                vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed; 

            // Create the tree item.
            let fileItem = new vscode.TreeItem(label, collapsibleState);
            fileItem.contextValue = "file";

            // Let the current file be marked with an icon.
            if (this.saveSlots.slotContext === element.name) {
                fileItem.iconPath = {
                    light: this.context.asAbsolutePath("resources/light/document-selected.svg"),
                    dark: this.context.asAbsolutePath("resources/dark/document-selected.svg")
                }
            } else {
                fileItem.iconPath = {
                    light: this.context.asAbsolutePath("resources/light/document.svg"),
                    dark: this.context.asAbsolutePath("resources/dark/document.svg")
                };
            }

            // The id is used to maintain the selection and collapsible state of nodes
            // in the tree view. By default, the label is used to create an unique id,
            // But since we want to modify the collapsed state on each update (without 
            // modifying the label), we generate a new id for the node. 
            // To keep the dependencies of the extension to a minimum this little random 
            // id generator is used. The entropy is not that important, worst case 
            // scenario is that the node doesn't collapse/expand when it is supposed to.
            fileItem.id = String(Math.floor(Math.random() * 9e15));

            return fileItem;
        }

        return {
            label: element.name,
            collapsibleState: vscode.TreeItemCollapsibleState.None,
            contextValue: "saveState"
        };
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
                return new SaveSlotNode(file, SaveSlotNodeType.File);
            })
        }

        // if this element is a save state, it has no children
        if (element.type === SaveSlotNodeType.SaveState) {
            return []
        }

        // This element must be a file, get all save states for the file.
        let saveStates = this.saveSlots.getSaveStates(element.name);
        return saveStates.map( saveState => {
            return new SaveSlotNode(saveState.name, SaveSlotNodeType.SaveState);
        });
    }
}

/** 
 * One node in the tree view. Can either represent a file (collapsible root)
 * or a save state.
*/
class SaveSlotNode {

    constructor(
        public readonly name: string,
        public readonly type: SaveSlotNodeType,
    ) {}

}