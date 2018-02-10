import { TextDocument, EventEmitter, Event, ExtensionContext } from 'vscode';
import * as path from 'path';
/**
 * Maps all files to an array of save states
 */
export class SaveSlots {
	// Events
	private onDidAddSaveSlotEmitter = new EventEmitter<SaveState>();
	get onDidAddSaveSlot(): Event<SaveState> {
		return this.onDidAddSaveSlotEmitter.event;
	}

	private onDidChangeSlotContextEmitter = new EventEmitter<string>();
	get onDidChangeSlotContext(): Event<string> {
		return this.onDidChangeSlotContextEmitter.event;
	}

	// Fields
	private saveSlots: Map<string, Array<SaveState>>;
    private currentSlotContext: string;
    private context: ExtensionContext;

	constructor(context: ExtensionContext) {
		// Initialize the save slots map.
        this.saveSlots = new Map<string, Array<SaveState>>();
        
        this.context = context;
	}

	/**
	 * Adds the current state of the document to a save slot.
	 * @param document The document to save
	 */
	add(document: TextDocument) {
        // Get the relative file path from the extension root.
        //let fileName = path.relative(, document.fileName)

		// create the save state
		let saveSlot = new SaveState(document.fileName, document.getText(), document.version);

		// If there is no entry for this document, then create one
		if (!this.saveSlots.has(document.fileName)) {
			this.saveSlots.set(document.fileName, []);
		}

		// Add the save slot
		this.saveSlots.get(document.fileName).push(saveSlot);

		// trigger the event
		this.onDidAddSaveSlotEmitter.fire(saveSlot);
	}

	/**
	 * Sets a new slot context for you want the tree view to operate on.
	 * @param fileName The full path file
	 */
	set slotContext(fileName: string) {

		// Save the key to the current save slot
		this.currentSlotContext = fileName;

		// Fire the event
        this.onDidChangeSlotContextEmitter.fire(this.currentSlotContext);
	}

	/**
	 * gets the slot context the tree view should operate on (current open file)
	 */
	get slotContext(): string {
		return this.currentSlotContext;
	}

	/**
	 * Gets all save states for a specific file.
	 * @param fileName the file to get the save slot context from
	 */
	getSaveStates(fileName?: string): Array<SaveState> {
		if (!fileName) {
			fileName = this.currentSlotContext;
		}

		return this.saveSlots.get(fileName);
	}

	/**
	 * Get all keys (files) from the save slot map
	 */
	get files(): string[] {
		return [...this.saveSlots.keys()];
	}
}

/**
 * Represents one saved state.
 */
class SaveState {
	/**
	 * The file this saved state belongs to.
	 */
	private readonly parent: string;

	/**
	 * The text content of the file
	 */
	private readonly text: string;

	/**
	 * The file version
	 */
	private readonly version: number;

	constructor(parent: string, text: string, version: number) {
		this.parent = parent;
		this.text = text;
		this.version = version;
	}

	get name(): string {
		return this.version.toString();
	}
}
