import { App, Editor, Plugin, PluginSettingTab, Setting, moment, Platform } from 'obsidian';
import {
	ViewUpdate,
	PluginValue,
	EditorView,
	ViewPlugin,
} from "@codemirror/view";


class DatepickerCMPlugin implements PluginValue {

	constructor(view: EditorView) {
	}

	// start and end index of the matching datetime on the current line
	private startIndex: number;
	private endIndex: number;

	update(update: ViewUpdate) {
		if (!update.selectionSet) return;

		const { view } = update;
		const columnNumber = view.state.selection.ranges[0].head - view.state.doc.lineAt(view.state.selection.main.head).from;
		const cursorPosition = view.state.selection.main.head;
		const line = view.state.doc.lineAt(cursorPosition);
		const datepicker = new Datepicker();

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
					if (pos) datepicker.open(pos, dateToPicker
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
}

const DEFAULT_SETTINGS: DatepickerPluginSettings = {
	immediatelyShowCalendar: false,
	autofocus: false
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

	constructor() {
		this.closeAll();
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

		const pickerContainer = activeDocument.body.createEl('div');
		pickerContainer.className = 'datepicker-widget';
		pickerContainer.id = 'datepicker-container';
		pickerContainer.empty();
		const pickerInput = pickerContainer.createEl('input');
		if (datetime.length <= 10) pickerInput.type = 'date';
		else pickerInput.type = 'datetime-local';
		pickerInput.id = 'datepicker-input';
		pickerInput.value = datetime;

		const controller = new AbortController();
		pickerContainer.parentElement?.addEventListener('keydown', keypressHandler, { signal: controller.signal, capture: true });
		function keypressHandler(event: KeyboardEvent) {
			if (event.key === 'ArrowDown') {
				event.preventDefault();
				this.doc.getElementById('datepicker-input')?.focus();
				controller.abort();
			}
			if (event.key === 'Escape') {
				this.doc.getElementById('datepicker-container')?.remove();
				controller.abort();
			}
		}

		pickerInput.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') {
				this.onSubmit(pickerInput.value);
				this.closeAll();
			}
			if (event.key === 'Escape') {
				this.closeAll();
			}
		});

		// this makes sure the modal doesn't go out of the window or draws out of screen bounds
		// TODO: add support for rtl windows: pseudo:if(window.rtl)
		if (pos.bottom + pickerContainer.getBoundingClientRect().height > activeWindow.innerHeight) {
			pickerContainer.style.top = (pos.top - pickerContainer.getBoundingClientRect().height) + 'px';
		} else pickerContainer.style.top = pos.bottom + 'px';
		if (pos.left + pickerContainer.getBoundingClientRect().width > activeWindow.innerWidth) {
			pickerContainer.style.left = (pos.left - pickerContainer.getBoundingClientRect().width) + 'px';
		} else pickerContainer.style.left = pos.left + 'px';

		activeDocument.body.appendChild(pickerContainer);

		if (Platform.isMobile) {
			pickerInput.focus();
		} else if (DatepickerPlugin.settings.autofocus) pickerInput.focus();

		// delay is necessary because showing immediately doesn't show the calendar
		// in the correct position, maybe it shows the calendar before the dom is updated
		setTimeout(() => {
			if (DatepickerPlugin.settings.immediatelyShowCalendar) pickerInput.showPicker();
		}, 10)

	}

}

class DatepickerSettingTab extends PluginSettingTab {
	plugin: DatepickerPlugin;

	constructor(app: App, plugin: DatepickerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Immediately show calendar')
			.setDesc('Immediately show the calendar when the datepicker appears')
			.addToggle((toggle) => toggle
				.setValue(DatepickerPlugin.settings.immediatelyShowCalendar)
				.onChange(async (value) => {
					DatepickerPlugin.settings.immediatelyShowCalendar = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Autofocus')
			.setDesc('Automatically focus the datepicker whenever the datepicker appears')
			.addToggle((toggle) => toggle
				.setValue(DatepickerPlugin.settings.autofocus)
				.onChange(async (value) => {
					DatepickerPlugin.settings.autofocus = value;
					await this.plugin.saveSettings();
				}));
	}
}
