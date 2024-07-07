import { App, Editor, Plugin, PluginSettingTab, Setting, moment, Platform } from 'obsidian';
import {
	ViewUpdate,
	PluginValue,
	EditorView,
	ViewPlugin,
} from "@codemirror/view";


class DatepickerCMPlugin implements PluginValue {

	private view: EditorView;
	private previousDocumentTop: number | undefined;
	datepickerScrollPositionHandler = () => {
		const datepickerContainer = activeDocument.getElementById('datepicker-container');
		if (datepickerContainer) {
			const { documentTop } = this.view;
			if (this.previousDocumentTop === undefined) {
				this.previousDocumentTop = documentTop;
				return;
			}
			console
			datepickerContainer.style.top =
				`${parseFloat(datepickerContainer.style.top) + documentTop - this.previousDocumentTop}px`;
			this.previousDocumentTop = documentTop;

		} else this.previousDocumentTop = undefined;
	}

	constructor(view: EditorView) {
		this.view = view;
		view.scrollDOM.addEventListener("scroll", this.datepickerScrollPositionHandler);
	}

	// start and end index of the matching datetime on the current line
	private startIndex: number;
	private endIndex: number;

	update(update: ViewUpdate) {
		/*
			CM fires two update events for selection change,
			I use the below code section to ignore the second one
			otherwise the datepicker flashes as it closes and reopens
		*/
		if (update.docChanged === false &&
			update.state.selection.main.from === update.startState.selection.main.from &&
			update.state.selection.main.to === update.startState.selection.main.to
		) return;
		//

		const datepicker = new Datepicker();
		const { view } = update;
		const columnNumber = view.state.selection.ranges[0].head - view.state.doc.lineAt(view.state.selection.main.head).from;
		const cursorPosition = view.state.selection.main.head;
		const line = view.state.doc.lineAt(cursorPosition);

		/*determine if text around cursor position is a date/time,
		*/

		let rangeAroundCursor = 19;
		function getTextAroundCursor(): string {
			return line.text.substring(columnNumber - rangeAroundCursor, columnNumber + rangeAroundCursor - 1) ?? "";
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
			rangeAroundCursor = 10;
			regex = /\d{4}[-\/\\.]{1}\d{1,2}[-\/\\.]{1}\d{1,2}/;
			formatToUser = "YYYY-MM-DD";
			formatToPicker = "YYYY-MM-DD";
			match = getTextAroundCursor().match(regex)?.[0];
		}
		if (!match) {
			rangeAroundCursor = 10;
			regex = /\d{1,2}[-\/\\.]{1}\d{1,2}[-\/\\.]{1}\d{4}/;
			formatToUser = "DD-MM-YYYY";
			formatToPicker = "YYYY-MM-DD";
			match = getTextAroundCursor().match(regex)?.[0];
		}
		if (match) {
			this.startIndex = line.text.indexOf(match);
			this.endIndex = this.startIndex + match.length;

			//
			const dateToPicker = moment(match, [
				"YYYY-MM-DD hh:mm A"
				, "YYYY-MM-DDThh:mm"
				, "YYYY-MM-DD hh:mma"
				, "YYYY.MM.DD HH:mm"
				, "DD-MM-YYYY HH:mm"
				, "DD-MM-YYYY hh:mm A"
				, "DD-MM-YYYY hh:mma"
			], false).format(formatToPicker);

			view.requestMeasure({
				read: state => {
					let pos = state.coordsAtPos(cursorPosition);
					return pos;
				},
				write: pos => {
					if (!pos) return;
					datepicker.open(pos, dateToPicker
						, (result) => {
							const resultFromPicker = moment(result);
							if (!resultFromPicker.isValid()) return;
							const dateFromPicker = resultFromPicker.format(formatToUser);
							if (dateFromPicker === match) return;
							view.dispatch({
								changes: {
									from: line.from + this.startIndex,
									to: line.from + this.endIndex,
									insert: dateFromPicker
								}
							})
						});
				}
			});
		}
	}

	destroy() {
		// ...
	}
}
export const datepickerCMPlugin = ViewPlugin.fromClass(DatepickerCMPlugin);

interface DatepickerPluginSettings {
	immediatelyShowCalendar: boolean;
	autofocus: boolean;
	focusOnArrowDown: boolean;
}

const DEFAULT_SETTINGS: DatepickerPluginSettings = {
	immediatelyShowCalendar: false,
	autofocus: false,
	focusOnArrowDown: false,
}

export default class DatepickerPlugin extends Plugin {

	public static settings: DatepickerPluginSettings = DEFAULT_SETTINGS;

	async onload() {

		await this.loadSettings();

		this.registerEditorExtension(datepickerCMPlugin);

		this.addCommand({
			id: 'insert-date',
			name: 'Insert new date',
			editorCallback: (editor: Editor) => {
				// @ts-expect-error, not typed
				const editorView = editor.cm as EditorView;
				const cursorPosition = editorView.state.selection.main.to;
				if (cursorPosition === undefined) return;
				const pos = editorView.coordsAtPos(cursorPosition);
				if (!pos) return;

				const datepicker = new Datepicker()
				datepicker.open(
					{ top: pos.top, left: pos.left, right: pos.right, bottom: pos.bottom },
					"", (result) => {
						editor.replaceSelection(moment(result).format("YYYY-MM-DD"));
					}
				)
				datepicker.focus();
			}
		});
		this.addCommand({
			id: 'insert-datetime',
			name: 'Insert new date and time',
			editorCallback: (editor: Editor) => {
				// @ts-expect-error, not typed
				const editorView = editor.cm as EditorView;
				const cursorPosition = editorView.state.selection.main.to;
				if (cursorPosition === undefined) return;
				const pos = editorView.coordsAtPos(cursorPosition);
				if (!pos) return;
				const datepicker = new Datepicker();
				datepicker.open(
					{ top: pos.top, left: pos.left, right: pos.right, bottom: pos.bottom },
					"DATEANDTIME", (result) => {
						editor.replaceSelection(moment(result).format("YYYY-MM-DD hh:mm A"));
					}
				)
				datepicker.focus();
			}
		});

		this.addSettingTab(new DatepickerSettingTab(this.app, this));
	}

	onunload() {
	}

	async loadSettings() {
		DatepickerPlugin.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(DatepickerPlugin.settings);
	}

}

class Datepicker {

	private onSubmit: (result: string) => void;
	private isOpen = false;
	private pickerContainer: HTMLSpanElement;
	private pickerInput: HTMLInputElement;

	constructor() {
		this.closeAll();
	}

	public isOpened(): boolean {
		return this.isOpen;
	}

	public updatePosition(pos: { top: number, left: number, right: number, bottom: number }) {
		// this makes sure the modal doesn't go out of the window or draws out of screen bounds
		// TODO: add support for rtl windows: pseudo:if(window.rtl)
		if (pos.bottom + this.pickerContainer.getBoundingClientRect().height > activeWindow.innerHeight) {
			this.pickerContainer.style.top = (pos.top - this.pickerContainer.getBoundingClientRect().height) + 'px';
		} else this.pickerContainer.style.top = pos.bottom + 'px';
		if (pos.left + this.pickerContainer.getBoundingClientRect().width > activeWindow.innerWidth) {
			this.pickerContainer.style.left = (pos.left - this.pickerContainer.getBoundingClientRect().width) + 'px';
		} else this.pickerContainer.style.left = pos.left + 'px';


	}

	public focus() {
		activeDocument.getElementById('datepicker-input')?.focus();
	}

	public closeAll() {
		let datepickers = activeDocument.getElementsByClassName("datepicker-widget");
		for (var i = 0; i < datepickers.length; i++) {
			datepickers[i].remove();
		}
	}

	public open(pos: { top: number, left: number, right: number, bottom: number },
		datetime: string, onSubmit: (result: string) => void
	) {
		this.onSubmit = onSubmit;

		this.pickerContainer = activeDocument.body.createEl('span');
		this.pickerContainer.className = 'datepicker-widget';
		this.pickerContainer.id = 'datepicker-container';
		this.pickerContainer.empty();
		this.pickerInput = this.pickerContainer.createEl('input');
		if (datetime.length <= 10) this.pickerInput.type = 'date';
		else this.pickerInput.type = 'datetime-local';
		this.pickerInput.id = 'datepicker-input';
		this.pickerInput.value = datetime;

		const controller = new AbortController();
		this.pickerContainer.parentElement?.addEventListener('keydown', keypressHandler, { signal: controller.signal, capture: true });
		function keypressHandler(event: KeyboardEvent) {
			if (event.key === 'ArrowDown') {
				if (DatepickerPlugin.settings.focusOnArrowDown) {
					event.preventDefault();
					this.doc.getElementById('datepicker-input')?.focus();
					controller.abort();
				}
			}
			if (event.key === 'Escape') {
				this.doc.getElementById('datepicker-container')?.remove();
				controller.abort();
			}
		}

		this.pickerInput.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') {
				this.onSubmit(this.pickerInput.value);
				this.closeAll();
			}
			if (event.key === 'Escape') {
				this.closeAll();
			}
		});

		this.updatePosition(pos);
		activeDocument.body.appendChild(this.pickerContainer);

		// On mobile, the calendar doesn't show up the first time the input is touched,		
		// unless the element is focused, and focusing the element causes unintended closing
		// of keyboard, so I implement event listeners and prevent default behavior.
		if (Platform.isMobile) {
			this.pickerInput.addEventListener('touchstart', (e) => {
				e.preventDefault();
			})
			this.pickerInput.addEventListener('touchend', (e) => {
				e.preventDefault();
				(this.pickerInput as any).showPicker();
			});
		}

		if (DatepickerPlugin.settings.autofocus) this.pickerInput.focus();

		// delay is necessary because showing immediately doesn't show the calendar
		// in the correct position, maybe it shows the calendar before the dom is updated
		setTimeout(() => {
			if (DatepickerPlugin.settings.immediatelyShowCalendar)
				(this.pickerInput as any).showPicker();
		}, 20)

		this.isOpen = true;
	}

}

class DatepickerSettingTab extends PluginSettingTab {
	plugin: DatepickerPlugin;

	constructor(app: App, plugin: DatepickerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl: settingsContainerElement } = this;

		settingsContainerElement.empty();

		new Setting(settingsContainerElement)
			.setName('Immediately show calendar')
			.setDesc('Immediately show the calendar when the datepicker appears')
			.addToggle((toggle) => toggle
				.setValue(DatepickerPlugin.settings.immediatelyShowCalendar)
				.onChange(async (value) => {
					DatepickerPlugin.settings.immediatelyShowCalendar = value;
					await this.plugin.saveSettings();
				}));

		new Setting(settingsContainerElement)
			.setName('Autofocus')
			.setDesc('Automatically focus the datepicker whenever the datepicker opens')
			.addToggle((toggle) => toggle
				.setValue(DatepickerPlugin.settings.autofocus)
				.onChange(async (value) => {
					DatepickerPlugin.settings.autofocus = value;
					await this.plugin.saveSettings();
				}));

		new Setting(settingsContainerElement)
			.setName('Focus on pressing down arrow')
			.setDesc('Focuses the datepicker when the down arrow is pressed')
			.addToggle((toggle) => toggle
				.setValue(DatepickerPlugin.settings.focusOnArrowDown)
				.onChange(async (value) => {
					DatepickerPlugin.settings.focusOnArrowDown = value;
					await this.plugin.saveSettings();
				}));

	}
}
