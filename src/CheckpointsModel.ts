'use strict';

import { TextDocument, EventEmitter, Event, ExtensionContext } from 'vscode';
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
	private checkpointStore: Map<string, Array<Checkpoint>>;
    private currentCheckpointContext: string;
    private context: ExtensionContext;

	constructor(context: ExtensionContext) {
		// Initialize the checkpoints map.
        this.checkpointStore = new Map<string, Array<Checkpoint>>();
        
        this.context = context;
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

		// Add the checkoint
		this.checkpointStore.get(document.fileName).push(checkpoint);

		// trigger the event
		this.onDidAddCheckpointEmitter.fire(checkpoint);
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
		}
	}

	/**
	 * Gets all checkpoints for a specific file.
	 * @param fileName the file to get the checkpoint context from
	 */
	getCheckpoints(fileName?: string): Array<Checkpoint> {
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

	get name(): string {
		return new Date(this.timeStamp).toLocaleString();
	}

	get id(): string {
		return this.timeStamp.toString();
	}
}
