import { TextDocument, EventEmitter, Event } from 'vscode';

/** 
 * Maps all files to an array of save states 
*/
export class SaveSlots {

    // Events
    private onDidAddSaveSlotEmitter = new EventEmitter<SaveState>();
    get onDidAddSaveSlot(): Event<SaveState> { return this.onDidAddSaveSlotEmitter.event; }

    private onDidChangeSlotContextEmitter = new EventEmitter<Array<SaveState>>();
    get onDidChangeSlotContext(): Event<Array<SaveState>> { return this.onDidChangeSlotContextEmitter.event; }

    // Fields
    private saveSlots: Map<string, Array<SaveState>>;
    private currentSlotContext: string;

    constructor() {
        // Initialize the save slots map.
        this.saveSlots = new Map<string, Array<SaveState>>();
    }

    /**
     * Adds the current state of the document to a save slot.
     * @param document The document to save
     */
    add(document: TextDocument) {
        // create the 
        let saveSlot = new SaveState(document.getText(), document.version);

        // Add the save slot
        this.saveSlots.get(document.fileName).push(saveSlot);

        // trigger the event
        this.onDidAddSaveSlotEmitter.fire(saveSlot);
    }

    /**
     * Sets a new slot context for you want the tree view to operate on.
     * @param fileName The full path file
     */
    setSlotContext(fileName: string) {

        // If there is no entry for this document, then create one
        if (!this.saveSlots.has(fileName)) {
            this.saveSlots.set(fileName, []);
        }

        // Save the key to the current save slot
        this.currentSlotContext = fileName;

        // Fire the event and pass the new slot context.
        this.onDidChangeSlotContextEmitter.fire(this.saveSlots.get(fileName));
    }

    /**
     * Gets all save states for a specific file.
     * @param fileName the file to get the save slot context from
     */
    getSaveStates(fileName?: string) {

        if(!fileName){
            fileName = this.currentSlotContext;
        }

        return this.saveSlots.get(fileName);
    }

    /** 
     * Get all keys (files) from the save slot map
    */
    getFiles(){
        return [...this.saveSlots.keys()]
    }
}


class SaveState {

    /**
     * The text content of the file
     */
    private text: string;

    /**
     * The file version
     */
    private version: number;

    constructor(text: string, version: number) {
        this.text = text;
        this.version = version;
    }

    get name(){
        return this.version.toString();
    }
}