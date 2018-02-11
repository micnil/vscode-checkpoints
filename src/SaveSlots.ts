import { TextDocument, EventEmitter, Event, ExtensionContext } from 'vscode';
import * as path from 'path';

/**
 * Maps all files to an array of save states
 */
export class SaveSlots {

	// Events
	private onDidAddSaveStateEmitter = new EventEmitter<SaveState>();
	get onDidAddSaveState(): Event<SaveState> {
		return this.onDidAddSaveStateEmitter.event;
	}

	private onDidRemoveSaveStateEmitter = new EventEmitter<SaveState[]>();
	get onDidRemoveSaveState(): Event<SaveState[]> {
		return this.onDidRemoveSaveStateEmitter.event;
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
	 * Get all keys (files) from the save slot map
	 */
	get files(): string[] {
		return [...this.saveSlots.keys()];
	}

	/**
	 * Adds the current state of the document to a save slot.
	 * @param document The document to save
	 */
	add(document: TextDocument): void {

		// create the save state
		let saveSlot = new SaveState(document.fileName, document.getText());

		// If there is no entry for this document, then create one
		if (!this.saveSlots.has(document.fileName)) {
			this.saveSlots.set(document.fileName, []);
		}

		// Add the save slot
		this.saveSlots.get(document.fileName).push(saveSlot);

		// trigger the event
		this.onDidAddSaveStateEmitter.fire(saveSlot);
	}

	/**
	 * Deletes all or a specific saved state from a file
	 * @param file The file name (absolute path)
	 * @param id optional id of the saved state to remove
	 */
	remove(file: string, id?: string): void {
		let removedSaveStates;
		if (!id) {
			removedSaveStates = this.clearFromFile(file);
		} else {
			removedSaveStates = this.deleteSaveState(file, id);
		}

		if(removedSaveStates) {
			this.onDidRemoveSaveStateEmitter.fire(removedSaveStates);
		}		
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
	 * Delete a save state from the slot context
	 * @param fileName absolute path to the file
	 * @param id The id of the save state
	 */
	getSaveState(fileName: string, id: string): SaveState {
		console.log(`Getting save state with fileName: '${fileName}' and id: '${id}'`);

		if(!this.saveSlots.has(fileName)){
			console.error(`The file: '${fileName}' does not exist`);
			// Throw error?
			return null;
		}

		let saveStates = this.getSaveStates(fileName);
		let saveState = saveStates.find( saveState => saveState.id === id);

		if (!saveState) {
			console.error(`No save state with id: '${id}' in file: '${fileName}'`);
			// Throw error?
			return null
		}

		return saveState;
	}

	/**
	 * Deletes a save state from the model.
	 * @param file The file name (absolute path)
	 * @param id The id of the save state
	 */
	private deleteSaveState(fileName: string, id: string) : SaveState[] {
		console.log(`deleting save state with fileName: '${fileName}' and id: '${id}'`);

		if(!this.saveSlots.has(fileName)){
			console.error(`The file: '${fileName}' does not exist`);
			// Throw error?
			return;
		}

		let saveStates = this.getSaveStates(fileName);
		let saveStateIndex = saveStates.findIndex( saveState => saveState.id === id);

		if (saveStateIndex === -1) {
			console.error(`No save state with id: '${id}' in file: '${fileName}'`);
			// Throw error?
			return;
		}

		return saveStates.splice(saveStateIndex, 1);
	}

	/**
	 * 	
	 * @param file The file name (absolute path)
	 */
	private clearFromFile(file: string) : SaveState[] {
		console.log(`clearing save states from file: '${file}'`);

		if(!this.saveSlots.has(file)){
			console.error(`The file: '${file}' does not exist`);
			// Throw error?
			return;
		}

		let saveStates = this.getSaveStates(file);
		
		if (this.saveSlots.delete(file)) {
			// delete successfull
			return saveStates;
		}

		// delete unsuccessfull
		return null;
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
	private readonly timeStamp: number;

	constructor(parent: string, text: string) {
		this.parent = parent;
		this.text = text;
		this.timeStamp = Date.now();
	}

	get name(): string {
		return new Date(this.timeStamp).toLocaleString();
	}

	get id(): string {
		return this.timeStamp.toString();
	}
}
