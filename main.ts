import { App, Editor, EditorPosition, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, moment, Platform } from 'obsidian';
import {
	ViewUpdate,
	PluginValue,
	EditorView,
	ViewPlugin,
} from "@codemirror/view";

let app: App;
let datepickerIsOpen = false;
class DatepickerCMPlugin implements PluginValue {
	constructor(view: EditorView) {

	}

	private previousCursorPosition: EditorPosition | undefined;
	// start and end index of the matching datetime on the current line
	private startIndex: number;
	private endIndex: number;

	update(update: ViewUpdate) {
		if (datepickerIsOpen) return;
		if (!update.selectionSet) return;
		const { view } = update;
		const editor = app.workspace.getActiveViewOfType(MarkdownView)?.editor;
		const cursorPosition = editor?.getCursor();
		if (cursorPosition === this.previousCursorPosition) return;
		// Safety checks
		if (!app) return;
		if (!cursorPosition) return;
		if (!editor) return;


		/*determine if text around cursor position is a date/time,
		*/

		let rangeAroundCursor = 19;
		function getTextAroundCursor(): string {
			if (!cursorPosition) return "";
			return editor?.getLine(cursorPosition.line)
				.substring(cursorPosition.ch - rangeAroundCursor, cursorPosition.ch + rangeAroundCursor) ?? "";
		}

		let regex = /\d{4}[-\/\\.]{1}\d{1,2}[-\/\\.]{1}\d{1,2}[ T]\d{1,2}:\d{1,2}( )?([apm]{2})/i;
		let formatToUser = "YYYY-MM-DD hh:mm A";
		let formatToPicker = "YYYY-MM-DDTHH:mm";
		let match = getTextAroundCursor().match(regex)?.[0];
		if (!match) {
			rangeAroundCursor = 16;
			regex = /\d{4}[-\/\\.]{1}\d{1,2}[-\/\\.]{1}\d{1,2}[ T]\d{1,2}:\d{1,2}/;
			formatToUser = "YYYY-MM-DD HH:mm";
			match = getTextAroundCursor().match(regex)?.[0];
		}
		if (!match) {
			rangeAroundCursor = 19;
			regex = /\d{1,2}[-\/\\.]{1}\d{1,2}[-\/\\.]{1}\d{4} \d{1,2}:\d{1,2}( )?([apm]{2})/i;
			formatToUser = "DD-MM-YYYY hh:mm A";
			match = getTextAroundCursor().match(regex)?.[0];
		}
		if (!match) {
			rangeAroundCursor = 16;
			regex = /\d{1,2}[-\/\\.]{1}\d{4}[ T]\d{1,2}:\d{1,2}/;
			formatToUser = "DD-MM-YYYY HH:mm";
			match = getTextAroundCursor().match(regex)?.[0];
		}
		if (!match) {
			rangeAroundCursor = 9;
			regex = /\d{4}[-\/\\.]{1}\d{1,2}[-\/\\.]{1}\d{1,2}/;
			formatToUser = "YYYY-MM-DD";
			formatToPicker = "YYYY-MM-DD";
			match = getTextAroundCursor().match(regex)?.[0];
		}
		if (!match) {
			rangeAroundCursor = 9;
			regex = /\d{1,2}[-\/\\.]{1}\d{1,2}[-\/\\.]{1}\d{4}/;
			formatToUser = "DD-MM-YYYY";
			formatToPicker = "YYYY-MM-DD";
			match = getTextAroundCursor().match(regex)?.[0];
		}
		if (!match) this.previousCursorPosition = cursorPosition;
		if (match) {
			this.startIndex = editor.getLine(cursorPosition.line).indexOf(match);
			this.endIndex = this.startIndex + match.length;

			/* This part causes the picker to open only the first time the cursor
			 is placed on a date, it resets once the cursor is moved out of the particular date,
			 it works by checking if the cursor is within the datetime field start and end index
			and also the previous cursor position is within the same datetime field start and end index
			*/
			if (this.previousCursorPosition?.ch != undefined)
				if (cursorPosition.line === this.previousCursorPosition.line
					&& (cursorPosition.ch <= this.endIndex && cursorPosition.ch >= this.startIndex)
					&& (this.previousCursorPosition.ch <= this.endIndex && this.previousCursorPosition.ch >= this.startIndex)
				) return;

			this.previousCursorPosition = cursorPosition;
			//
			const dateToPicker = moment(match, [
				"YYYY-MM-DD hh:mm A"
				, "YYYY-MM-DDThh:mm"
				, "YYYY-MM-DD hh:mma"
				, "YYYY.MM.DD HH:mm"
				, "DD-MM-YYYY HH:mm"
				, "DD-MM-YYYY hh:mm A"
				, "DD-MM-YYYY hh:mma"
			], false)
				.format(formatToPicker);
			/*
				need to delay execution to avoid 
				reading layout during update is not allowed error
				on view.coordsAtPos(cursorPosition)
			*/
			setTimeout(() => {
				const pos = view.coordsAtPos(update.state.selection.main.from)
				if (pos) new DatepickerModal(app, pos, dateToPicker
					, (result) => {
						const dateFromPicker = moment(result).format(formatToUser);
						if(dateFromPicker === match) return;
						editor?.replaceRange(dateFromPicker
							, {
								line: cursorPosition.line, ch: this.startIndex
							}
							, {
								line: cursorPosition.line, ch: this.endIndex
							})
					}).open();
			}, 1)

		}
	}

	destroy() {
		// ...
	}
}

export const datepickerCMPlugin = ViewPlugin.fromClass(DatepickerCMPlugin);


export default class DatepickerPlugin extends Plugin {
	// settings: DatepickerSettings;

	async onload() {
		// await this.loadSettings();
		app = this.app;

		this.registerEditorExtension(datepickerCMPlugin);

		this.addCommand({
			id: 'insert-date',
			name: 'Insert new date',
			editorCallback: (editor: Editor) => {
				// @ts-expect-error, not typed
				const editorView = editor.cm as EditorView;
				const cursorPosition = editorView.state.selection.main.from;
				if (!cursorPosition) return;
				const pos = editorView.coordsAtPos(cursorPosition);
				if (!pos) return;
				if (!datepickerIsOpen) {
					new DatepickerModal(app, { top: pos.top, left: pos.left, right: pos.right, bottom: pos.bottom }
						, "", (result) => {
							editor.replaceSelection(moment(result).format("YYYY-MM-DD"));
						}).open();
				}
			}
		});
		this.addCommand({
			id: 'insert-datetime',
			name: 'Insert new date and time',
			editorCallback: (editor: Editor) => {
				// @ts-expect-error, not typed
				const editorView = editor.cm as EditorView;
				const cursorPosition = editorView.state.selection.main.from;
				if (!cursorPosition) return;
				const pos = editorView.coordsAtPos(cursorPosition);
				if (!pos) return;
				if (!datepickerIsOpen) {
					new DatepickerModal(app, { top: pos.top, left: pos.left, right: pos.right, bottom: pos.bottom }
						, "dateandtime", (result) => {
							editor.replaceSelection(moment(result).format("YYYY-MM-DD hh:mm A"));
						}).open();
				}
			}
		});
	}

	onunload() {

	}
}


class DatepickerModal extends Modal {
	private pos: { top: number, left: number, right: number, bottom: number };
	private datetime: string;
	onSubmit: (result: string) => void;
	private escPressed = false;

	constructor(app: App, pos: { top: number, left: number, right: number, bottom: number }, datetime: string, onSubmit: (result: string) => void) {
		super(app);
		this.pos = pos;
		this.datetime = datetime;
		this.onSubmit = onSubmit;
	}

	private pickerInput = document.createElement('input');;
	onOpen() {
		datepickerIsOpen = true;
		// this works to stop the workspace from getting a dark effect when opening the modal
		setTimeout(() => {
			const modalbg: HTMLElement | null = document.querySelector('.modal-bg');
			modalbg?.setAttribute('style', 'opacity: 0');
		}, 1);


		const { modalEl } = this;
		modalEl.empty();
		modalEl.style.position = 'fixed';
		modalEl.style.minWidth = '0px';
		modalEl.style.minHeight = '0px';
		modalEl.style.maxWidth = '225px';
		// Fix for modal being too tall on mobile (only tested on android)
		if (Platform.isMobile) {
					modalEl.style.maxHeight = '30px';
		}
		modalEl.addEventListener('keydown', (event) => {
			if (event.key === 'Escape') {
				this.escPressed = true;
			}
		})
		const { pickerInput } = this;
		if (this.datetime.length <= 10) pickerInput.type = 'date';
		else pickerInput.type = 'datetime-local';

		pickerInput.value = this.datetime;
		pickerInput.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') {
				event.preventDefault();
				this.close();
			}
		});

		modalEl.style.width = pickerInput.style.width;
		modalEl.style.height = pickerInput.style.height;
		modalEl.appendChild(pickerInput);

		// this makes sure the modal doesn't go out of the window or draws out of screen bounds
		// TODO: add support for rtl windows: pseudo:if(window.rtl)
		const appWindowSize = app.workspace.containerEl.getBoundingClientRect();
		if (this.pos.bottom + modalEl.getBoundingClientRect().height > appWindowSize.height) {
			modalEl.style.top = (this.pos.top - modalEl.getBoundingClientRect().height) + 'px';
		} else modalEl.style.top = this.pos.bottom + 'px';

		if (this.pos.left + modalEl.getBoundingClientRect().width > appWindowSize.width) {
			modalEl.style.left = (this.pos.left - modalEl.getBoundingClientRect().width) + 'px';
		} else modalEl.style.left = this.pos.left + 'px';

	}

	onClose() {
		const { modalEl } = this;
		modalEl.empty();
		// Must use delay, else this will execute before esc key event listener
		// and the !this.escPressed will not work
		setTimeout(() => {
			if (!this.escPressed) {
				this.onSubmit(this.pickerInput.value);
			}
			datepickerIsOpen = false;
		}, 10)
	}
}


/*
TODOS:
- fix bug with dates in tables in preview mode not working 100%
   correctly
*/