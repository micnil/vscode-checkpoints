import * as vscode from "vscode";
import { SaveSlots } from "./SaveSlots";

enum SaveSlotNodeType {
    File,
    SaveState 
}

export class SaveSlotsProvider implements vscode.TreeDataProvider<SaveSlotNode> {

    private _onDidChangeTreeData: vscode.EventEmitter<SaveSlotNode | undefined> = new vscode.EventEmitter<SaveSlotNode | undefined>();
    readonly onDidChangeTreeData: vscode.Event<SaveSlotNode | undefined> = this._onDidChangeTreeData.event;

    private saveStates: SaveSlotNode[] = [];

    constructor (private saveSlots: SaveSlots) {

        //register to the models events.
        saveSlots.onDidChangeSlotContext( saveStates => {
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
            return {
                label: element.name,
                collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
                contextValue: "file"
            }
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
            let savedFiles: string[] = this.saveSlots.getFiles();
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