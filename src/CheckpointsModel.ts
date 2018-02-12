'use strict';

import { TextDocument, EventEmitter, Event, ExtensionContext, workspace, window } from 'vscode';
import * as path from 'path';

/**
 * Maps all files to an array of checkpoints
 */
export class CheckpointsModel {

	// Events
	private onDidAddCheckpointEmitter = new EventEmitter<Checkpoint>();
	get onDidAddCheckpoint(): Event<Checkpoint> {
		return this.onDidAddCheckpointEmitter.event;
	}

	private onDidRemoveCheckpointEmitter = new EventEmitter<Checkpoint[]>();
	get onDidRemoveCheckpoint(): Event<Checkpoint[]> {
		return this.onDidRemoveCheckpointEmitter.event;
	}

	private onDidChangeCheckpointContextEmitter = new EventEmitter<string>();
	get onDidChangeCheckpointContext(): Event<string> {
		return this.onDidChangeCheckpointContextEmitter.event;
	}

	// Fields
	private checkpointStore: Map<string, Checkpoint[]>;
    private currentCheckpointContext: string;
	private context: ExtensionContext;

	constructor(context: ExtensionContext) {
		this.context = context;

		// Initialize the checkpoints map from workspace state or empty.
		let workspaceState = this.context.workspaceState.get("checkpointsStore", {});
		this.checkpointStore =  this.deserialize(workspaceState);
	}

	/**
	 * Sets a new checkpoint context you want the tree view to operate on.
	 * @param fileName The full path file
	 */
	set checkpointContext(fileName: string) {

		// Save the key to the current checkpoint
		this.currentCheckpointContext = fileName;

		// Fire the event
        this.onDidChangeCheckpointContextEmitter.fire(this.currentCheckpointContext);
	}

	/**
	 * gets the checkpoint context the tree view should operate on (current open file)
	 */
	get checkpointContext(): string {
		return this.currentCheckpointContext;
	}

	/**
	 * Get all keys (files) from the checkpoint map
	 */
	get files(): string[] {
		return [...this.checkpointStore.keys()];
	}

	/**
	 * Adds the current state of the document to the current checkpoint context.
	 * @param document The document to save
	 */
	add(document: TextDocument): void {

		// create the checkpoint
		let checkpoint = new Checkpoint(document.fileName, document.getText());

		// If there is no entry for this document, then create one
		if (!this.checkpointStore.has(document.fileName)) {
			this.checkpointStore.set(document.fileName, []);
		}

		// Add the checkpoint
		this.checkpointStore.get(document.fileName).push(checkpoint);
		this.onDidAddCheckpointEmitter.fire(checkpoint);

		this.updateWorkspaceState(this.checkpointStore);
	}

	/**
	 * Deletes all or a specific checkpoint from a file
	 * @param file The file name (absolute path)
	 * @param id optional id of the checkpoint to remove
	 */
	remove(file: string, id?: string): void {
		let removedCheckpoints;
		if (!id) {
			removedCheckpoints = this.clearFromFile(file);
		} else {
			removedCheckpoints = this.deleteCheckpoint(file, id);
		}

		if(removedCheckpoints) {
			this.onDidRemoveCheckpointEmitter.fire(removedCheckpoints);
			this.updateWorkspaceState(this.checkpointStore);
		}
	}

	/**
	 * Gets all checkpoints for a specific file.
	 * @param fileName the file to get the checkpoint context from
	 */
	getCheckpoints(fileName?: string): Checkpoint[] {
		if (!fileName) {
			fileName = this.currentCheckpointContext;
		}

		return this.checkpointStore.get(fileName);
	}

	/**
	 * Delete a checkpoint from the checkpoint context
	 * @param fileName absolute path to the file
	 * @param id The id of the checkpoint
	 */
	getCheckpoint(fileName: string, id: string): Checkpoint {
		console.log(`Getting checkpoint with fileName: '${fileName}' and id: '${id}'`);

		if(!this.checkpointStore.has(fileName)){
			console.error(`The file: '${fileName}' does not exist`);
			// Throw error?
			return null;
		}

		let checkpoints = this.getCheckpoints(fileName);
		let checkpoint = checkpoints.find( checkpoint => checkpoint.id === id);

		if (!checkpoint) {
			console.error(`No checkpoint with id: '${id}' in file: '${fileName}'`);
			// Throw error?
			return null
		}

		return checkpoint;
	}

	/**
	 * Deletes a checkpoint from the model.
	 * @param file The file name (absolute path)
	 * @param id The id of the checkpoint
	 */
	private deleteCheckpoint(fileName: string, id: string) : Checkpoint[] {
		console.log(`deleting checkpoint with fileName: '${fileName}' and id: '${id}'`);

		if(!this.checkpointStore.has(fileName)){
			console.error(`The file: '${fileName}' does not exist`);
			// Throw error?
			return;
		}

		let checkpoints = this.getCheckpoints(fileName);
		let checkpointIndex = checkpoints.findIndex( checkpoint => checkpoint.id === id);

		if (checkpointIndex === -1) {
			console.error(`No checkpoint with id: '${id}' in file: '${fileName}'`);
			// Throw error?
			return;
		}

		// Remove the checkpoint.
		let removedCheckpoints = checkpoints.splice(checkpointIndex, 1);
		
		// If the the store is now empty for this file, remove the key aswell.
		if(checkpoints.length === 0) {
			this.checkpointStore.delete(fileName);
		}

		return removedCheckpoints
	}

	/**
	 * 	
	 * @param file The file name (absolute path)
	 */
	private clearFromFile(file: string) : Checkpoint[] {
		console.log(`clearing checkpoints from file: '${file}'`);

		if(!this.checkpointStore.has(file)){
			console.error(`The file: '${file}' does not exist`);
			// Throw error?
			return;
		}

		let checkpoints = this.getCheckpoints(file);
		
		if (this.checkpointStore.delete(file)) {
			// delete successfull
			return checkpoints;
		}

		// delete unsuccessfull
		return null;
	}

	/**
	 * Serialize the checkpoint store to a simple object.
	 * @param checkpointStore The checkpoint store
	 */
	private serialize(checkpointStore: Map<string, Checkpoint[]>): any {

		let stringifyableStore = {};

		for (let [file, checkpoints] of checkpointStore) {
			stringifyableStore[file] = checkpoints.map(checkpoint => checkpoint.serialize());
		}

		return stringifyableStore;
	}

	/**
	 * Deserialized an object representation of the checkpoint store. 
	 * @param obj The object
	 */
	private deserialize(obj: any): Map<string, Checkpoint[]> {
		let checkpointStore = new Map<string, Checkpoint[]>();

		for(let key in obj) {

			// If this is not true, junk has gotten into the workspace state.
			if (!Array.isArray(obj[key])) {
				console.error(`Failed to deserilize key '${key}'. Invalid format`);
				continue
			};

			let checkpoints: Checkpoint[] = obj[key].map(serializedCheckpoint => Checkpoint.deserialize(serializedCheckpoint)); 
			checkpointStore.set(key, checkpoints);
		}
		return checkpointStore;
	}

	/**
	 * Serializes and updates the workspace state with the checkpoint store. 
	 * @param checkpointStore the checkpoint store
	 */
	private updateWorkspaceState(checkpointStore: Map<string, Checkpoint[]>) {
		this.context.workspaceState.update("checkpointsStore", this.serialize(this.checkpointStore))
			.then( success => {
				
				if(!success){
					console.error("The checkpoint failed to save to storage. Will not persist the session!")
					window.showWarningMessage("Failed to save the checkpoint store to workspace storage.");
					return;
				}
			}
		);
	}
}

/**
 * Represents one checkpoint.
 */
class Checkpoint {
	/**
	 * The file this checkpoint belongs to.
	 */
	private readonly parent: string;

	
	/**
	 * The file version
	 */
	private readonly timeStamp: number;
	
	/**
	 * The text content of the file
	 */
	public readonly text: string;

	constructor(parent: string, text: string) {
		this.parent = parent;
		this.text = text;
		this.timeStamp = Date.now();
	}

	/**
	 * The pretty name of the checkpoint.
	 */
	get name(): string {
		return new Date(this.timeStamp).toLocaleString();
	}

	/**
	 * the id of the checkpoint (string timestamp)
	 */
	get id(): string {
		return this.timeStamp.toString();
	}

	/** 
	 * Serializes the checkpoint into a simple object.
	*/
	public serialize(): any {
		return {
			parent: this.parent,
			timeStamp: this.timeStamp,
			text: this.text
		}
	}

	/**
	 * Static constructor that takes a simple object representation of a checkpoint
	 * @param obj The checkpoint object.
	 */
	public static deserialize(obj: any) : Checkpoint {

		if(!obj.parent || !obj.text || !obj.timeStamp){
			console.error(`Failed to deserilize checkpoint, invalid format:\n${JSON.stringify(obj, null, 2)}`);
			return;
		}

		return Object.assign(new Checkpoint(obj.parent, obj.text), {timestamp: obj.timestamp});
	}
}
