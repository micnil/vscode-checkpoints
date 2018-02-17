'use strict';

import { TextDocument, EventEmitter, Event, ExtensionContext, workspace, window, Uri } from 'vscode';
import * as path from 'path';

export interface ICheckpoint {

	/** 
	 * The id of the checkpoint 
	*/
	id: string,

	/**
	 * Typically the file this checkpoint belongs to
	 */
	parent: string,

	/**
	 * The timestamp for when the checkpoint was created
	 */
	timestamp: number,

	/** 
	 * The name used for labels and such.
	*/
	name: string,

	/**
	 * The text content of the checkpoint.
	 */
	text: string,
}

export interface IFile {

	/** 
	 * Typically the file's absolute path. But we want to call
	 * this id so that we can support unsaved files later on.
	*/
	id: string,

	/**
	 * The short name to use.
	 */
	name: string,

	/** 
	 * If the name prop has duplicates, use this extra part
	 * to distinguish betweeen them.
	*/
	extraName: string,

	/** 
	 * list of all file IDs with duplicate names.
	*/
	fileNameDuplicates: string[],

	/** 
	 * The list of checkpoint IDs that
	 * belong to this file.
	*/
	checkpointIds: string[];
}

/** 
 * A normalized redux-like store datastructure 
 * (https://redux.js.org/docs/recipes/reducers/NormalizingStateShape.html) 
 * to keep track of the checkpoints state. The datastructure must
 * be JSON serializable.
*/
export interface ICheckpointStore {
    files: {
		byId: {
			// Any number of string IDs with File values
			[id: string]: IFile,
		};
		allIds: string[],
	}
	checkpoints: {
		byId: {
			// Any number of string IDs with Checkpoint values
			[id: string]: ICheckpoint,
		}
		allIds: string[],
	}
}

/**
 * Maps all files to an array of checkpoints and updates storage
 */
export class CheckpointsModel {

	// Events
	private onDidAddCheckpointEmitter = new EventEmitter<ICheckpoint>();
	get onDidAddCheckpoint(): Event<ICheckpoint> {
		return this.onDidAddCheckpointEmitter.event;
	}

	private onDidRemoveCheckpointEmitter = new EventEmitter<ICheckpoint | IFile | ICheckpointStore>();
	get onDidRemoveCheckpoint(): Event<ICheckpoint | IFile | ICheckpointStore> {
		return this.onDidRemoveCheckpointEmitter.event;
	}

	private onDidChangeCheckpointContextEmitter = new EventEmitter<Uri>();
	get onDidChangeCheckpointContext(): Event<Uri> {
		return this.onDidChangeCheckpointContextEmitter.event;
	}

	private onDidUpdateItemEmitter = new EventEmitter<ICheckpoint | IFile>();
	get onDidUpdateItem(): Event<ICheckpoint | IFile> {
		return this.onDidUpdateItemEmitter.event;
	}

	// Fields
	private checkpointStore: ICheckpointStore;
    private currentCheckpointContext: Uri;
	private context: ExtensionContext;
	private readonly maxLengthFileName: 15; 

	constructor(context: ExtensionContext) {
		this.context = context;

		// Initialize the checkpoints map from workspace state or empty.
		this.checkpointStore = this.context.workspaceState.get("checkpointsStore", this.createEmptyStore());
	}

	/**
	 * Sets a new checkpoint context you want the tree view to operate on.
	 * @param fileUri The file's uri
	 */
	set checkpointContext(fileUri: Uri) {

		// Save the key to the current checkpoint
		this.currentCheckpointContext = fileUri;

		// Fire the event if this is not the checkpoints document view.
		if (fileUri.scheme !== 'checkpointsDocumentView') {
			this.onDidChangeCheckpointContextEmitter.fire(this.currentCheckpointContext);
		}
	}

	/**
	 * gets the checkpoint context the tree view should operate on (current open file)
	 */
	get checkpointContext(): Uri {
		return this.currentCheckpointContext;
	}

	/**
	 * Get all keys (files) from the checkpoint map
	 */
	get files(): string[] {
		return this.checkpointStore.files.allIds;
	}

	/**
	 * Adds the current state of the document to the current checkpoint context.
	 * @param document The document to save
	 */
	add(document: TextDocument, name: string, timestamp: number): void {
		console.log(`Adding file '${document.fileName}' to checkpoint store.`);
		
		// If there is no entry for this document, then create one
		if (!this.checkpointStore.files.byId[document.fileName]) {

			// Set file name and extra name (truncated relative path)

			// First create an uri object of the file path
			let fileUri = Uri.file(document.fileName);
			// Get the relative path from workspace root to the file. 
			let relativeFilePath = workspace.asRelativePath(fileUri);
			// Remove the active file name and use as extra name.
			let extraName = path.dirname(relativeFilePath);
			// Truncate the name if it is too long
			if (extraName.length > this.maxLengthFileName) {
				extraName = '...' + extraName.substr(
					extraName.length - this.maxLengthFileName, 
					extraName.length - 1
				);
			}

			let baseName = path.basename(document.fileName);

			// create the file
			let file: IFile = {
				id: document.fileName,
				name: baseName,
				extraName: extraName,
				fileNameDuplicates: [],
				checkpointIds: []
			}

			this.handleNewDuplicates(file);
			this.checkpointStore.files.byId[file.id] = file;
			this.checkpointStore.files.allIds.push(file.id);
		}

		// create the checkpoint
		let checkpoint: ICheckpoint = {
			parent: document.fileName,
			timestamp: timestamp,
			text: document.getText(),
			name: name,
			id: timestamp.toString(),
		}

		// Add the checkpoint to the checkpoint store
		this.checkpointStore.checkpoints.byId[checkpoint.id] = checkpoint;
		this.checkpointStore.checkpoints.allIds.push(checkpoint.id);

		// Reference the checkpoint in the file
		this.checkpointStore.files.byId[checkpoint.parent].checkpointIds.push(checkpoint.id)

		this.onDidAddCheckpointEmitter.fire(checkpoint);

		this.updateWorkspaceState(this.checkpointStore);
	}

	/**
	 * Deletes all checkpoints, all from a file or one
	 * checkpoint from the store.
	 * @param id optional id of the checkpoint or file to remove
	 */
	remove(id?: string): void {
		console.log("Removing checkpoint(s)");
		let removedItem: ICheckpoint | IFile | ICheckpointStore;

		// Labeled block that exits as soon as we removed the item.
		itemRemoved: {

			// If id undefined, delete all checkpoints.  
			if (!id) {
				removedItem = this.clearAll();
				break itemRemoved;
			}
			
			// If id represents a file, clear the file of all checkpoints.
			let file: IFile = this.getFile(id);
			if (file) {
				removedItem = this.clearFile(id);
				break itemRemoved;
			}

			// If id represents a checkpoint, delete the checkpoint
			let checkpoint: ICheckpoint = this.getCheckpoint(id);
			if (checkpoint) {
				removedItem = this.deleteCheckpoint(id);
				break itemRemoved;
			}
		}

		if(!removedItem) {
			console.warn("The item/items to remove were not found");
			return;
		}
	
		this.onDidRemoveCheckpointEmitter.fire(removedItem);
		this.updateWorkspaceState(this.checkpointStore);
	}

	/**
	 * Gets all checkpoints or all for a specific file.
	 * @param fileId optional file id to get checkpoints from
	 */
	getCheckpoints(fileId?: string): ICheckpoint[] {

		// The checkpoint IDs to get.
		let checkpointsIds: string[];

		if (!fileId) {
			// All checkpoints
			checkpointsIds = this.checkpointStore.checkpoints.allIds;
		} else {
			// All checkoints from a specific file
			const file = this.checkpointStore.files.byId[fileId];
			checkpointsIds = file ? file.checkpointIds : []; 
		}

		// Get the checkpoints by their ID
		let checkpoints = [];
		for (let checkpointId of checkpointsIds) {
			checkpoints.push(this.getCheckpoint(checkpointId));
		}

		return checkpoints;
	}

	/**
	 * Get a checkpoint from the checkpoint store
	 * @param id The id of the checkpoint
	 */
	getCheckpoint(id: string): ICheckpoint {
		return this.checkpointStore.checkpoints.byId[id];
	}

	/**
	 * Get a file from the checkpoint store.
	 * @param id The id of the file
	 */
	getFile(id: string): IFile {
		return this.checkpointStore.files.byId[id];
	}

	/**
	 * Rename a specific checkpoint to a new name.
	 * @param id The id of the checkpoint
	 * @param newName The name to set
	 */
	renameCheckpoint(id: string, newName: string): void {
		console.log(`Renaming checkpoint with id '${id}' to ${newName}`)
		let checkpoint: ICheckpoint = this.getCheckpoint(id);
		checkpoint.name = newName;
		this.onDidUpdateItemEmitter.fire(checkpoint);
	}

	/**
	 * Deletes a checkpoint from the model.
	 * @param id The id of the checkpoint
	 */
	private deleteCheckpoint(id: string) : ICheckpoint {
		console.log(`deleting checkpoint with id  '${id}'`);

		// get the checkpoint
		let checkpoint = this.getCheckpoint(id);
		if (!checkpoint) {
			console.error(`The checkpoint with id: '${id}' does not exist`);
			return;
		}

		// Remove the checkpoint
		delete this.checkpointStore.checkpoints.byId[checkpoint.id];

		// Remove the checkpoint id from the allIds array
		let cpToRemoveIndex = this.checkpointStore.checkpoints.allIds.findIndex( id => id == checkpoint.id);
		this.checkpointStore.checkpoints.allIds.splice(cpToRemoveIndex, 1); 

		// Get the file
		let file = this.getFile(checkpoint.parent);
		if (!file) {
			console.error(`Unable to find the file: ${checkpoint.parent} that the checkpoint belongs to.`);
			return checkpoint;
		}

		// Remove the checkpoint reference from the file
		file.checkpointIds = file.checkpointIds.filter( id => id !== checkpoint.id);

		// If the file is now empty of checkpoints, remove the file from store
		if (file.checkpointIds.length === 0) {
			delete this.checkpointStore.files.byId[file.id];
			let fileToRemoveIndex = this.checkpointStore.files.allIds.findIndex( id => id == file.id);
			this.checkpointStore.files.allIds.splice(fileToRemoveIndex, 1); 
			this.handleRemovedDuplicates(file);
		}

		return checkpoint;
	}

	/**
	 * Deletes all checkpoint that belongs to the a specific file
	 * @param id The file id
	 */
	private clearFile(id: string) : IFile {
		console.log(`clearing checkpoints from file with id: '${id}'`);

		let file = this.getFile(id);

		if (!file) {
			console.error(`The file with '${id}' does not exist`);
			return;
		}

		// Delete all checkpoints that belong to the file
		for (let checkpointId of file.checkpointIds) {
			this.deleteCheckpoint(checkpointId);
		}

		return file;
	}

	/** 
	 * Clears the entire checkpoint store, and updates the workspace state.
	*/
	private clearAll(): ICheckpointStore {
		this.checkpointStore = this.createEmptyStore();
		this.updateWorkspaceState(this.checkpointStore);
		return this.checkpointStore;
	}

	/**
	 * Serializes and updates the workspace state with the checkpoint store. 
	 * @param checkpointStore the checkpoint store
	 */
	private updateWorkspaceState(checkpointStore: ICheckpointStore) {
		this.context.workspaceState.update("checkpointsStore", this.checkpointStore)
			.then( success => {
				
				if(!success){
					console.error("Failed to update storage. Will not persist the session!")
					window.showWarningMessage("Failed to update the checkpoint store to workspace storage.");
					return;
				}
			}
		);
	}

	/**
	 * Checks the store of a previously removed file
	 * had any file name duplicates, and if it does,
	 * unmarks itself from their fileNameDuplicates array.
	 * @param removedFile The file that has been removed.
	 */
	private handleRemovedDuplicates(removedFile: IFile) {

		for (let fileId of removedFile.fileNameDuplicates) {
			let duplicatefile = this.checkpointStore.files.byId[fileId];

			let removeIndex = duplicatefile.fileNameDuplicates.findIndex( id => id === removedFile.id);

			// Not found
			if(removeIndex === -1) {
				console.error(
					`The removed file has marked ${duplicatefile.name} as duplicate,
					 but this was not mutual`
				);
			}

			duplicatefile.fileNameDuplicates.splice(removeIndex, 1);
		}
	}

	/**
	 * Checks the store if the new (not-yet added) file
	 * has any duplicate file names, and adds their 
	 * respective IDs to their fileNameDuplicates arrays
	 * if they do.
	 * @param newFile The file that WILL be added
	 */
	private handleNewDuplicates(newFile: IFile) {
		for (let fileId of this.checkpointStore.files.allIds) {
			let file = this.checkpointStore.files.byId[fileId];

			// If this is not a duplicate, just continue;
			if (newFile.name !== file.name) {
				continue;
			}

			// This file is a duplicate
			newFile.fileNameDuplicates.push(file.id)
			file.fileNameDuplicates.push(newFile.id);
		}
	}


	/** 
	 * Helper method to create an empty store object.
	*/
	private createEmptyStore(): ICheckpointStore {
		return {
			files: {
				byId: {},
				allIds: []
			},
			checkpoints: {
				byId: {},
				allIds: []				
			}
		}
	}
}